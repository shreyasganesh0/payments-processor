import type { WebhookDeliveryStatus } from '@/lib/types';

const STYLES: Record<WebhookDeliveryStatus, string> = {
  pending: 'bg-st-pending/10 text-st-pending ring-st-pending/30',
  delivered: 'bg-st-completed/10 text-st-completed ring-st-completed/30',
  failed: 'bg-st-retrying/10 text-st-retrying ring-st-retrying/30',
  dead: 'bg-st-failed/10 text-st-failed ring-st-failed/30',
};

export function DeliveryStatusTag({ status }: { status: WebhookDeliveryStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider ring-1 ring-inset ${STYLES[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-[1px] bg-current" />
      {status}
    </span>
  );
}
