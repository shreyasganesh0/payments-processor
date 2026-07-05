
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/database.types';
import { PAYMENTS_QUEUE } from '../queue/queue.constants';
import {
    Inject,
} from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { payments, paymentEvents } from '../database/schema';
import { ulid } from 'ulid';
import { eq, and, sql } from 'drizzle-orm';

@Processor(PAYMENTS_QUEUE)
export class PaymentProcessor extends WorkerHost {

    constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {super();};

    async process(job: Job): Promise<void> {

        const { paymentId } = job.data;

        await this.db.transaction(async tx => {

            const rows = await tx.update(payments).set({ 
                status: 'PROCESSING',
                version: sql`${payments.version}+1`,
                updatedAt: new Date()
            }).where(and(eq(payments.id, paymentId), eq(payments.status, 'PENDING')))
            .returning();

            if (rows.length === 0) return;

            await tx.insert(paymentEvents).values({
                id: ulid(),
                paymentId: paymentId,
                fromStatus: 'PENDING',
                toStatus: 'PROCESSING',
                correlationId: job.data.correlationId ?? null
            });

            return;
        });
    }
}
