'use client';

import { useCallback, useState } from 'react';
import type { WebhookDelivery, WebhookEndpoint } from '@/lib/types';
import {
  listDeliveries,
  listEndpoints,
  createEndpoint,
  formatTime,
} from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { WebhookDeliveriesTable } from '@/components/WebhookDeliveriesTable';

const POLL_MS = 2000;

export default function WebhooksPage() {
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [d, e] = await Promise.all([
        listDeliveries({ limit: 50 }),
        listEndpoints(),
      ]);
      setDeliveries(d.data);
      setEndpoints(e);
      setLastSync(new Date().toISOString());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load webhooks');
    }
  }, []);

  usePolling(refresh, POLL_MS);

  const [url, setUrl] = useState('');
  const [registering, setRegistering] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setRegistering(true);
    setSecret(null);
    setFormError(null);
    try {
      const created = await createEndpoint(url.trim());
      setSecret(created.secret);
      setUrl('');
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to register');
    } finally {
      setRegistering(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Webhooks
          </h1>
          <p className="mt-1 text-sm text-muted">
            Registered endpoints and signed delivery attempts, with retries and
            dead-letter.
          </p>
        </div>
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-faint">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-flow" />
          {lastSync ? `live · updated ${formatTime(lastSync)}` : 'connecting…'}
        </span>
      </header>

      {error && (
        <div className="mt-6 rounded-md border border-st-failed/30 bg-st-failed/10 px-4 py-3 text-sm text-st-failed">
          {error}
        </div>
      )}

      {/* Endpoints */}
      <section className="mt-8">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted">
          Endpoints
        </h2>

        <form onSubmit={register} className="flex flex-wrap gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://127.0.0.1:4600/hook"
            required
            className="min-w-0 flex-1 rounded-md border border-line bg-bg px-3 py-2 font-mono text-sm text-ink placeholder:text-faint focus:border-flow focus:outline-none focus:ring-1 focus:ring-flow/40"
          />
          <button
            type="submit"
            disabled={registering}
            className="rounded-md bg-flow px-4 py-2 text-sm font-semibold text-bg transition-colors hover:bg-flow/90 disabled:opacity-50"
          >
            {registering ? 'Registering…' : 'Register'}
          </button>
        </form>

        {formError && (
          <p className="mt-2 text-sm text-st-failed">{formError}</p>
        )}
        {secret && (
          <div className="mt-2 rounded-md border border-st-completed/30 bg-st-completed/10 px-4 py-3 text-sm text-st-completed">
            <div className="font-medium">Endpoint registered</div>
            <div className="mt-1 break-all font-mono text-xs opacity-80">
              secret {secret}
            </div>
            <div className="mt-1 text-xs opacity-70">
              Save it now — the signing secret is shown only once.
            </div>
          </div>
        )}

        <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-panel">
          {endpoints.length === 0 ? (
            <li className="p-4 text-center text-sm text-muted">
              No active endpoints.
            </li>
          ) : (
            endpoints.map((ep) => (
              <li
                key={ep.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="truncate font-mono text-xs text-ink" title={ep.url}>
                  {ep.url}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-faint">
                  {formatTime(ep.createdAt)}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      {/* Deliveries */}
      <section className="mt-10">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted">
          Deliveries
        </h2>
        <WebhookDeliveriesTable deliveries={deliveries} />
      </section>
    </main>
  );
}
