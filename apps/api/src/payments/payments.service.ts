import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common';

import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsQueryDto } from './dto/list-payments.query.dto';
import { payments, paymentEvents, idempotencyKeys, outbox } from '../database/schema';
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/database.types';

import { ulid } from 'ulid';
import { convAmountToUnits } from '@payments/shared';
import { eq, and, lt, desc } from 'drizzle-orm';

type PaymentRow = typeof payments.$inferSelect;

@Injectable()
export class PaymentsService {

    constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {};

    async insert_txn(
        dto: CreatePaymentDto,
        idempotency_key: string,
        req_hash: string
    ): Promise<{ replayed: boolean; status: number; body: PaymentRow }> {

        const id = ulid();
        const outbox_id = ulid();
        const amountCents = convAmountToUnits(dto.amount);

        try {

            return await this.db.transaction( async tx => {
                const [row] = await tx.insert(payments).values({
                    id: id,
                    customerId: dto.customerId,  
                    amountCents: amountCents,
                    sourceAccount: dto.sourceAccount,
                    destinationAccount: dto.destinationAccount,
                    reference: dto.reference,
                }).returning();


                await tx.insert(idempotencyKeys).values({
                    customerId: dto.customerId,
                    idempotencyKey: idempotency_key,
                    requestHash: req_hash,
                    paymentId: row.id,
                    responseStatus: 202,
                    responseBody: row  
                })

                const payload = {
                    paymentId: row.id,
                    amountCents: row.amountCents,
                    currency: row.currency,
                    sourceAccount: row.sourceAccount,
                    destinationAccount: row.destinationAccount,
                    customerId: row.customerId
                };

                await tx.insert(outbox).values({
                    id: outbox_id,
                    aggregateType: 'payment',
                    aggregateId: id,
                    eventType: 'payment.submitted',
                    payload: payload,
                });
                return { replayed: false, status: 202, body: row};
            });

        } catch(err) {

            const e = err as { code?: string; cause?: 
                { code?: string; constraint?: string } 
            };
            const code = e.code ?? e.cause?.code; //type checking for error code
                                      //can be removed if know where pg codes always land

            if (code === '23505') {

                const [existing] = await this.db.select().from(idempotencyKeys).where(
                    and(eq(idempotencyKeys.customerId, dto.customerId),
                        eq(idempotencyKeys.idempotencyKey, idempotency_key)
                    )
                );
                
                if (!existing) throw new Error(`customer: ${dto.customerId} and idempotency key: ${idempotency_key} did not exist in idempotencyKeys table`);

                if (existing.requestHash !== req_hash) throw new ConflictException('Idempotency-Key reused with a different request payload');

                return { 
                    replayed: true,
                    status: existing.responseStatus,
                    body: existing.responseBody as PaymentRow 
                };
            } else {

                throw err; 
            }
        }
    }

    async find_one(id: string) {

        const [row] = await this.db.select().from(payments).where(eq(payments.id, id))
        if(!row) throw new NotFoundException('Payment for given id was not found');

        return row;
    }

    async list({ status, cursor, limit }: ListPaymentsQueryDto) {

        const conds = []
        if (status) conds.push(eq(payments.status, status));
        if (cursor) conds.push(lt(payments.id, cursor));
        const where = conds.length ? and(...conds) : undefined;

        return await this.db.select().from(payments).where(where).orderBy(desc(payments.id)).limit(limit + 1)
    }


    async list_events(id: string) {

        await this.find_one(id); //existence check
        const rows = await this.db.select().from(paymentEvents)
            .where(eq(paymentEvents.paymentId, id))
            .orderBy(paymentEvents.occurredAt);

        return rows;
    }
}
