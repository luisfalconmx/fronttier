import type { Device, Emulation, PaneConfig, PaneToolsState, SyncFlags } from '../shared/types';
import { deviceById, PRESETS } from './devices';
import { uid } from './dom';

export type Layout = 'horizontal' | 'grid' | 'focus' | 'full';

export interface TabState {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  panes: PaneConfig[];
  css: string;
}

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  emulateDpr: boolean;
  sync: SyncFlags;
  homepage: string;
  searchEngine: 'duckduckgo' | 'google' | 'bing' | 'ecosia';
  cruxKey: string;
  formEmail: string;
  portalPort: number;
  portalPublic: boolean;
  layout: Layout;
  zoom: number;
  zoomFit: boolean;
  pageZoom: number;
  panelOpen: boolean;
  panelTab: string;
  panelWidth: number;
  headers: boolean;
  history: string[];
  bookmarks: { url: string; title: string }[];
  workspaces: (PaneConfig[] | null)[];
  emu: Emulation;
  tabs: TabState[];
  activeTab: string;
  defaultPreset: string;
}

export const DEFAULT_GEO = { lat: 19.4326, lng: -99.1332 };

export const DEFAULT_EMULATION: Emulation = {
  colorScheme: '',
  reducedMotion: '',
  forcedColors: '',
  contrast: '',
  reducedData: '',
  mediaType: '',
  locale: '',
  timezone: '',
  network: 'none',
  cpu: 1,
  disableJS: false,
  disableCache: false,
  geo: DEFAULT_GEO,
  vision: '',
};

export const DEFAULT_TOOLS: PaneToolsState = {
  layoutDebug: false,
  overflow: true,
  rulers: false,
  focusOrder: false,
  contrastBadges: false,
  grid: null,
  reference: null,
  simulator: '',
  disableCSS: false,
  disableImages: false,
  showAlt: false,
};

export function paneFromDevice(d: Device): PaneConfig {
  return { id: uid(), name: d.name, width: d.width, height: d.height, dpr: d.dpr, mobile: d.mobile, touch: d.touch, ua: d.ua, notch: d.notch, safeArea: d.safeArea, ui: d.ui, showUI: false, deviceId: d.id };
}

export function paneFromWidth(width: number, height = 900, name?: string): PaneConfig {
  const mobile = width < 768;
  return { id: uid(), name: name ?? `${width}px`, width, height: mobile ? Math.max(640, Math.round(width * 2)) : height, dpr: mobile ? 2 : 1, mobile: false, touch: false };
}

export function presetPanes(key: string): PaneConfig[] {
  const p = PRESETS[key] ?? PRESETS.default;
  if (p.devices) return p.devices.map((id) => paneFromDevice(deviceById(id)!));
  return (p.widths ?? []).map((w) => paneFromWidth(w));
}

export function newTab(url = '', panes?: PaneConfig[]): TabState {
  return { id: uid(), url, title: 'Nueva pestaña', panes: panes ?? presetPanes('default'), css: '' };
}

export function defaultSettings(): Settings {
  const tab = newTab();
  return {
    theme: 'system',
    emulateDpr: true,
    sync: { scroll: true, click: true, input: true, hover: true, keys: true, nav: true },
    homepage: '',
    searchEngine: 'duckduckgo',
    cruxKey: '',
    formEmail: 'prueba@example.com',
    portalPort: 7788,
    portalPublic: false,
    layout: 'horizontal',
    zoom: 1,
    zoomFit: true,
    pageZoom: 1,
    panelOpen: true,
    panelTab: 'meta',
    panelWidth: 380,
    headers: true,
    history: [],
    bookmarks: [],
    workspaces: [null, null, null, null, null],
    emu: { ...DEFAULT_EMULATION },
    tabs: [tab],
    activeTab: tab.id,
    defaultPreset: 'default',
  };
}

export function searchUrl(engine: Settings['searchEngine'], q: string) {
  const e = encodeURIComponent(q);
  return {
    duckduckgo: `https://duckduckgo.com/?q=${e}`,
    google: `https://www.google.com/search?q=${e}`,
    bing: `https://www.bing.com/search?q=${e}`,
    ecosia: `https://www.ecosia.org/search?q=${e}`,
  }[engine];
}

export function normalizeUrl(input: string, engine: Settings['searchEngine']) {
  const s = input.trim();
  if (!s) return '';
  if (/^(https?|file|view-source|data|about):/i.test(s)) return s;
  if (/^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0|(\d{1,3}\.){3}\d{1,3})(:\d+)?(\/.*)?$/i.test(s) || /^[\w-]+\.(local|test|localhost)(:\d+)?(\/.*)?$/i.test(s)) return 'http://' + s;
  if (/^[^\s]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(s)) return 'https://' + s;
  return searchUrl(engine, s);
}
