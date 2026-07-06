'use client';

import { useEffect, useRef, useState } from 'react';
import { submitPayment, type SubmitPaymentInput } from '@/lib/api';
import { randomId } from '@/lib/id';

const DEFAULTS: SubmitPaymentInput = {
  customerId: 'C12345',
  sourceAccount: 'VA10001',
  destinationAccount: 'EXT98765',
  amount: '250.00',
  reference: 'PMT-1001',
};

type Result =
  | { kind: 'new'; id: string; status: string; correlationId: string | null }
  | { kind: 'replay'; id: string; status: string; correlationId: string | null }
  | { kind: 'error'; message: string };

const RESULT_STYLE: Record<Result['kind'], string> = {
  new: 'border-st-completed/30 bg-st-completed/10 text-st-completed',
  replay: 'border-st-retrying/30 bg-st-retrying/10 text-st-retrying',
  error: 'border-st-failed/30 bg-st-failed/10 text-st-failed',
};

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-muted">
        {label}
      </span>
      <input
        {...props}
        className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-flow focus:outline-none focus:ring-1 focus:ring-flow/40"
      />
    </label>
  );
}

export function SubmitPaymentForm({
  onClose,
  onSubmitted,
}: {
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [form, setForm] = useState<SubmitPaymentInput>(DEFAULTS);
  const [idempotencyKey, setIdempotencyKey] = useState(randomId);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const createdIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set =
    (k: keyof SubmitPaymentInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const input: SubmitPaymentInput = {
        ...form,
        reference: form.reference?.trim() || undefined,
      };
      const { payment, correlationId } = await submitPayment(input, idempotencyKey);
      const replayed = createdIds.current.has(payment.id);
      if (!replayed) createdIds.current.add(payment.id);
      setResult({
        kind: replayed ? 'replay' : 'new',
        id: payment.id,
        status: payment.status,
        correlationId,
      });
      onSubmitted();
    } catch (err) {
      setResult({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Submission failed',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Submit payment"
        className="relative flex h-full w-full max-w-md flex-col border-l border-line bg-panel shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">
              New payment
            </h2>
            <p className="font-mono text-[11px] text-faint">POST /v1/payments</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-panel-2 hover:text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-4 overflow-y-auto p-5"
        >
          <Field
            label="Customer ID"
            value={form.customerId}
            onChange={set('customerId')}
            autoFocus
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Source account"
              value={form.sourceAccount}
              onChange={set('sourceAccount')}
              required
            />
            <Field
              label="Destination account"
              value={form.destinationAccount}
              onChange={set('destinationAccount')}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Amount"
              value={form.amount}
              onChange={set('amount')}
              inputMode="decimal"
              pattern="\d+(\.\d{1,2})?"
              placeholder="250.00"
              required
            />
            <Field
              label="Reference"
              value={form.reference ?? ''}
              onChange={set('reference')}
              placeholder="PMT-1001"
            />
          </div>

          <label className="block">
            <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-muted">
              Idempotency key
            </span>
            <div className="flex gap-2">
              <input
                value={idempotencyKey}
                onChange={(e) => setIdempotencyKey(e.target.value)}
                className="w-full rounded-md border border-line bg-bg px-3 py-2 font-mono text-xs text-muted focus:border-flow focus:outline-none focus:ring-1 focus:ring-flow/40"
              />
              <button
                type="button"
                onClick={() => setIdempotencyKey(randomId())}
                title="Generate a new key"
                className="shrink-0 rounded-md border border-line-strong px-3 text-sm text-muted transition-colors hover:bg-panel-2 hover:text-ink"
              >
                New
              </button>
            </div>
            <p className="mt-1.5 text-xs text-faint">
              Reuse the same key to test duplicate prevention — the original
              payment is returned instead of creating a second.
            </p>
          </label>

          {result && (
            <div
              className={`rounded-md border px-4 py-3 text-sm ${RESULT_STYLE[result.kind]}`}
            >
              {result.kind === 'error' ? (
                <span>{result.message}</span>
              ) : (
                <div className="space-y-1">
                  <div className="font-medium">
                    {result.kind === 'replay'
                      ? 'Duplicate ignored — original returned'
                      : 'Accepted for processing'}
                  </div>
                  <div className="font-mono text-xs opacity-80">
                    {result.status} · {result.id}
                  </div>
                  {result.correlationId && (
                    <div className="font-mono text-[11px] opacity-70">
                      trace {result.correlationId}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </form>

        <footer className="border-t border-line p-5">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full rounded-md bg-flow px-4 py-2.5 text-sm font-semibold text-bg transition-colors hover:bg-flow/90 disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit payment'}
          </button>
        </footer>
      </aside>
    </div>
  );
}
