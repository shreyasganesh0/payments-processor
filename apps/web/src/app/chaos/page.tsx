'use client';

import { useCallback, useRef, useState } from 'react';
import type { BankConfig, BankMode } from '@/lib/types';
import { getBankConfig, updateBankConfig, formatTime } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';

const POLL_MS = 3000;

const MODES: {
  value: BankMode;
  label: string;
  hint: string;
  dot: string;
}[] = [
  {
    value: 'always_authorize',
    label: 'Authorize',
    hint: 'Every payment succeeds.',
    dot: 'bg-st-completed',
  },
  {
    value: 'always_decline',
    label: 'Decline',
    hint: 'Every payment is declined — terminal, no retry.',
    dot: 'bg-st-failed',
  },
  {
    value: 'always_error',
    label: 'Error',
    hint: 'Bank unavailable — retries with backoff, then FAILED.',
    dot: 'bg-st-retrying',
  },
  {
    value: 'fail_n_then_authorize',
    label: 'Fail N then heal',
    hint: 'Fail the first N attempts, then succeed.',
    dot: 'bg-st-processing',
  },
];

export default function ChaosPage() {
  const [config, setConfig] = useState<BankConfig | null>(null);
  const [mode, setMode] = useState<BankMode>('always_authorize');
  const [latencyMs, setLatencyMs] = useState(200);
  const [failN, setFailN] = useState(2);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const c = await getBankConfig();
      setConfig(c);
      // seed the form once; don't clobber in-progress edits on later polls
      if (!initialized.current) {
        setMode(c.mode);
        setLatencyMs(c.latencyMs);
        setFailN(c.failN);
        initialized.current = true;
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load bank config');
    }
  }, []);

  usePolling(refresh, POLL_MS);

  async function apply() {
    setApplying(true);
    setError(null);
    try {
      const c = await updateBankConfig({ mode, latencyMs, failN });
      setConfig(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply');
    } finally {
      setApplying(false);
    }
  }

  const dirty =
    !!config &&
    (config.mode !== mode ||
      config.latencyMs !== latencyMs ||
      config.failN !== failN);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Chaos
          </h1>
          <p className="mt-1 text-sm text-muted">
            Drive the simulated bank to exercise the failure and recovery paths.
          </p>
        </div>
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-faint">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-flow" />
          {config
            ? `live · bank ${config.mode} · updated ${formatTime(config.updatedAt)}`
            : 'connecting…'}
        </span>
      </header>

      {error && (
        <div className="mt-6 rounded-md border border-st-failed/30 bg-st-failed/10 px-4 py-3 text-sm text-st-failed">
          {error}
        </div>
      )}

      <section className="mt-8 rounded-lg border border-line bg-panel p-5">
        <h2 className="font-mono text-[11px] uppercase tracking-wide text-muted">
          Bank mode
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {MODES.map((m) => {
            const active = mode === m.value;
            return (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={`rounded-md border p-3 text-left transition-colors ${
                  active
                    ? 'border-flow/60 bg-panel-2'
                    : 'border-line hover:border-line-strong hover:bg-panel-2/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-[2px] ${m.dot}`} />
                  <span className="text-sm font-medium text-ink">{m.label}</span>
                </div>
                <p className="mt-1 text-xs text-muted">{m.hint}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-muted">
              Latency (ms)
            </span>
            <input
              type="number"
              min={0}
              max={30000}
              value={latencyMs}
              onChange={(e) => setLatencyMs(Number(e.target.value))}
              className="w-full rounded-md border border-line bg-bg px-3 py-2 font-mono text-sm text-ink focus:border-flow focus:outline-none focus:ring-1 focus:ring-flow/40"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-muted">
              Fail N{' '}
              <span className="text-faint normal-case">(fail-n mode)</span>
            </span>
            <input
              type="number"
              min={0}
              max={100}
              value={failN}
              disabled={mode !== 'fail_n_then_authorize'}
              onChange={(e) => setFailN(Number(e.target.value))}
              className="w-full rounded-md border border-line bg-bg px-3 py-2 font-mono text-sm text-ink focus:border-flow focus:outline-none focus:ring-1 focus:ring-flow/40 disabled:opacity-40"
            />
          </label>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] text-faint">
            {dirty ? 'unsaved changes' : 'in sync with bank'}
          </span>
          <button
            onClick={apply}
            disabled={applying || !dirty}
            className="rounded-md bg-flow px-4 py-2 text-sm font-semibold text-bg transition-colors hover:bg-flow/90 disabled:opacity-50"
          >
            {applying ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </section>

      <p className="mt-4 text-xs text-faint">
        Changes are written to <span className="font-mono">bank_config</span> and
        picked up by the worker on its next config-sync tick.
      </p>
    </main>
  );
}
