import type { WebhookDelivery } from '@/lib/types';
import { formatTime } from '@/lib/api';
import { DeliveryStatusTag } from './DeliveryStatusTag';

export function WebhookDeliveriesTable({
  deliveries,
}: {
  deliveries: WebhookDelivery[];
}) {
  if (deliveries.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-panel p-10 text-center text-sm text-muted">
        No deliveries yet. Register an endpoint, then complete a payment.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-panel">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-line bg-panel-2 text-left font-mono text-[11px] uppercase tracking-wider text-faint">
            <th className="px-4 py-2.5 font-medium">Event</th>
            <th className="px-4 py-2.5 font-medium">Endpoint</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium text-right">Attempts</th>
            <th className="px-4 py-2.5 font-medium">Last error</th>
            <th className="px-4 py-2.5 font-medium text-right">Updated</th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((d) => (
            <tr
              key={d.id}
              className="border-b border-line/60 transition-colors last:border-0 hover:bg-panel-2/40"
            >
              <td className="px-4 py-2.5 font-mono text-xs text-ink">
                {d.eventType}
              </td>
              <td
                className="max-w-[220px] truncate px-4 py-2.5 font-mono text-xs text-muted"
                title={d.url ?? d.endpointId}
              >
                {d.url ?? d.endpointId}
              </td>
              <td className="px-4 py-2.5">
                <DeliveryStatusTag status={d.status} />
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted">
                {d.attempts}
              </td>
              <td
                className="max-w-[200px] truncate px-4 py-2.5 text-xs text-faint"
                title={d.lastError ?? ''}
              >
                {d.lastError ?? '—'}
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted">
                {formatTime(d.deliveredAt ?? d.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
