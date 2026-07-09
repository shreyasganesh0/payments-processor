import {
    pgEnum, pgTable, text, bigint, integer, timestamp, json, jsonb, unique, boolean
} from 'drizzle-orm/pg-core';

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
    attemptCount: integer('attempt_count').notNull().default(0),
    lastErrorCode: text('last_error_code'),
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


export const idempotencyKeys = pgTable('idempotency_keys', {
    customerId: text('customer_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    paymentId: text('payment_id').notNull().references(() => payments.id),
    responseStatus: integer('response_status').notNull(),
    responseBody: json('response_body'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => ({ uq: unique().on(t.customerId, t.idempotencyKey) }));

export const outbox = pgTable('outbox', {
    id: text('id').primaryKey(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    webhookDispatchedAt: timestamp('webhook_dispatched_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const webhookEndpoints = pgTable('webhook_endpoints', {
    id: text('id').primaryKey(),
    url: text('url').notNull(),
    secret: text('secret').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    description: text('description'),
});

export const webhookStatus = pgEnum('webhook_status',
    ['pending', 'delivered', 'failed', 'dead']
);

export const webhookDeliveries = pgTable('webhook_deliveries', {
    id: text('id').primaryKey(),
    endpointId: text('endpoint_id').notNull().references(() => webhookEndpoints.id),
    eventId: text('event_id').notNull(), // outbox event id 
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    status: webhookStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
}, (t) => ({ uqEventEndpoint: unique().on(t.eventId, t.endpointId) }));

// chaos control — simulated-bank config, read by the worker's bank adapter
// via a poll-sync so the API can flip it cross-process. Single row (id='singleton').
export const bankMode = pgEnum('bank_mode', [
    'always_authorize',
    'always_decline',
    'always_error',
    'fail_n_then_authorize',
]);

export const bankConfig = pgTable('bank_config', {
    id: text('id').primaryKey(),
    mode: bankMode('mode').notNull().default('always_authorize'),
    latencyMs: integer('latency_ms').notNull().default(200),
    failN: integer('fail_n').notNull().default(2),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
