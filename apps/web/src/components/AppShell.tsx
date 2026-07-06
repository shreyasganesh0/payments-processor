'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: 'Payments' },
  { href: '/webhooks', label: 'Webhooks' },
  { href: '/chaos', label: 'Chaos' },
  { href: '/architecture', label: 'Architecture' },
] as const;

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-4 w-4 rotate-45 rounded-[3px] bg-flow shadow-[0_0_12px_theme(colors.flow/40%)]" />
      <span className="font-display text-[17px] font-bold tracking-tight text-ink">
        ACH<span className="text-flow">FLOW</span>
      </span>
    </div>
  );
}

function NavItems({
  pathname,
  onNavigate,
  orientation,
}: {
  pathname: string;
  onNavigate?: () => void;
  orientation: 'vertical' | 'horizontal';
}) {
  return (
    <>
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={`group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
              orientation === 'horizontal' ? 'shrink-0' : ''
            } ${
              active
                ? 'bg-panel-2 text-ink'
                : 'text-muted hover:bg-panel-2/50 hover:text-ink'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-[2px] transition-colors ${
                active ? 'bg-flow' : 'bg-line-strong group-hover:bg-muted'
              }`}
            />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      {/* desktop rail */}
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line bg-panel md:flex">
        <div className="border-b border-line px-5 py-5">
          <Wordmark />
          <p className="mt-1.5 pl-[26px] font-mono text-[11px] tracking-wide text-faint">
            payments console
          </p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          <NavItems pathname={pathname} orientation="vertical" />
        </nav>
        <div className="flex items-center gap-2 border-t border-line px-5 py-4 font-mono text-[11px] text-faint">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-flow" />
          pipeline online
        </div>
      </aside>

      {/* main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* mobile top nav */}
        <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-line bg-panel/95 px-4 py-3 backdrop-blur md:hidden">
          <Wordmark />
          <nav className="flex flex-1 gap-1 overflow-x-auto">
            <NavItems pathname={pathname} orientation="horizontal" />
          </nav>
        </div>
        {children}
      </div>
    </div>
  );
}
