export type PaymentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'RETRYING';

export interface Payment {
  id: string;
  customerId: string;
  sourceAccount: string;
  destinationAccount: string;
  amountCents: number;
  currency: string;
  reference: string | null;
  status: PaymentStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentEvent {
  id: string;
  fromStatus: PaymentStatus | null;
  toStatus: PaymentStatus;
  occurredAt: string;
  metadata: Record<string, unknown> | null;
  correlationId: string | null;
}

export interface PaymentsPage {
  data: Payment[];
  nextCursor: string | null;
}

export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'failed' | 'dead';

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  eventId: string;
  eventType: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
  url: string | null;
}

export interface DeliveriesPage {
  data: WebhookDelivery[];
  nextCursor: string | null;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  active: boolean;
  createdAt: string;
  description: string | null;
}
