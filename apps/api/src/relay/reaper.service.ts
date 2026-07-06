import {
    Inject,
    Injectable,
    OnModuleInit,
    OnApplicationShutdown,
} from '@nestjs/common';

import { config } from '../config';
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/database.types';
import { PAYMENTS_QUEUE } from '../queue/queue.constants';
import { payments, paymentEvents } from '../database/schema';

import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { and, inArray, lt, sql } from 'drizzle-orm';
import { ulid } from 'ulid';

const REAPER_INTERVAL_MS = config.relay.reaperIntervalMs;
// a payment stuck in PROCESSING/RETRYING longer than this is presumed stranded
const REAPER_DEADLINE_MS = config.relay.reaperDeadlineMs;

// Recovery net for the strand windows in ADR-007. Runs in the relay process
// (alongside the relay + dispatcher). Mirrors RelayService's self-scheduling
// poll loop.
@Injectable()
export class ReaperService implements OnModuleInit, OnApplicationShutdown {

    private timer?: ReturnType<typeof setTimeout>;

    constructor(
        @Inject(DRIZZLE) private readonly db: DrizzleDB,
        @InjectQueue(PAYMENTS_QUEUE) private readonly queue: Queue,
    ) {};

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

        const claimed = await this.db.transaction(async tx => {

            const stuck = await tx.select({
                id: payments.id,
                status: payments.status,
                amountCents: payments.amountCents,
                currency: payments.currency,
            })
            .from(payments)
            .where(and(
                inArray(payments.status, ['PROCESSING', 'RETRYING']),
                lt(payments.updatedAt, new Date(Date.now() - REAPER_DEADLINE_MS)),
            ))
            .for('update', { skipLocked: true })
            .limit(100);

            if (stuck.length === 0) return [];

            // a PROCESSING row can't be re-claimed by the worker
            // (canTransition PROCESSING->PROCESSING is false), so un-strand it to RETRYING first
            const processingIds = stuck
                .filter(s => s.status === 'PROCESSING')
                .map(s => s.id);

            if (processingIds.length > 0) {

                await tx.update(payments)
                    .set({
                        status: 'RETRYING',
                        version: sql`${payments.version} + 1`,
                        updatedAt: new Date(),
                    })
                    .where(inArray(payments.id, processingIds));

                await tx.insert(paymentEvents).values(
                    processingIds.map(id => ({
                        id: ulid(),
                        paymentId: id,
                        fromStatus: 'PROCESSING' as const,
                        toStatus: 'RETRYING' as const,
                        metadata: { reason: 'reaped' },
                        correlationId: null,
                    })),
                );
            }

            return stuck;
        });

        // AFTER commit: enqueue one re-drive job per claimed payment (jobId unique
        // per attempt or BullMQ dedups it). The worker re-claims RETRYING->PROCESSING
        // and re-drives; the bank idempotency key prevents a double charge.
        await Promise.all(claimed.map(r =>
            this.queue.add(
                'payment_reap',
                { paymentId: r.id, amountCents: r.amountCents, currency: r.currency, correlationId: null },
                { jobId: `${r.id}:reap:${Date.now()}` },
            ),
        ));
    }

    onApplicationShutdown() {
        clearTimeout(this.timer);
    }
}
