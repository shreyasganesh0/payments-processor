import type { PaymentStatus } from '@/lib/types';

const STYLES: Record<PaymentStatus, string> = {
  PENDING: 'bg-st-pending/10 text-st-pending ring-st-pending/30',
  PROCESSING: 'bg-st-processing/10 text-st-processing ring-st-processing/30',
  RETRYING: 'bg-st-retrying/10 text-st-retrying ring-st-retrying/30',
  COMPLETED: 'bg-st-completed/10 text-st-completed ring-st-completed/30',
  FAILED: 'bg-st-failed/10 text-st-failed ring-st-failed/30',
};

export function StatusTag({ status }: { status: PaymentStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider ring-1 ring-inset ${STYLES[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-[1px] bg-current" />
      {status}
    </span>
  );
}
