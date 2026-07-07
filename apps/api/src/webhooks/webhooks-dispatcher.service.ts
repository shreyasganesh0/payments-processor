import { config } from '../config';
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/database.types';
import { outbox, webhookDeliveries, webhookEndpoints } from '../database/schema';
import { WEBHOOKS_QUEUE } from '../queue/queue.constants';
import {
    Inject,
    Injectable,
    OnModuleInit,
    OnApplicationShutdown
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { inArray, isNull, and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class WebhookDispatcherService implements OnModuleInit, OnApplicationShutdown {

    private timer?: ReturnType<typeof setTimeout>;

    constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB,
                @InjectQueue(WEBHOOKS_QUEUE) private readonly queue: Queue,
                @InjectPinoLogger(WebhookDispatcherService.name) private readonly logger: PinoLogger
               ) {};

    async onModuleInit() {

        this.scheduleNext();
    }

    private async tick() {

        try { await this.poll_once(); }
        catch(err) { console.error(err); }
        finally { this.scheduleNext(); }
    }
    
    private scheduleNext() {

        this.timer = setTimeout(() => this.tick(), config.webhooks.pollMs);
    }

    private async poll_once(): Promise<number> {
        
        return await this.db.transaction(async tx => {

            //rows to submit
            const events = await tx.select().from(outbox)
            .where(and(
                isNull(outbox.webhookDispatchedAt),
                inArray(outbox.eventType, ['payment.completed', 'payment.failed'])
            ))
            .orderBy(outbox.createdAt).limit(100).for('update', { skipLocked: true});

            if (events.length === 0) return 0;

            const endpoints = await tx.select().from(webhookEndpoints)
                .where(eq(webhookEndpoints.active, true));

            //1 delivery per event x endpoint 
            const rows = events.flatMap(e => endpoints.map(ep => {
                const id = ulid();
                this.logger.info(
                    { correlationId: (e.payload as { correlationId?: string }).correlationId, deliveryId: id, endpointId: ep.id },
                    'webhook delivery created'
                );
                return {
                    id: id,
                    endpointId: ep.id,
                    eventId: e.id,
                    eventType: e.eventType,
                    payload: e.payload,
                };
            }));
            if (rows.length > 0) await tx.insert(webhookDeliveries).values(rows);

            await Promise.all(rows.map(d => 
                this.queue.add('webhook.deliver', { deliveryId: d.id }, { jobId: d.id })
            ));

            //mark all events dispatched
            await tx.update(outbox).set({ webhookDispatchedAt: new Date() })
                .where(inArray(outbox.id, events.map(e => e.id)));

            return rows.length;
        });

    }

    onApplicationShutdown(signal?: string) {

        clearTimeout(this.timer);
    }
}
