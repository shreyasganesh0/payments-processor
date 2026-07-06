import type { Node, Edge } from '@xyflow/react';

export type ArchKind = 'process' | 'store' | 'external';

export interface ArchNodeData extends Record<string, unknown> {
  label: string;
  kind: ArchKind;
  responsibilities: string[];
  failureModes: string[];
  adrs: string[];
}

export type ArchNode = Node<ArchNodeData, 'arch'>;

export const archNodes: ArchNode[] = [
  {
    id: 'client',
    type: 'arch',
    position: { x: 0, y: 300 },
    data: {
      label: 'Client',
      kind: 'external',
      responsibilities: [
        'Submits ACH payments to the API.',
        'Polls payment status and reads the audit trail.',
      ],
      failureModes: [
        'May resend the same request — an Idempotency-Key makes duplicates safe (one payment, replayed response).',
      ],
      adrs: ['ADR-002 · Idempotency'],
    },
  },
  {
    id: 'api',
    type: 'arch',
    position: { x: 340, y: 300 },
    data: {
      label: 'API',
      kind: 'process',
      responsibilities: [
        'Validates the request and accepts it (202) without processing inline.',
        'In one transaction writes the payment, an outbox row, and the idempotency record.',
      ],
      failureModes: [
        'Crash after commit → the outbox row is durable and is published later; no payment is lost.',
      ],
      adrs: [
        'ADR-001 · Sync vs async',
        'ADR-002 · Idempotency',
        'ADR-003 · Transactional outbox',
      ],
    },
  },
  {
    id: 'postgres',
    type: 'arch',
    position: { x: 340, y: 540 },
    data: {
      label: 'Postgres',
      kind: 'store',
      responsibilities: [
        'System of record: payments, payment_events (audit), outbox, idempotency_keys, webhook_* and bank_config.',
        'Enforces state transitions via compare-and-swap.',
      ],
      failureModes: [
        'Unavailable → readiness probe returns 503; writes are atomic so partial state cannot persist.',
      ],
      adrs: [
        'ADR-005 · Money (integer minor units)',
        'ADR-006 · State machine',
        'ADR-010 · Data access (Drizzle)',
      ],
    },
  },
  {
    id: 'redis',
    type: 'arch',
    position: { x: 1040, y: 80 },
    data: {
      label: 'Redis',
      kind: 'store',
      responsibilities: [
        'BullMQ queue backing for the payment and webhook job queues.',
      ],
      failureModes: [
        'The commit→enqueue dual-write is made safe by the outbox (publish is replayable) and jobId dedup.',
      ],
      adrs: ['ADR-004 · Queue technology'],
    },
  },
  {
    id: 'relay',
    type: 'arch',
    position: { x: 690, y: 540 },
    data: {
      label: 'Relay',
      kind: 'process',
      responsibilities: [
        'Polls unpublished outbox rows (FOR UPDATE SKIP LOCKED) and publishes them to the queue.',
        'Publishes before marking published — at-least-once.',
      ],
      failureModes: [
        'Crash after publish, before marking → the row republishes next tick; idempotent consumers make the duplicate harmless.',
      ],
      adrs: ['ADR-003 · Transactional outbox', 'ADR-004 · Queue technology'],
    },
  },
  {
    id: 'worker',
    type: 'arch',
    position: { x: 1040, y: 300 },
    data: {
      label: 'Worker',
      kind: 'process',
      responsibilities: [
        'Consumes jobs; drives the payment state machine with a compare-and-swap.',
        'Calls the bank; handles retries with backoff, a retry budget, and a circuit breaker; emits terminal events.',
      ],
      failureModes: [
        'Crash mid-processing → the job redelivers; CAS + a per-payment bank key make the effect exactly-once despite at-least-once delivery.',
      ],
      adrs: ['ADR-006 · State machine', 'ADR-007 · Delivery semantics'],
    },
  },
  {
    id: 'bank',
    type: 'arch',
    position: { x: 1380, y: 300 },
    data: {
      label: 'Bank',
      kind: 'external',
      responsibilities: [
        'ACH banking partner (simulated) — authorizes, declines, or errors on a payment.',
      ],
      failureModes: [
        'Declines are terminal (no retry); transient errors/timeouts are retried; the circuit breaker sheds load while the bank is failing.',
      ],
      adrs: ['ADR-007 · Delivery semantics'],
    },
  },
  {
    id: 'dispatcher',
    type: 'arch',
    position: { x: 690, y: 760 },
    data: {
      label: 'Dispatcher',
      kind: 'process',
      responsibilities: [
        'Fans terminal payment events out to webhook_deliveries (one event → N endpoints) and enqueues delivery jobs.',
      ],
      failureModes: [
        'Uses the same outbox-style claim (SKIP LOCKED) + marker, so it cannot lose or double-fan-out under crash.',
      ],
      adrs: ['ADR-008 · Webhook delivery'],
    },
  },
  {
    id: 'receiver',
    type: 'arch',
    position: { x: 1380, y: 540 },
    data: {
      label: 'Webhook receiver',
      kind: 'external',
      responsibilities: [
        "The customer's endpoint — receives signed delivery POSTs.",
      ],
      failureModes: [
        'If down, deliveries retry with backoff and land in a dead-letter after the budget; HMAC signatures let the receiver verify authenticity.',
      ],
      adrs: ['ADR-008 · Webhook delivery'],
    },
  },
];

function edge(
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
  label: string,
): Edge {
  return {
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    label,
    type: 'smoothstep',
  };
}

export const archEdges: Edge[] = [
  edge('e-client-api', 'client', 'sr', 'api', 'tl', 'POST /v1/payments'),
  edge('e-api-pg', 'api', 'sb', 'postgres', 'tt', 'txn: payment + outbox'),
  edge('e-relay-pg', 'relay', 'sl', 'postgres', 'tr', 'poll outbox · SKIP LOCKED'),
  edge('e-relay-redis', 'relay', 'sr', 'redis', 'tb', 'publish · at-least-once'),
  edge('e-redis-worker', 'redis', 'sb', 'worker', 'tt', 'consume'),
  edge('e-worker-bank', 'worker', 'sr', 'bank', 'tl', 'authorize · idempotent'),
  edge('e-worker-pg', 'worker', 'sl', 'postgres', 'tr', 'CAS + events'),
  edge('e-disp-pg', 'dispatcher', 'sl', 'postgres', 'tb', 'fan-out terminal events'),
  edge('e-disp-redis', 'dispatcher', 'sr', 'redis', 'tb', 'enqueue delivery'),
  edge('e-worker-recv', 'worker', 'sb', 'receiver', 'tl', 'signed POST · HMAC'),
];
