import type {
  Payment,
  PaymentEvent,
  PaymentsPage,
  DeliveriesPage,
  WebhookEndpoint,
  BankConfig,
  BankMode,
} from './types';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function listPayments(params?: {
  status?: string;
  cursor?: string;
  limit?: number;
}): Promise<PaymentsPage> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.cursor) qs.set('cursor', params.cursor);
  if (params?.limit) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs}` : '';
  return get<PaymentsPage>(`/v1/payments${suffix}`);
}

export function getPayment(id: string): Promise<Payment> {
  return get<Payment>(`/v1/payments/${id}`);
}

export function listEvents(id: string): Promise<PaymentEvent[]> {
  return get<PaymentEvent[]>(`/v1/payments/${id}/events`);
}

export function listDeliveries(params?: {
  status?: string;
  cursor?: string;
  limit?: number;
}): Promise<DeliveriesPage> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.cursor) qs.set('cursor', params.cursor);
  if (params?.limit) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs}` : '';
  return get<DeliveriesPage>(`/v1/webhook-deliveries${suffix}`);
}

export function listEndpoints(): Promise<WebhookEndpoint[]> {
  return get<WebhookEndpoint[]>('/v1/webhook-endpoints');
}

export function getBankConfig(): Promise<BankConfig> {
  return get<BankConfig>('/v1/admin/bank-config');
}

export async function updateBankConfig(patch: {
  mode?: BankMode;
  latencyMs?: number;
  failN?: number;
}): Promise<BankConfig> {
  const res = await fetch(`${API_BASE}/v1/admin/bank-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      detail = body.detail ?? body.title ?? body.message ?? detail;
    } catch {
      // non-JSON error body
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function createEndpoint(
  url: string,
): Promise<WebhookEndpoint & { secret: string }> {
  const res = await fetch(`${API_BASE}/v1/webhook-endpoints`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      detail = body.detail ?? body.title ?? body.message ?? detail;
    } catch {
      // non-JSON error body
    }
    throw new Error(detail);
  }
  return res.json();
}

export interface SubmitPaymentInput {
  customerId: string;
  sourceAccount: string;
  destinationAccount: string;
  amount: string;
  currency?: string;
  reference?: string;
}

export async function submitPayment(
  input: SubmitPaymentInput,
  idempotencyKey: string,
): Promise<{ payment: Payment; correlationId: string | null }> {
  const res = await fetch(`${API_BASE}/v1/payments`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      detail = body.detail ?? body.title ?? body.message ?? detail;
    } catch {
      // non-JSON error body — keep the status line
    }
    throw new Error(detail);
  }
  const payment = (await res.json()) as Payment;
  return { payment, correlationId: res.headers.get('x-correlation-id') };
}

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
