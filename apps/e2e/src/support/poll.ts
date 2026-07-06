import { get } from './client';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Replaces the old `sleep 3 && curl` dance. Payment processing is asynchronous
// (queue → worker → bank), so lifecycle assertions poll GET /v1/payments/:id
// until the status reaches one of the targets, or throw with the last-seen
// status when the deadline passes (so a failure tells you WHERE it got stuck).
export async function waitForStatus(
  id: string,
  target: string | string[],
  { timeout = 10_000, interval = 250 }: { timeout?: number; interval?: number } = {},
): Promise<{ id: string; status: string; [k: string]: unknown }> {
  const targets = Array.isArray(target) ? target : [target];
  const deadline = Date.now() + timeout;
  let last: string | undefined;

  while (Date.now() < deadline) {
    const res = await get<{ id: string; status: string }>(`/v1/payments/${id}`);
    last = res.body?.status;
    if (last && targets.includes(last)) return res.body as { id: string; status: string };
    await sleep(interval);
  }

  throw new Error(
    `payment ${id} did not reach [${targets.join(', ')}] within ${timeout}ms (last status: ${last ?? 'unknown'})`,
  );
}

export interface Delivery {
  id: string;
  endpointId: string;
  status: string;
  attempts: number;
  lastError: string | null;
  url: string | null;
}

// Poll GET /v1/webhook-deliveries for a delivery to the given endpoint reaching
// one of the target statuses (pending → failed → dead, or delivered). Webhook
// retries use the same exponential backoff as the worker, so a dead receiver
// takes ~8–16s to exhaust its budget — give this a generous timeout.
export async function waitForDelivery(
  endpointId: string,
  target: string | string[],
  { timeout = 30_000, interval = 1_000 }: { timeout?: number; interval?: number } = {},
): Promise<{ hit: Delivery; all: Delivery[] }> {
  const targets = Array.isArray(target) ? target : [target];
  const deadline = Date.now() + timeout;
  let seen = '';

  while (Date.now() < deadline) {
    const res = await get<{ data: Delivery[] }>('/v1/webhook-deliveries?limit=100');
    const mine = (res.body?.data ?? []).filter((d) => d.endpointId === endpointId);
    const hit = mine.find((d) => targets.includes(d.status));
    if (hit) return { hit, all: mine };
    seen = mine.map((d) => `${d.status}(${d.attempts})`).join(', ') || 'none';
    await sleep(interval);
  }

  throw new Error(
    `no delivery for endpoint ${endpointId} reached [${targets.join(', ')}] within ${timeout}ms (saw: ${seen})`,
  );
}
