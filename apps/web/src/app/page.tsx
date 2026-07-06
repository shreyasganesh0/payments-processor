'use client';

import { useCallback, useState } from 'react';
import type { Payment } from '@/lib/types';
import { listPayments, formatTime } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { PaymentsTable } from '@/components/PaymentsTable';
import { PipelineRail } from '@/components/PipelineRail';
import { SubmitPaymentForm } from '@/components/SubmitPaymentForm';

const POLL_MS = 2000;

export default function DashboardPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const page = await listPayments({ limit: 100 });
      setPayments(page.data);
      setLastSync(new Date().toISOString());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, []);

  usePolling(refresh, POLL_MS);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Payments
          </h1>
          <p className="mt-1 text-sm text-muted">
            Live view of the payment lifecycle across the pipeline.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-faint">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-flow" />
            {lastSync ? `live · updated ${formatTime(lastSync)}` : 'connecting…'}
          </span>
          <button
            onClick={refresh}
            disabled={loading}
            className="rounded-md border border-line-strong px-3 py-1.5 text-sm text-muted transition-colors hover:bg-panel-2 hover:text-ink disabled:opacity-50"
          >
            Refresh
          </button>
          <button
            onClick={() => setDrawerOpen(true)}
            className="rounded-md bg-flow px-3 py-1.5 text-sm font-semibold text-bg transition-colors hover:bg-flow/90"
          >
            New payment
          </button>
        </div>
      </header>

      {error && (
        <div className="mt-6 rounded-md border border-st-failed/30 bg-st-failed/10 px-4 py-3 text-sm text-st-failed">
          {error}
        </div>
      )}

      <div className="mt-6">
        <PipelineRail payments={payments} />
      </div>

      <div className="mt-6">
        {loading && payments.length === 0 ? (
          <div className="rounded-lg border border-line bg-panel p-10 text-center text-sm text-muted">
            Loading…
          </div>
        ) : (
          <PaymentsTable payments={payments} />
        )}
      </div>

      {drawerOpen && (
        <SubmitPaymentForm
          onClose={() => setDrawerOpen(false)}
          onSubmitted={refresh}
        />
      )}
    </main>
  );
}
