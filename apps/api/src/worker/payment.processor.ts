
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/database.types';

import { PAYMENTS_QUEUE } from '../queue/queue.constants';

import { BANK, BANK_TIMEOUT_MS, BREAKER } from '../bank/bank.constants';
import { BankPort } from '../bank/bank.types';
import { withTimeout, BankTimeoutError } from '../bank/bank.timeout';
import { CircuitBreaker } from '../bank/circuit-breaker';
import {
    Inject,
} from '@nestjs/common';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { payments, paymentEvents, outbox } from '../database/schema';
import { ulid } from 'ulid';
import { eq, and, sql } from 'drizzle-orm';

import { PaymentStatus, canTransition } from '@payments/shared';

import { MAX_RETRIES } from './worker.constants';
import { computeBackoffMs } from './backoff';

type Disposition = 
    | { kind: 'COMPLETE'; target: 'COMPLETED'; metadata: object }
    | { kind: 'FAIL'; target: 'FAILED'; metadata: object }
    | { kind: 'RETRY'; reason: string };

@Processor(PAYMENTS_QUEUE)
export class PaymentProcessor extends WorkerHost {

    constructor(
        @Inject(DRIZZLE) private readonly db: DrizzleDB,
        @Inject(BANK) private readonly bank: BankPort,
        @InjectQueue(PAYMENTS_QUEUE) private readonly queue: Queue,
        @Inject(BREAKER) private readonly breaker: CircuitBreaker,
    ) {super();};

    async process(job: Job): Promise<void> {

        const { paymentId } = job.data;

        //txn 1
        await this.db.transaction(async tx => {
            // for(update) blocks double delivery for concurrent reads 
            const [row] = await tx.select({ status: payments.status })
                .from(payments).where(eq(payments.id, paymentId)).for('update');
            if (!row) return;
            //check for non terminal starting points
            if (!canTransition(row.status, 'PROCESSING')) return; 

            const rows = await tx.update(payments).set({ 
                status: 'PROCESSING',
                version: sql`${payments.version}+1`,
                updatedAt: new Date()
            })
            .where(
                and(
                    eq(payments.id, paymentId),
                    eq(payments.status, row.status)
                )
            ).returning();

            if (rows.length === 0) return;

            await tx.insert(paymentEvents).values({
                id: ulid(),
                paymentId: paymentId,
                fromStatus: row.status,
                toStatus: 'PROCESSING',
                correlationId: job.data.correlationId ?? null
            });

            return;
        });

        let dis: Disposition;
        if (!this.breaker.allow()) {
            dis = { kind: 'RETRY', reason: 'circuit_open' };//short circuit to retry
        } else {
        try {
            const outcome = await withTimeout(this.bank.authorize({
                paymentId,
                amountCents: job.data.amountCents,
                currency: job.data.currency,
                idempotencyKey: paymentId //replace with actual key later
            }), BANK_TIMEOUT_MS);


            switch(outcome.status) {

                case('authorized'):
                    dis = {
                        kind: 'COMPLETE',
                        target: 'COMPLETED',
                        metadata: { bankRef: outcome.bankRef },
                    };
                    break;
                case('declined'):
                    dis = {
                        kind: 'FAIL',
                        target: 'FAILED',
                        metadata: { reason: outcome.reason },
                    }
                    break;
                case('error'):
                    dis = outcome.retryable 
                    ?{ kind: 'RETRY', reason: outcome.reason }
                    :{kind: 'FAIL', target: 'FAILED', metadata: {reason: outcome.reason}};
                    break;
                default:
                    throw new Error(`Invalid bank state`);
            }
        } catch(err) {

            if (err instanceof BankTimeoutError) {
                dis = { kind: 'RETRY', reason: 'bank_timeout' };
            } else {
                throw err;
            }
        }

        this.breaker.record(dis.kind !== 'RETRY'); // update breaker on retries
        }


        if (dis.kind === 'RETRY') {

            let scheduledAttempt: number | null = null;
            await this.db.transaction(async tx => { 
                const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` })
                    .from(paymentEvents)
                    .where(
                        and(
                            eq(paymentEvents.paymentId, paymentId), 
                            eq(paymentEvents.toStatus, 'RETRYING')
                        )
                    );

                if (count >= MAX_RETRIES) {

                    if (!canTransition('PROCESSING', 'FAILED')){
                    throw new Error(`Invalid state transition from PROCESSING to FAILED`);
                    } 

                    const rows = await tx.update(payments).set({
                        status: 'FAILED',
                        version: sql`${payments.version}+1`,
                        updatedAt: new Date()
                    })
                    .where(and(
                        eq(payments.id, paymentId),
                        eq(payments.status, 'PROCESSING')
                    )).returning();

                    if (rows.length === 0) return;

                    await tx.insert(paymentEvents).values({
                        id: ulid(),
                        paymentId: paymentId,
                        fromStatus: 'PROCESSING',
                        toStatus: 'FAILED',
                        correlationId: job.data.correlationId ?? null,
                        metadata: { reason: dis.reason, retriesExhausted: true }
                    });

                    return;
                } else {

                    const attempt = count + 1;
                    if (!canTransition('PROCESSING', 'RETRYING')){
                    throw new Error(`Invalid state transition from PROCESSING to RETRYING`);
                    } 

                    const rows = await tx.update(payments).set({
                        status: 'RETRYING',
                        version: sql`${payments.version}+1`,
                        updatedAt: new Date()
                    })
                    .where(and(
                        eq(payments.id, paymentId),
                        eq(payments.status, 'PROCESSING')
                    )).returning();

                    if (rows.length === 0) return;

                    scheduledAttempt = attempt;

                    await tx.insert(paymentEvents).values({
                        id: ulid(),
                        paymentId: paymentId,
                        fromStatus: 'PROCESSING',
                        toStatus: 'RETRYING',
                        correlationId: job.data.correlationId ?? null,
                        metadata: { reason: dis.reason, attempt }
                    });
                }
            });

            if (scheduledAttempt !== null) {
                await this.queue.add('payment_retry', job.data , {
                    delay: computeBackoffMs(scheduledAttempt),
                    jobId: `${paymentId}:retry:${scheduledAttempt}`, //unique or dropped by bullmq
                });
            }

            return;
        }

        // fast fail
        if (!canTransition('PROCESSING', dis.target)) throw new Error(`Invalid state transition from PROCESSING to ${dis.target}`);

        //txn 2
        await this.db.transaction(async tx => {

            const rows = await tx.update(payments).set({ 
                status: dis.target,
                version: sql`${payments.version}+1`,
                updatedAt: new Date()
            }).where(and(eq(payments.id, paymentId), eq(payments.status, 'PROCESSING')))
            .returning();

            if (rows.length === 0) return;

            await tx.insert(paymentEvents).values({
                id: ulid(),
                paymentId: paymentId,
                fromStatus: 'PROCESSING',
                toStatus: dis.target,
                metadata: dis.metadata,
                correlationId: job.data.correlationId ?? null
            });
            
            await tx.insert(outbox).values({
              id: ulid(),
              aggregateType: 'payment',
              aggregateId: paymentId,
              eventType: dis.target === 'COMPLETED' 
                  ? 'payment.completed' 
                  : 'payment.failed',
              payload: { 
                  paymentId,
                  status: dis.target,
                  amountCents: job.data.amountCents,
                  currency: job.data.currency 
              },
            });

        });
    }
}
