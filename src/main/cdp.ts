// Chrome DevTools Protocol access for pane webContents: emulation, network
// accounting and screenshots.
import { webContents, type WebContents } from 'electron';
import type { EmulatePayload, NetRequest, NetSummary, NetworkPreset } from '../shared/types';

const attached = new Set<number>();
const lastEmulation = new Map<number, string>();
const geoScript = new Map<number, string>();

interface NetState {
  reqs: Map<string, NetRequest>;
  navStart?: number;
  load?: number;
  dcl?: number;
  timer?: NodeJS.Timeout;
}
const net = new Map<number, NetState>();
let netListener: ((s: NetSummary) => void) | null = null;

export function onNetwork(cb: (s: NetSummary) => void) {
  netListener = cb;
}

export function getWC(id: number): WebContents {
  const wc = webContents.fromId(id);
  if (!wc || wc.isDestroyed()) throw new Error('El panel ya no existe');
  return wc;
}

function state(id: number) {
  let s = net.get(id);
  if (!s) net.set(id, (s = { reqs: new Map() }));
  return s;
}

function pushNet(id: number) {
  const s = state(id);
  if (s.timer) return;
  s.timer = setTimeout(() => {
    s.timer = undefined;
    const requests = [...s.reqs.values()];
    const origins = new Set<string>();
    let bytes = 0;
    for (const r of requests) {
      bytes += r.size ?? 0;
      try {
        origins.add(new URL(r.url).origin);
      } catch {}
    }
    netListener?.({ wcId: id, count: requests.length, bytes, load: s.load, dcl: s.dcl, origins: [...origins].filter((o) => o !== 'null'), requests: requests.slice(-600) });
  }, 250);
}

export function resetNetwork(id: number) {
  const s = state(id);
  s.reqs.clear();
  s.navStart = s.load = s.dcl = undefined;
  pushNet(id);
}

function onMessage(id: number, method: string, p: any) {
  const s = state(id);
  switch (method) {
    case 'Network.requestWillBeSent': {
      if (p.type === 'Document' && p.requestId === p.loaderId && s.navStart === undefined) s.navStart = p.timestamp;
      const prev = s.reqs.get(p.requestId);
      s.reqs.set(p.requestId, { ...prev, id: p.requestId, url: p.request.url, method: p.request.method, type: p.type ?? 'Other', start: p.timestamp });
      if (s.reqs.size > 2000) s.reqs.delete(s.reqs.keys().next().value!);
      break;
    }
    case 'Network.responseReceived': {
      const r = s.reqs.get(p.requestId);
      if (r) Object.assign(r, { status: p.response.status, mime: p.response.mimeType, cached: !!(p.response.fromDiskCache || p.response.fromServiceWorker || p.response.fromPrefetchCache) });
      break;
    }
    case 'Network.loadingFinished': {
      const r = s.reqs.get(p.requestId);
      if (r) Object.assign(r, { size: p.encodedDataLength, end: p.timestamp });
      break;
    }
    case 'Network.loadingFailed': {
      const r = s.reqs.get(p.requestId);
      if (r) Object.assign(r, { failed: p.errorText || 'failed', end: p.timestamp });
      break;
    }
    case 'Page.loadEventFired':
      if (s.navStart !== undefined) s.load = (p.timestamp - s.navStart) * 1000;
      break;
    case 'Page.domContentEventFired':
      if (s.navStart !== undefined) s.dcl = (p.timestamp - s.navStart) * 1000;
      break;
    default:
      return;
  }
  pushNet(id);
}

export async function ensureAttached(id: number) {
  if (attached.has(id)) return getWC(id);
  const wc = getWC(id);
  if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
  attached.add(id);
  wc.debugger.on('message', (_e, method, params) => onMessage(id, method, params));
  wc.debugger.on('detach', () => attached.delete(id));
  wc.once('destroyed', () => {
    attached.delete(id);
    net.delete(id);
    lastEmulation.delete(id);
    geoScript.delete(id);
  });
  wc.on('did-start-navigation', (d) => {
    if (d.isMainFrame && !d.isSameDocument) resetNetwork(id);
  });
  await Promise.all([wc.debugger.sendCommand('Network.enable'), wc.debugger.sendCommand('Page.enable')]);
  return wc;
}

export async function cdp(id: number, method: string, params: Record<string, unknown> = {}) {
  const wc = await ensureAttached(id);
  return wc.debugger.sendCommand(method, params);
}

async function quiet(id: number, method: string, params: Record<string, unknown> = {}) {
  try {
    return await cdp(id, method, params);
  } catch {
    return undefined;
  }
}

const NETWORK: Record<NetworkPreset, { offline: boolean; latency: number; downloadThroughput: number; uploadThroughput: number }> = {
  none: { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
  fast4g: { offline: false, latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 },
  fast3g: { offline: false, latency: 563, downloadThroughput: (1.44 * 1024 * 1024) / 8, uploadThroughput: (675 * 1024) / 8 },
  slow3g: { offline: false, latency: 2000, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 },
  offline: { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
};

// Pages that ask for the position while loading (Google Maps on a mobile UA)
// can reach Chromium's real provider before the CDP override lands in a fresh
// renderer, and that request never settles. This shim answers from the page's
// own realm before any page script runs; re-running it just moves the position.
function geoShim(lat: number, lng: number) {
  return `(() => {
  const KEY = Symbol.for('fronttier.geo');
  if (window[KEY]) return window[KEY](${lat}, ${lng});
  if (!navigator.geolocation) return;
  let cur = { lat: ${lat}, lng: ${lng} };
  const watchers = new Map();
  let nextId = 1;
  const make = (proto, props) => {
    const o = Object.create(proto);
    for (const k in props) Object.defineProperty(o, k, { value: props[k], enumerable: k !== 'toJSON' });
    return o;
  };
  const position = () => {
    const c = { latitude: cur.lat, longitude: cur.lng, accuracy: 30, altitude: null, altitudeAccuracy: null, heading: null, speed: null };
    const timestamp = Date.now();
    const coords = make(GeolocationCoordinates.prototype, { ...c, toJSON: () => c });
    return make(GeolocationPosition.prototype, { coords, timestamp, toJSON: () => ({ coords: c, timestamp }) });
  };
  const fire = (ok) => setTimeout(() => ok(position()), 0);
  const methods = {
    getCurrentPosition(ok) { if (typeof ok === 'function') fire(ok); },
    watchPosition(ok) {
      const id = nextId++;
      if (typeof ok === 'function') (watchers.set(id, ok), fire(ok));
      return id;
    },
    clearWatch(id) { watchers.delete(id); },
  };
  const proto = Object.getPrototypeOf(navigator.geolocation);
  for (const k in methods) Object.defineProperty(proto, k, { value: methods[k], writable: true, configurable: true });
  Object.defineProperty(window, KEY, { value: (lat, lng) => { cur = { lat, lng }; watchers.forEach(fire); } });
})();`;
}

async function setGeo(id: number, geo: { lat: number; lng: number }) {
  await quiet(id, 'Emulation.setGeolocationOverride', { latitude: geo.lat, longitude: geo.lng, accuracy: 30 });
  const source = geoShim(geo.lat, geo.lng);
  const prev = geoScript.get(id);
  if (prev) await quiet(id, 'Page.removeScriptToEvaluateOnNewDocument', { identifier: prev });
  const added = (await quiet(id, 'Page.addScriptToEvaluateOnNewDocument', { source })) as { identifier: string } | undefined;
  if (added) geoScript.set(id, added.identifier);
  await quiet(id, 'Runtime.evaluate', { expression: source });
}

export async function emulate(id: number, p: EmulatePayload, defaultUA: string) {
  // Skip identical re-applies (resizes fire often) to keep CDP traffic low.
  const key = JSON.stringify(p);
  if (lastEmulation.get(id) === key) return;
  lastEmulation.set(id, key);
  const { pane, viewport, emu } = p;

  await quiet(id, 'Emulation.setDeviceMetricsOverride', {
    width: Math.round(viewport.width),
    height: Math.round(viewport.height),
    deviceScaleFactor: p.emulateDpr ? pane.dpr : 0,
    mobile: pane.mobile,
    screenWidth: pane.width,
    screenHeight: pane.height,
  });
  await quiet(id, 'Emulation.setUserAgentOverride', {
    userAgent: pane.ua || defaultUA,
    acceptLanguage: emu.locale || undefined,
  });
  await quiet(id, 'Emulation.setTouchEmulationEnabled', { enabled: pane.touch, maxTouchPoints: pane.touch ? 5 : 1 });
  await quiet(id, 'Emulation.setEmitTouchEventsForMouse', { enabled: pane.touch, configuration: pane.mobile ? 'mobile' : 'desktop' });
  await quiet(id, 'Emulation.setEmulatedMedia', {
    media: emu.mediaType,
    features: [
      { name: 'prefers-color-scheme', value: pane.colorScheme || emu.colorScheme },
      { name: 'prefers-reduced-motion', value: emu.reducedMotion },
      { name: 'forced-colors', value: emu.forcedColors },
      { name: 'prefers-contrast', value: emu.contrast },
      { name: 'prefers-reduced-data', value: emu.reducedData },
    ],
  });
  await quiet(id, 'Emulation.setLocaleOverride', {});
  if (emu.locale) await quiet(id, 'Emulation.setLocaleOverride', { locale: emu.locale });
  await quiet(id, 'Emulation.setTimezoneOverride', { timezoneId: emu.timezone || '' });
  await quiet(id, 'Network.emulateNetworkConditions', NETWORK[emu.network] ?? NETWORK.none);
  await quiet(id, 'Emulation.setCPUThrottlingRate', { rate: Math.max(1, emu.cpu || 1) });
  await quiet(id, 'Emulation.setScriptExecutionDisabled', { value: emu.disableJS });
  await quiet(id, 'Network.setCacheDisabled', { cacheDisabled: emu.disableCache });
  // Never clear: without the override Chromium falls back to Google's network
  // location service, which needs an API key and fails in every pane.
  const geo = emu.geo ?? { lat: 19.4326, lng: -99.1332 };
  await setGeo(id, geo);
  await quiet(id, 'Emulation.setEmulatedVisionDeficiency', { type: emu.vision || 'none' });
  const sa = pane.safeArea ?? { top: 0, right: 0, bottom: 0, left: 0 };
  await quiet(id, 'Emulation.setSafeAreaInsetsOverride', { insets: { top: sa.top, left: sa.left, bottom: sa.bottom, right: sa.right } });
}
