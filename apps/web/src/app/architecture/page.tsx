'use client';

import { useCallback, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  archNodes,
  archEdges,
  type ArchNode,
  type ArchNodeData,
} from '@/lib/architecture';
import { ArchNodeCard } from '@/components/ArchNodeCard';

const nodeTypes = { arch: ArchNodeCard };

const defaultEdgeOptions = {
  style: { stroke: 'var(--color-line-strong)', strokeWidth: 1.5 },
  labelStyle: {
    fill: 'var(--color-muted)',
    fontFamily: 'var(--font-geist-mono)',
    fontSize: 10,
  },
  labelBgStyle: { fill: 'var(--color-bg)' },
  labelBgPadding: [4, 2] as [number, number],
};

export default function ArchitecturePage() {
  const [selected, setSelected] = useState<ArchNodeData | null>(null);

  const onNodeClick = useCallback<NodeMouseHandler<ArchNode>>((_, node) => {
    setSelected(node.data);
  }, []);

  return (
    <div className="relative h-screen w-full">
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 px-6 py-5">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Architecture
        </h1>
        <p className="mt-1 text-sm text-muted">
          Click a component to see its responsibilities, failure modes, and the
          decision behind it.
        </p>
      </div>

      <ReactFlow
        nodes={archNodes}
        edges={archEdges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodeClick={onNodeClick}
        onPaneClick={() => setSelected(null)}
        colorMode="dark"
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        nodesDraggable={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>

      {selected && (
        <aside className="absolute right-0 top-0 z-20 flex h-full w-full max-w-md flex-col border-l border-line bg-panel shadow-2xl">
          <header className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wide text-faint">
                {selected.kind}
              </div>
              <h2 className="font-display text-lg font-semibold text-ink">
                {selected.label}
              </h2>
            </div>
            <button
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="rounded-md p-1.5 text-muted transition-colors hover:bg-panel-2 hover:text-ink"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </header>

          <div className="flex-1 space-y-6 overflow-y-auto p-5">
            <section>
              <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wide text-muted">
                Responsibilities
              </h3>
              <ul className="space-y-2">
                {selected.responsibilities.map((r) => (
                  <li key={r} className="flex gap-2 text-sm text-ink">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-flow" />
                    {r}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wide text-muted">
                Failure modes
              </h3>
              <ul className="space-y-2">
                {selected.failureModes.map((f) => (
                  <li key={f} className="flex gap-2 text-sm text-muted">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-st-retrying" />
                    {f}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wide text-muted">
                Decisions
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {selected.adrs.map((a) => (
                  <span
                    key={a}
                    className="rounded bg-panel-2 px-2 py-1 font-mono text-[11px] text-muted ring-1 ring-inset ring-line"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </section>
          </div>
        </aside>
      )}
    </div>
  );
}
