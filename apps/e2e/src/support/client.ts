import { API_BASE } from './config';

// One thin HTTP client. Every call returns the same shape — { status, headers,
// body } — so a test is always: build request → send → assert. `body` is the
// parsed JSON when the response is JSON (including application/problem+json),
// the raw text otherwise, or undefined for an empty body.
export interface HttpResponse<T = unknown> {
  status: number;
  headers: Headers;
  body: T;
}

export interface RequestOptions {
  /** Sets the `Idempotency-Key` header — required by POST /v1/payments. */
  idempotencyKey?: string;
  /** Extra/override headers. */
  headers?: Record<string, string>;
}

async function request<T>(
  method: string,
  path: string,
  json: unknown | undefined,
  opts: RequestOptions,
): Promise<HttpResponse<T>> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (json !== undefined) headers['content-type'] = 'application/json';
  if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });

  const text = await res.text();
  let body: unknown = undefined;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return { status: res.status, headers: res.headers, body: body as T };
}

export function get<T = unknown>(path: string, opts: RequestOptions = {}) {
  return request<T>('GET', path, undefined, opts);
}

export function post<T = unknown>(path: string, json?: unknown, opts: RequestOptions = {}) {
  return request<T>('POST', path, json, opts);
}

export function put<T = unknown>(path: string, json?: unknown, opts: RequestOptions = {}) {
  return request<T>('PUT', path, json, opts);
}

export function del<T = unknown>(path: string, opts: RequestOptions = {}) {
  return request<T>('DELETE', path, undefined, opts);
}

/** Preflight/OPTIONS — used by the CORS test to read Access-Control-* headers. */
export function options<T = unknown>(path: string, opts: RequestOptions = {}) {
  return request<T>('OPTIONS', path, undefined, opts);
}
