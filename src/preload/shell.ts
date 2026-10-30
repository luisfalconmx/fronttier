import { contextBridge, ipcRenderer } from 'electron';
import type { FronttierAPI } from '../shared/api';

const invoke = (channel: string) => (...args: unknown[]) => ipcRenderer.invoke(channel, ...args);
const CHANNELS = new Set(['menu', 'net', 'ctx', 'open-tab', 'portal-event', 'portal-status', 'live-reload', 'toast', 'fullscreen']);

const api: FronttierAPI = {
  platform: process.platform,
  cdp: invoke('cdp') as FronttierAPI['cdp'],
  emulate: invoke('emulate') as FronttierAPI['emulate'],
  capture: invoke('capture') as FronttierAPI['capture'],
  captureWindow: invoke('capture-window') as FronttierAPI['captureWindow'],
  saveDataURL: invoke('save-data-url') as FronttierAPI['saveDataURL'],
  saveText: invoke('save-text') as FronttierAPI['saveText'],
  copyImage: invoke('copy-image') as FronttierAPI['copyImage'],
  copyText: invoke('copy-text') as FronttierAPI['copyText'],
  fetchText: invoke('fetch-text') as FronttierAPI['fetchText'],
  postText: invoke('post-text') as FronttierAPI['postText'],
  axeSource: invoke('axe-source') as FronttierAPI['axeSource'],
  settingsGet: invoke('settings-get') as FronttierAPI['settingsGet'],
  settingsSet: invoke('settings-set') as FronttierAPI['settingsSet'],
  clearData: invoke('clear-data') as FronttierAPI['clearData'],
  setSessionFlags: invoke('session-flags') as FronttierAPI['setSessionFlags'],
  openDevTools: invoke('open-devtools') as FronttierAPI['openDevTools'],
  inspectElement: invoke('inspect-element') as FronttierAPI['inspectElement'],
  portalStart: invoke('portal-start') as FronttierAPI['portalStart'],
  portalStop: invoke('portal-stop') as FronttierAPI['portalStop'],
  portalSend: (ev) => ipcRenderer.send('portal-send', ev),
  watchFolder: invoke('watch-folder') as FronttierAPI['watchFolder'],
  serveFolder: invoke('serve-folder') as FronttierAPI['serveFolder'],
  pickImage: invoke('pick-image') as FronttierAPI['pickImage'],
  metrics: invoke('metrics') as FronttierAPI['metrics'],
  getCookies: invoke('get-cookies') as FronttierAPI['getCookies'],
  locateDevice: invoke('locate-device') as FronttierAPI['locateDevice'],
  openExternal: invoke('open-external') as FronttierAPI['openExternal'],
  saveRecording: invoke('save-recording') as FronttierAPI['saveRecording'],
  on(channel, cb) {
    if (!CHANNELS.has(channel)) throw new Error('Canal no permitido: ' + channel);
    const listener = (_e: Electron.IpcRendererEvent, ...args: any[]) => cb(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

contextBridge.exposeInMainWorld('fronttier', api);
