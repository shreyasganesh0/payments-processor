'use client';

import { useEffect, useRef } from 'react';

/**
 * Runs `fn` immediately and then every `intervalMs`. Pauses while the tab is
 * hidden and fires an immediate refresh when it becomes visible again, so a
 * backgrounded dashboard doesn't hammer the API.
 */
export function usePolling(
  fn: () => void | Promise<void>,
  intervalMs: number,
  enabled = true,
) {
  const saved = useRef(fn);
  useEffect(() => {
    saved.current = fn;
  }, [fn]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const run = () => {
      if (!cancelled && document.visibilityState === 'visible') {
        void saved.current();
      }
    };
    run();
    const id = setInterval(run, intervalMs);
    document.addEventListener('visibilitychange', run);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', run);
    };
  }, [intervalMs, enabled]);
}
