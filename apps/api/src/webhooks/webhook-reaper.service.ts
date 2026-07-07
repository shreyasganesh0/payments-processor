import {
    Inject,
    Injectable,
    OnModuleInit,
    OnApplicationShutdown,
} from '@nestjs/common';

import { config } from '../config';
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/database.types';
import { WEBHOOKS_QUEUE } from '../queue/queue.constants';
import { webhookDeliveries } from '../database/schema';

import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { and, inArray, lt, sql } from 'drizzle-orm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

const REAPER_INTERVAL_MS = config.webhooks.reaperIntervalMs;
// A delivery still pending/failed past its due time by this long is presumed stranded
// (its driving job was lost). Staleness is keyed off next_attempt_at — or created_at for a
// never-attempted row — so this need only exceed ONE attempt's execution window
// (http timeout + queue slack), not the cumulative backoff.
const REAPER_DEADLINE_MS = config.webhooks.reaperDeadlineMs;

// Recovery net for webhook deliveries whose driving job was lost — e.g. a crash between the
// processor's status write and its retry enqueue (webhook.processor.ts), or a dropped enqueue.
// The webhook analog of ReaperService. Runs in the relay process alongside the relay,
// dispatcher, and payment reaper. Mirrors their self-scheduling poll loop.
@Injectable()
export class WebhookReaperService implements OnModuleInit, OnApplicationShutdown {

    private timer?: ReturnType<typeof setTimeout>;

    constructor(
        @Inject(DRIZZLE) private readonly db: DrizzleDB,
        @InjectQueue(WEBHOOKS_QUEUE) private readonly queue: Queue,
        @InjectPinoLogger(WebhookReaperService.name) private readonly logger: PinoLogger,
    ) {}

    onModuleInit() {
        this.scheduleNext();
    }

    private scheduleNext() {
        this.timer = setTimeout(() => this.tick(), REAPER_INTERVAL_MS);
    }

    private async tick() {
        try { await this.reap_once(); }
        catch { /* swallow — a bad poll must not kill the loop */ }
        finally { this.scheduleNext(); }
    }

    private async reap_once() {

        // Claim stranded deliveries. skipLocked partitions work across relay replicas so two
        // reapers never re-drive the same row. A delivery is stranded when it is still
        // non-terminal AND its due time (next_attempt_at, else created_at) is past the deadline.
        const stuck = await this.db.transaction(async tx => {
            const rows = await tx.select({
                id: webhookDeliveries.id,
                status: webhookDeliveries.status,
                attempts: webhookDeliveries.attempts,
            })
            .from(webhookDeliveries)
            .where(and(
                inArray(webhookDeliveries.status, ['pending', 'failed']),
                lt(
                    sql`COALESCE(${webhookDeliveries.nextAttemptAt}, ${webhookDeliveries.createdAt})`,
                    new Date(Date.now() - REAPER_DEADLINE_MS),
                ),
            ))
            .for('update', { skipLocked: true })
            .limit(100);

            return rows;
        });

        if (stuck.length === 0) return;

        // Enqueue AFTER commit — a lost re-enqueue is simply caught on the next tick. Unlike the
        // payment reaper there is NO status flip (the processor's `if (delivered||dead) return`
        // guard makes pending/failed rows directly re-processable) and NO audit event (there is
        // no payment_events analog for deliveries).
        await Promise.all(stuck.map(d => {
            // Reconstruct the jobId the normal path would have used, so that if that job is
            // still alive (e.g. a retry sitting in the delayed set) BullMQ dedups and we do NOT
            // double-send — only a genuinely lost job gets recreated. pending (attempts 0) → the
            // dispatcher's initial jobId (d.id); failed (attempts N) → the processor's
            // `${id}:retry:${N}`. Terminal jobs are evicted (queue.module) so a stale completed/
            // failed job can't wedge this id.
            const jobId = d.attempts === 0 ? d.id : `${d.id}:retry:${d.attempts}`;
            this.logger.info(
                { deliveryId: d.id, status: d.status, attempts: d.attempts, jobId },
                'webhook delivery reaped',
            );
            return this.queue.add('webhook.deliver', { deliveryId: d.id }, { jobId });
        }));
    }

    onApplicationShutdown() {
        clearTimeout(this.timer);
    }
}
