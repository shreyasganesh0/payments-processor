import { Inject } from '@nestjs/common';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { createHmac } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/database.types';
import { WEBHOOKS_QUEUE } from '../queue/queue.constants';
import { MAX_WEBHOOK_ATTEMPTS } from './webhook.constants';
import { computeBackoffMs } from '../worker/backoff';
import { webhookDeliveries, webhookEndpoints } from '../database/schema';

@Processor(WEBHOOKS_QUEUE)
export class WebhookProcessor extends WorkerHost {
    constructor(
        @Inject(DRIZZLE) private readonly db: DrizzleDB,
        @InjectQueue(WEBHOOKS_QUEUE) private readonly queue: Queue,
    ) { super(); }

    async process(job: Job): Promise<void> {

        const [delivery] = await this.db.select().from(webhookDeliveries)
            .where(eq(webhookDeliveries.id, job.data.deliveryId));

        if (!delivery) return;

        if (delivery.status === 'delivered' || delivery.status === 'dead') return;

        const [endpoint] = await this.db.select().from(webhookEndpoints)
            .where(eq(webhookEndpoints.id, delivery.endpointId));

        if (!endpoint) throw new Error('Invalid Endpoint id in delivery');

        const envelope = { 
            id: delivery.eventId,
            type: delivery.eventType,
            created: new Date(),
            data: delivery.payload,
        };

        const rawBody = JSON.stringify(envelope);
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signature = createHmac('sha256', endpoint.secret) 
            .update(`${timestamp}.${rawBody}`).digest('hex');

        // send to webhook endpoint

        let ok = false;
        let lastError = '';

        try {
            const res = await fetch(endpoint.url, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-webhook-id': delivery.eventId,
                    'x-webhook-timestamp': timestamp,
                    'x-webhook-signature': signature,
                },
                body: rawBody,
                signal: AbortSignal.timeout(5000),
            });
            ok = res.ok;
            if (!ok) lastError = `HTTP ${res.status}`;

        } catch (err) {

            lastError = err instanceof Error ? err.message : 'delivery_error';
        }

        if (ok) {
            await this.db.update(webhookDeliveries).set({
                status: 'delivered',
                deliveredAt: new Date(),
                attempts: sql`${webhookDeliveries.attempts} + 1`,
            }).where(eq(webhookDeliveries.id, delivery.id))
            return;
        } 

        //retry path
        const attempts = delivery.attempts + 1;
        if (attempts >= MAX_WEBHOOK_ATTEMPTS) { //move to DLQ

            await this.db.update(webhookDeliveries).set({
                status: 'dead',
                attempts: attempts,
                lastError: lastError,
            }).where(eq(webhookDeliveries.id, delivery.id))
            return;
        }

        const delay = computeBackoffMs(attempts);
        await this.db.update(webhookDeliveries).set({
            status: 'failed',
            nextAttemptAt: new Date(Date.now() + delay),
            attempts: attempts,
            lastError: lastError,
        }).where(eq(webhookDeliveries.id, delivery.id));

        await this.queue.add('webhook.deliver',
            { deliveryId: delivery.id },
            { 
             jobId: `${delivery.id}:retry:${attempts}`,//must be unique or dropped
             delay: delay,
            }
        );
        return;
    }
}
