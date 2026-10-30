// Injected by Portal into pages served to real devices: mirrors interactions
// with the Fronttier app over a WebSocket.
import { createSync } from '../shared/sync-core';
import type { SyncEvent } from '../shared/types';

(() => {
  if ((window as any).__fronttierPortal) return;
  (window as any).__fronttierPortal = true;
  const flags = { scroll: true, click: true, input: true, hover: false, keys: true, nav: true };
  let ws: WebSocket | null = null;
  let badge: HTMLElement | null = null;

  const sync = createSync({ flags: () => flags, send: (ev) => send(ev) });

  function send(ev: SyncEvent) {
    if (ws?.readyState === 1) ws.send(JSON.stringify(ev));
  }

  function setBadge(online: boolean) {
    if (!document.body) return;
    if (!badge) {
      badge = document.createElement('fronttier-overlay');
      badge.style.cssText = 'position:fixed;z-index:2147483647;bottom:8px;right:8px;font:600 11px/1 system-ui,sans-serif;padding:5px 8px;border-radius:12px;color:#fff;pointer-events:none;opacity:.85';
      document.body.appendChild(badge);
    }
    badge.textContent = online ? '● Fronttier Portal' : '○ Portal desconectado';
    badge.style.background = online ? '#e7000b' : '#6b7280';
  }

  function connect() {
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/__fronttier/ws');
    ws.onopen = () => {
      setBadge(true);
      send({ t: 'nav', url: location.pathname + location.search + location.hash });
    };
    ws.onclose = () => {
      setBadge(false);
      setTimeout(connect, 1500);
    };
    ws.onmessage = (m) => {
      let ev: SyncEvent;
      try {
        ev = JSON.parse(m.data);
      } catch {
        return;
      }
      if (ev.t === 'nav') {
        if (location.pathname + location.search + location.hash !== ev.url) location.href = ev.url;
        return;
      }
      sync.apply(ev);
    };
  }

  // Report link navigations that happen on the device.
  let last = location.href;
  setInterval(() => {
    if (location.href !== last) {
      last = location.href;
      send({ t: 'nav', url: location.pathname + location.search + location.hash });
    }
  }, 500);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setBadge(false));
  connect();
})();
