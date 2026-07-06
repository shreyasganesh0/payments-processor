import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ArchNode, ArchKind } from '@/lib/architecture';

const ACCENT: Record<ArchKind, string> = {
  process: 'border-flow/50',
  store: 'border-st-processing/50',
  external: 'border-line-strong',
};

const KIND_LABEL: Record<ArchKind, string> = {
  process: 'service',
  store: 'datastore',
  external: 'external',
};

const DOT: Record<ArchKind, string> = {
  process: 'bg-flow',
  store: 'bg-st-processing',
  external: 'bg-faint',
};

const H = '!h-1.5 !w-1.5 !min-w-0 !border-0 !bg-line-strong';

export function ArchNodeCard({ data, selected }: NodeProps<ArchNode>) {
  return (
    <div
      className={`rounded-md border bg-panel-2 px-3 py-2 shadow-sm transition-shadow ${ACCENT[data.kind]} ${
        selected ? 'ring-2 ring-flow/60' : ''
      }`}
      style={{ width: 156 }}
    >
      <Handle id="tt" type="target" position={Position.Top} className={H} />
      <Handle id="tl" type="target" position={Position.Left} className={H} />
      <Handle id="tr" type="target" position={Position.Right} className={H} />
      <Handle id="tb" type="target" position={Position.Bottom} className={H} />
      <Handle id="st" type="source" position={Position.Top} className={H} />
      <Handle id="sl" type="source" position={Position.Left} className={H} />
      <Handle id="sr" type="source" position={Position.Right} className={H} />
      <Handle id="sb" type="source" position={Position.Bottom} className={H} />

      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-[1px] ${DOT[data.kind]}`} />
        <span className="font-mono text-[9px] uppercase tracking-wide text-faint">
          {KIND_LABEL[data.kind]}
        </span>
      </div>
      <div className="mt-0.5 text-sm font-medium text-ink">{data.label}</div>
    </div>
  );
}
