import { pgEnum, pgTable, text, bigint, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const paymentStatus = pgEnum('payment_status', [
    "PENDING",
    "PROCESSING",
    "COMPLETED",
    "FAILED",
    "RETRYING"
]);


export const payments = pgTable('payments', {
    id: text('id').primaryKey(),
    customerId: text('customer_id').notNull(),
    sourceAccount: text('source_account').notNull(),
    destinationAccount: text('destination_account').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    currency: text('currency').notNull().default('USD'),
    reference: text('reference'),
    status: paymentStatus('status').notNull().default('PENDING'),
    version: integer('version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

});

export const paymentEvents = pgTable('payment_events', {
    id: text('id').primaryKey(),
    paymentId: text('payment_id').notNull().references(() => payments.id),
    fromStatus: paymentStatus('from_status'),
    toStatus: paymentStatus('to_status').notNull(),
    correlationId: text('correlation_id'),
    metadata: jsonb('metadata'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow()
});
