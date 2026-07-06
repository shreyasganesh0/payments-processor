import Link from 'next/link';
import type { Payment } from '@/lib/types';
import { formatMoney, formatTime } from '@/lib/api';
import { StatusTag } from './StatusTag';

export function PaymentsTable({ payments }: { payments: Payment[] }) {
  if (payments.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-panel p-10 text-center text-sm text-muted">
        No payments yet. Submit one to see it move through the pipeline.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-panel">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line bg-panel-2 text-left font-mono text-[11px] uppercase tracking-wider text-faint">
            <th className="px-4 py-2.5 font-medium">Payment</th>
            <th className="px-4 py-2.5 font-medium">Customer</th>
            <th className="px-4 py-2.5 font-medium text-right">Amount</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium text-right">Updated</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr
              key={p.id}
              className="border-b border-line/60 transition-colors last:border-0 hover:bg-panel-2/40"
            >
              <td className="px-4 py-2.5 font-mono text-xs" title={p.id}>
                <Link
                  href={`/payments/${p.id}`}
                  className="transition-colors hover:text-flow"
                >
                  <span className="text-ink">{p.id.slice(0, 8)}</span>
                  <span className="text-faint">…{p.id.slice(-4)}</span>
                </Link>
              </td>
              <td className="px-4 py-2.5 text-muted">{p.customerId}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink">
                {formatMoney(p.amountCents, p.currency)}
              </td>
              <td className="px-4 py-2.5">
                <StatusTag status={p.status} />
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted">
                {formatTime(p.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
