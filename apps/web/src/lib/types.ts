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
