export type NotchKind = 'none' | 'notch' | 'island' | 'punch';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Browser chrome (status bar + URL bar) that a real mobile browser takes from the viewport. */
export interface BrowserUI {
  top: number;
  bottom: number;
}

export interface Device {
  id: string;
  name: string;
  group: 'phone' | 'tablet' | 'laptop' | 'desktop' | 'other';
  width: number;
  height: number;
  dpr: number;
  mobile: boolean;
  touch: boolean;
  ua?: string;
  notch?: NotchKind;
  safeArea?: Insets;
  ui?: BrowserUI;
}

export interface PaneConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  dpr: number;
  mobile: boolean;
  touch: boolean;
  ua?: string;
  notch?: NotchKind;
  safeArea?: Insets;
  ui?: BrowserUI;
  showUI?: boolean;
  deviceId?: string;
  /** Pane-only overrides layered on top of the global emulation. */
  colorScheme?: '' | 'light' | 'dark';
}

export type NetworkPreset = 'none' | 'fast4g' | 'fast3g' | 'slow3g' | 'offline';

export interface Emulation {
  colorScheme: '' | 'light' | 'dark';
  reducedMotion: '' | 'reduce' | 'no-preference';
  forcedColors: '' | 'active' | 'none';
  contrast: '' | 'more' | 'less' | 'no-preference';
  reducedData: '' | 'reduce';
  mediaType: '' | 'print' | 'screen';
  locale: string;
  timezone: string;
  network: NetworkPreset;
  cpu: number;
  disableJS: boolean;
  disableCache: boolean;
  geo: { lat: number; lng: number } | null;
  /** CDP vision deficiency, applied by Chromium itself. */
  vision: string;
}

export interface EmulatePayload {
  pane: PaneConfig;
  viewport: { width: number; height: number };
  emu: Emulation;
  emulateDpr: boolean;
}

export interface SyncFlags {
  scroll: boolean;
  click: boolean;
  input: boolean;
  hover: boolean;
  keys: boolean;
  nav: boolean;
}

export type SyncEvent =
  | { t: 'scroll'; sel?: string; x: number; y: number }
  | { t: 'click'; sel: string }
  | { t: 'input'; sel: string; v: string | boolean }
  | { t: 'focus'; sel: string }
  | { t: 'submit'; sel: string }
  | { t: 'hover'; sel: string }
  | { t: 'key'; sel?: string; key: string; code: string }
  | { t: 'nav'; url: string };

export interface GridOverlay {
  columns: number;
  gutter: number;
  margin: number;
  maxWidth: number;
}

/** Everything a pane needs to restore its tools after each navigation. */
export interface PaneToolsState {
  layoutDebug: boolean;
  overflow: boolean;
  rulers: boolean;
  focusOrder: boolean;
  contrastBadges: boolean;
  grid: GridOverlay | null;
  reference: { src: string; opacity: number; difference: boolean } | null;
  simulator: string;
  disableCSS: boolean;
  disableImages: boolean;
  showAlt: boolean;
}

export interface PaneInit {
  paneId: string;
  sync: SyncFlags;
  tools: PaneToolsState;
  formEmail: string;
}

export interface Vitals {
  lcp?: number;
  cls?: number;
  inp?: number;
  fcp?: number;
  ttfb?: number;
}

export interface NetRequest {
  id: string;
  url: string;
  method: string;
  type: string;
  status?: number;
  mime?: string;
  size?: number;
  start: number;
  end?: number;
  cached?: boolean;
  failed?: string;
}

export interface NetSummary {
  wcId: number;
  count: number;
  bytes: number;
  load?: number;
  dcl?: number;
  origins: string[];
  requests: NetRequest[];
}

export interface PortalInfo {
  running: boolean;
  port: number;
  lan: string[];
  publicUrl?: string;
  clients: number;
  target?: string;
  tunnelError?: string;
}

export interface SessionFlags {
  noCSP: boolean;
  cors: boolean;
}
