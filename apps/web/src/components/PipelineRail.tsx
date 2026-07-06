import type { Payment, PaymentStatus } from '@/lib/types';

const STATES: {
  key: PaymentStatus;
  label: string;
  text: string;
  bar: string;
}[] = [
  { key: 'PENDING', label: 'Pending', text: 'text-st-pending', bar: 'bg-st-pending' },
  { key: 'PROCESSING', label: 'Processing', text: 'text-st-processing', bar: 'bg-st-processing' },
  { key: 'RETRYING', label: 'Retrying', text: 'text-st-retrying', bar: 'bg-st-retrying' },
  { key: 'COMPLETED', label: 'Completed', text: 'text-st-completed', bar: 'bg-st-completed' },
  { key: 'FAILED', label: 'Failed', text: 'text-st-failed', bar: 'bg-st-failed' },
];

function tally(payments: Payment[]): Record<PaymentStatus, number> {
  const counts: Record<PaymentStatus, number> = {
    PENDING: 0,
    PROCESSING: 0,
    RETRYING: 0,
    COMPLETED: 0,
    FAILED: 0,
  };
  for (const p of payments) counts[p.status] += 1;
  return counts;
}

export function PipelineRail({ payments }: { payments: Payment[] }) {
  const counts = tally(payments);
  const total = payments.length;

  return (
    <section aria-label="Payment lifecycle overview">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STATES.map((s) => (
          <div
            key={s.key}
            className="rounded-lg border border-line bg-panel px-4 py-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wide text-muted">
                {s.label}
              </span>
              <span className={`h-2 w-2 rounded-[2px] ${s.bar}`} />
            </div>
            <div
              className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
                counts[s.key] > 0 ? s.text : 'text-faint'
              }`}
            >
              {counts[s.key]}
            </div>
          </div>
        ))}
      </div>

      {/* stacked proportion bar */}
      <div
        className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-panel-2"
        role="img"
        aria-label={`Distribution of ${total} payments across lifecycle states`}
      >
        {total > 0 &&
          STATES.filter((s) => counts[s.key] > 0).map((s) => (
            <div
              key={s.key}
              style={{ width: `${(counts[s.key] / total) * 100}%` }}
              className={`${s.bar} transition-[width] duration-500 ease-out`}
            />
          ))}
      </div>
    </section>
  );
}
