// Core Web Vitals collected with PerformanceObserver inside each pane.
import type { Vitals } from '../shared/types';

export function collectVitals(report: (v: Vitals) => void) {
  const v: Vitals = {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const push = () => {
    clearTimeout(timer);
    timer = setTimeout(() => report({ ...v }), 300);
  };
  const observe = (type: string, cb: (entries: any[]) => void, extra: Record<string, unknown> = {}) => {
    try {
      new PerformanceObserver((list) => {
        cb(list.getEntries());
        push();
      }).observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
    } catch {}
  };

  observe('largest-contentful-paint', (es) => (v.lcp = es[es.length - 1].startTime));
  observe('paint', (es) => {
    for (const e of es) if (e.name === 'first-contentful-paint') v.fcp = e.startTime;
  });

  // CLS: largest session window (gap < 1s, window < 5s).
  let session = 0;
  let first = 0;
  let last = 0;
  observe('layout-shift', (es) => {
    for (const e of es) {
      if (e.hadRecentInput) continue;
      if (session && e.startTime - last < 1000 && e.startTime - first < 5000) session += e.value;
      else {
        session = e.value;
        first = e.startTime;
      }
      last = e.startTime;
      v.cls = Math.max(v.cls ?? 0, session);
    }
  });

  // INP approximation: worst interaction latency seen so far.
  observe('event', (es) => {
    for (const e of es) if (e.interactionId) v.inp = Math.max(v.inp ?? 0, e.duration);
  }, { durationThreshold: 16 });

  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (nav) v.ttfb = nav.responseStart;
  addEventListener('load', () => {
    const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (n) v.ttfb = n.responseStart;
    push();
  });
}
