import { contextBridge, ipcRenderer } from 'electron';
import type { TesseraAPI } from '../shared/api';

const invoke = (channel: string) => (...args: unknown[]) => ipcRenderer.invoke(channel, ...args);
const CHANNELS = new Set(['menu', 'net', 'ctx', 'open-tab', 'portal-event', 'portal-status', 'live-reload', 'toast']);

const api: TesseraAPI = {
  platform: process.platform,
  cdp: invoke('cdp') as TesseraAPI['cdp'],
  emulate: invoke('emulate') as TesseraAPI['emulate'],
  capture: invoke('capture') as TesseraAPI['capture'],
  captureWindow: invoke('capture-window') as TesseraAPI['captureWindow'],
  saveDataURL: invoke('save-data-url') as TesseraAPI['saveDataURL'],
  saveText: invoke('save-text') as TesseraAPI['saveText'],
  copyImage: invoke('copy-image') as TesseraAPI['copyImage'],
  copyText: invoke('copy-text') as TesseraAPI['copyText'],
  fetchText: invoke('fetch-text') as TesseraAPI['fetchText'],
  postText: invoke('post-text') as TesseraAPI['postText'],
  axeSource: invoke('axe-source') as TesseraAPI['axeSource'],
  settingsGet: invoke('settings-get') as TesseraAPI['settingsGet'],
  settingsSet: invoke('settings-set') as TesseraAPI['settingsSet'],
  clearData: invoke('clear-data') as TesseraAPI['clearData'],
  setSessionFlags: invoke('session-flags') as TesseraAPI['setSessionFlags'],
  openDevTools: invoke('open-devtools') as TesseraAPI['openDevTools'],
  inspectElement: invoke('inspect-element') as TesseraAPI['inspectElement'],
  portalStart: invoke('portal-start') as TesseraAPI['portalStart'],
  portalStop: invoke('portal-stop') as TesseraAPI['portalStop'],
  portalSend: (ev) => ipcRenderer.send('portal-send', ev),
  watchFolder: invoke('watch-folder') as TesseraAPI['watchFolder'],
  serveFolder: invoke('serve-folder') as TesseraAPI['serveFolder'],
  pickImage: invoke('pick-image') as TesseraAPI['pickImage'],
  metrics: invoke('metrics') as TesseraAPI['metrics'],
  getCookies: invoke('get-cookies') as TesseraAPI['getCookies'],
  openExternal: invoke('open-external') as TesseraAPI['openExternal'],
  saveRecording: invoke('save-recording') as TesseraAPI['saveRecording'],
  on(channel, cb) {
    if (!CHANNELS.has(channel)) throw new Error('Canal no permitido: ' + channel);
    const listener = (_e: Electron.IpcRendererEvent, ...args: any[]) => cb(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

contextBridge.exposeInMainWorld('tessera', api);
