'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { Payment, PaymentEvent } from '@/lib/types';
import { getPayment, listEvents, formatMoney, formatTime } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { StatusTag } from '@/components/StatusTag';
import { AuditTimeline } from '@/components/AuditTimeline';

const POLL_MS = 2000;

function Detail({
  label,
  value,
  mono,
  wide,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'col-span-2 sm:col-span-3' : ''}>
      <dt className="font-mono text-[11px] uppercase tracking-wide text-faint">
        {label}
      </dt>
      <dd className={`mt-1 break-all text-sm text-ink ${mono ? 'font-mono' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

export default function PaymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [events, setEvents] = useState<PaymentEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [p, ev] = await Promise.all([getPayment(id), listEvents(id)]);
      setPayment(p);
      setEvents(ev);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load payment');
    } finally {
      setLoading(false);
    }
  }, [id]);

  usePolling(refresh, POLL_MS);

  const correlationId = events[0]?.correlationId ?? null;

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
      >
        <span aria-hidden>←</span> Payments
      </Link>

      {loading && !payment && (
        <div className="mt-6 rounded-lg border border-line bg-panel p-10 text-center text-sm text-muted">
          Loading…
        </div>
      )}

      {error && !payment && (
        <div className="mt-6 rounded-lg border border-st-failed/30 bg-st-failed/10 p-6 text-sm text-st-failed">
          {error}
        </div>
      )}

      {payment && (
        <>
          <header className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-lg text-ink">{payment.id}</h1>
              <StatusTag status={payment.status} />
            </div>
            <span className="font-mono text-xl tabular-nums text-ink">
              {formatMoney(payment.amountCents, payment.currency)}
            </span>
          </header>

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 rounded-lg border border-line bg-panel p-5 sm:grid-cols-3">
            <Detail label="Customer" value={payment.customerId} />
            <Detail label="Source" value={payment.sourceAccount} mono />
            <Detail label="Destination" value={payment.destinationAccount} mono />
            <Detail label="Reference" value={payment.reference ?? '—'} />
            <Detail label="Version" value={String(payment.version)} mono />
            <Detail label="Updated" value={formatTime(payment.updatedAt)} mono />
            <Detail label="Correlation" value={correlationId ?? '—'} mono wide />
          </dl>

          <section className="mt-8">
            <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wide text-muted">
              Audit timeline
            </h2>
            <AuditTimeline events={events} />
          </section>
        </>
      )}
    </main>
  );
}
