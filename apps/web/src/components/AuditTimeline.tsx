import type { PaymentEvent, PaymentStatus } from '@/lib/types';
import { formatTime } from '@/lib/api';
import { StatusTag } from './StatusTag';

const DOT: Record<PaymentStatus, string> = {
  PENDING: 'bg-st-pending',
  PROCESSING: 'bg-st-processing',
  RETRYING: 'bg-st-retrying',
  COMPLETED: 'bg-st-completed',
  FAILED: 'bg-st-failed',
};

function sincePrev(curr: string, prev: string): string {
  const ms = new Date(curr).getTime() - new Date(prev).getTime();
  if (ms < 0) return '';
  const s = ms / 1000;
  return s < 60 ? `+${s.toFixed(1)}s` : `+${(s / 60).toFixed(1)}m`;
}

export function AuditTimeline({ events }: { events: PaymentEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-panel p-6 text-center text-sm text-muted">
        No transitions yet — the payment is queued and still PENDING.
      </div>
    );
  }

  return (
    <ol className="relative ml-1 border-l border-line">
      {events.map((e, i) => (
        <li key={e.id} className="relative py-3 pl-6 pr-1">
          <span
            className={`absolute -left-[6px] top-4 h-3 w-3 rounded-full ring-4 ring-bg ${DOT[e.toStatus]}`}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {e.fromStatus ? (
                <StatusTag status={e.fromStatus} />
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
                  start
                </span>
              )}
              <span className="text-faint">→</span>
              <StatusTag status={e.toStatus} />
            </div>
            <time className="font-mono text-xs text-muted">
              {formatTime(e.occurredAt)}
              {i > 0 && (
                <span className="text-faint">
                  {' · '}
                  {sincePrev(e.occurredAt, events[i - 1].occurredAt)}
                </span>
              )}
            </time>
          </div>
          {e.metadata && Object.keys(e.metadata).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(e.metadata).map(([k, v]) => (
                <span
                  key={k}
                  className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[11px] text-muted"
                >
                  {k} <span className="text-ink">{String(v)}</span>
                </span>
              ))}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
