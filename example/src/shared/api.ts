import type { EmulatePayload, PortalInfo, SessionFlags, SyncEvent } from './types';

export interface FetchResult {
  ok: boolean;
  status: number;
  text: string;
  contentType: string;
}

export interface MemoryReport {
  totalMB: number;
  processes: { type: string; mb: number }[];
}

/** Bridge exposed by the shell preload as `window.fronttier`. */
export interface FronttierAPI {
  platform: string;
  cdp(wcId: number, method: string, params?: Record<string, unknown>): Promise<any>;
  emulate(wcId: number, payload: EmulatePayload): Promise<void>;
  /** PNG data URL of what the pane currently shows. */
  capture(wcId: number): Promise<string>;
  captureWindow(): Promise<string>;
  saveDataURL(dataUrl: string, name: string): Promise<string | null>;
  saveText(text: string, name: string): Promise<string | null>;
  copyImage(dataUrl: string): Promise<void>;
  copyText(text: string): Promise<void>;
  fetchText(url: string): Promise<FetchResult>;
  postText(url: string, body: string, contentType: string): Promise<FetchResult>;
  axeSource(): Promise<string>;
  settingsGet(): Promise<Record<string, any>>;
  settingsSet(data: Record<string, any>): Promise<void>;
  clearData(kind: 'cache' | 'cookies' | 'storage' | 'all'): Promise<void>;
  setSessionFlags(flags: SessionFlags): Promise<void>;
  openDevTools(wcId: number): Promise<void>;
  inspectElement(wcId: number, x: number, y: number): Promise<void>;
  portalStart(url: string, port: number, publicTunnel: boolean): Promise<PortalInfo>;
  portalStop(): Promise<PortalInfo>;
  portalSend(ev: SyncEvent): void;
  watchFolder(pick: boolean): Promise<string | null>;
  serveFolder(): Promise<string | null>;
  pickImage(): Promise<string | null>;
  metrics(): Promise<MemoryReport>;
  getCookies(url: string): Promise<{ name: string; value: string; domain?: string; path?: string; secure?: boolean; httpOnly?: boolean; expirationDate?: number }[]>;
  openExternal(url: string): Promise<void>;
  saveRecording(buffer: ArrayBuffer): Promise<string | null>;
  on(channel: string, cb: (...args: any[]) => void): () => void;
}
