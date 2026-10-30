// Preload for every pane <webview>. Runs in an isolated world: it can read
// and annotate the page DOM but the page cannot reach it.
import { ipcRenderer } from 'electron';
import { createSync } from '../shared/sync-core';
import type { PaneInit, PaneToolsState, SyncFlags } from '../shared/types';
import { installInspector } from '../pane/inspect';
import { applyTools, overflowCheck, tabOrder, watchOverflow } from '../pane/overlays';
import { applySimulator } from '../pane/simulators';
import * as tools from '../pane/tools';
import { collectVitals } from '../pane/vitals';

const OFF: SyncFlags = { scroll: false, click: false, input: false, hover: false, keys: false, nav: false };
let state: PaneInit | null = null;
let simulator = '';

const toHost = (channel: string, ...args: unknown[]) => ipcRenderer.sendToHost(channel, ...args);

const sync = createSync({
  flags: () => state?.sync ?? OFF,
  send: (ev) => toHost('sync', ev),
  hoverAt: (x, y) => toHost('hover-at', x, y),
});

// Tells the host which pane the user is driving, so only that pane's in-page
// URL changes are mirrored (Google Maps rewrites its URL on every camera move).
let lastInput = 0;
for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
  addEventListener(
    type,
    (e) => {
      const now = Date.now();
      if (!e.isTrusted || now - lastInput < 250) return;
      lastInput = now;
      toHost('user-input');
    },
    { capture: true, passive: true },
  );
}

function whenReady(fn: () => void) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
  else fn();
}

function applyAll(t: PaneToolsState) {
  whenReady(() => {
    applyTools(t);
    if (t.simulator !== simulator) {
      simulator = t.simulator;
      applySimulator(simulator);
    }
  });
}

const handlers: Record<string, (args: any) => unknown> = {
  meta: () => tools.meta(),
  outline: () => tools.outline(),
  images: () => tools.images(),
  contrast: () => tools.contrastAudit(),
  breakpoints: () => tools.breakpoints(),
  dom: (a) => tools.domChildren(a?.sel),
  highlight: (a) => tools.highlight(a.sel, !!a.scroll),
  domEdit: (a) => tools.domEdit(a),
  fillForms: (a) => tools.fillForms(a?.email ?? state?.formEmail ?? 'prueba@example.com'),
  clearForms: () => tools.clearForms(),
  storage: () => tools.storage(),
  storageEdit: (a) => tools.storageEdit(a),
  selectorAt: (a) => tools.selectorAt(a.x, a.y),
  reloadCSS: () => tools.reloadCSS(),
  reader: () => tools.reader(),
  html: () => tools.html(),
  overflow: () => overflowCheck(false),
  focusOrder: () => tabOrder().map((e) => ({ tag: e.tagName.toLowerCase(), name: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 60), tabIndex: e.tabIndex })),
};

ipcRenderer.on('init', (_e, data: PaneInit) => {
  state = data;
  applyAll(data.tools);
});

ipcRenderer.on('tools-state', (_e, t: PaneToolsState) => {
  if (state) state.tools = t;
  applyAll(t);
});

ipcRenderer.on('sync-flags', (_e, flags: SyncFlags) => {
  if (state) state.sync = flags;
});

ipcRenderer.on('sync', (_e, ev) => whenReady(() => sync.apply(ev)));

ipcRenderer.on('spa-nav', (_e, url: string) => {
  if (location.href === url) return;
  const next = new URL(url);
  if (next.origin + next.pathname + next.search === location.origin + location.pathname + location.search) {
    location.hash = next.hash;
    return;
  }
  history.pushState(history.state, '', url);
  dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
});

ipcRenderer.on('tool', async (_e, id: number, name: string, args: unknown) => {
  try {
    const fn = handlers[name];
    if (!fn) throw new Error('Herramienta desconocida: ' + name);
    toHost('tool-result', id, await fn(args), null);
  } catch (err: any) {
    toHost('tool-result', id, null, String(err?.message ?? err));
  }
});

installInspector();
collectVitals((v) => toHost('vitals', v));
watchOverflow((r) => toHost('overflow', { overflow: r.overflow, amount: r.amount, count: r.offenders.length }));
