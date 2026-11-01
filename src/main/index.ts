import { app, BrowserWindow, clipboard, ClipboardItem, dialog, ipcMain, Menu, nativeImage, net, screen, session, shell, webContents, WebContentsView, type MenuItemConstructorOptions, type WebContents } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SessionFlags, SyncEvent } from '../shared/types';
import { cdp, emulate, ensureAttached, getWC, onNetwork } from './cdp';
import { serveFolder, watchFolder } from './local';
import { locateDevice } from './locate';
import { buildMenu } from './menu';
import { Portal } from './portal';

// The Windows portable build keeps its data next to the .exe so it never
// writes to the user profile of a machine without admin rights.
if (process.env.PORTABLE_EXECUTABLE_DIR) {
  app.setPath('userData', join(process.env.PORTABLE_EXECUTABLE_DIR, 'FronttierData'));
}

// Memory: no spare renderer, no spellchecker, inactive tabs are unloaded by
// the shell, and every pane lives in a single shared session.
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess,MediaRouter');
// Panes showing the same site share one renderer process instead of one each.
app.commandLine.appendSwitch('process-per-site');

const PARTITION = 'persist:fronttier';
const DIST = __dirname;
const PANE_PRELOAD = join(DIST, 'preload-pane.js');
const settingsFile = () => join(app.getPath('userData'), 'settings.json');

let win: BrowserWindow | null = null;
let settings: Record<string, any> = {};
let saveTimer: NodeJS.Timeout | undefined;
const flags: SessionFlags = { noCSP: false, cors: false };
let defaultUA = '';

function loadSettings() {
  try {
    settings = JSON.parse(readFileSync(settingsFile(), 'utf8'));
  } catch {
    settings = {};
  }
}

function persistSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  }, 300);
}

const toHost = (channel: string, ...args: unknown[]) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
};

type Rect = { x: number; y: number; width: number; height: number };
type Dock = 'right' | 'bottom' | 'left' | 'window';
/** One DevTools host per pane, created once: setDevToolsWebContents can't be repointed reliably. */
const devtoolsHosts = new Map<number, { view: WebContentsView; window?: BrowserWindow; dock: Dock }>();
const DOCK_MARK = '__fronttier_dock__';
/** Pane whose DevTools slot is being resized from the shell (see 'devtools-drag'). */
let devtoolsDragging: number | null = null;

// Runs inside the DevTools frontend. Docked, the frontend reserves part of itself
// for the inspected page and draws its own splitter, which left an empty gap
// beside our pane. So it always stays in its undocked layout (it fills the view),
// while its "Dock side" buttons show our side and report clicks to us.
// It waits for the UI: asking for the DockController earlier would create a stand-in
// that the frontend then replaces.
const dockHook = (dock: Dock) => `(async (side) => {
  for (let i = 0; i < 100 && !document.querySelector('.tabbed-pane'); i++) await new Promise((r) => setTimeout(r, 100));
  const UI = await import('devtools://devtools/bundled/ui/legacy/legacy.js');
  const dc = UI.DockController.DockController.instance();
  dc.__fronttierSide = side;
  if (dc.__fronttier) return;
  dc.__fronttier = true;
  const set = dc.setDockSide.bind(dc);
  // Switching the layout stores currentDockState, whose listener calls setDockSide
  // again; those nested calls are ours, not the user's.
  let busy = 0;
  const undock = () => {
    busy++;
    try {
      set('undocked');
    } finally {
      busy--;
    }
  };
  dc.dockSide = () => dc.__fronttierSide;
  dc.setDockSide = (s) => {
    if (!busy && s !== dc.__fronttierSide) console.debug('${DOCK_MARK}' + JSON.stringify(s));
    undock();
  };
  // Opened docked (see openDevtools); switch the layout to undocked now.
  undock();
})(${JSON.stringify(dock === 'window' ? 'undocked' : dock)})`;

/**
 * DevTools render into a native view we own. Docked, it sits over the slot the shell
 * leaves beside the pane (the shell reports its bounds); "window" moves the same view
 * into its own window. A <webview> host left the Elements panel empty.
 */
function devtoolsHost(id: number) {
  let host = devtoolsHosts.get(id);
  if (host) return host;
  const wc = getWC(id);
  const view = new WebContentsView();
  view.setBackgroundColor('#000000');
  wc.setDevToolsWebContents(view.webContents);
  view.webContents.on('did-finish-load', () => view.webContents.executeJavaScript(dockHook(host!.dock)).catch(() => {}));
  // Undocked, the frontend window.open()s a device-mode "toolbox" page, which showed
  // up as an empty "DevTools" window. Panes have their own device emulation.
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // While the shell resizes the slot, the cursor may pass over this view, which then
  // gets the mouse instead of the shell: hand those moves (in window coordinates) back.
  // The real cursor position is used, not the event's: the view itself moves as the slot resizes.
  view.webContents.on('input-event', (_e, input: any) => {
    if (devtoolsDragging !== id || !win || (input.type !== 'mouseMove' && input.type !== 'mouseUp')) return;
    const cursor = screen.getCursorScreenPoint();
    const content = win.getContentBounds();
    toHost('devtools-drag', input.type === 'mouseUp' ? 'up' : 'move', cursor.x - content.x, cursor.y - content.y);
  });
  view.webContents.on('console-message', (e: any, _level?: number, legacyMessage?: string) => {
    const message: string = e?.message ?? legacyMessage ?? '';
    if (!message.startsWith(DOCK_MARK)) return;
    const state = JSON.parse(message.slice(DOCK_MARK.length)) as string;
    const dock: Dock = state === 'undocked' ? 'window' : (state as Dock);
    if (['right', 'bottom', 'left', 'window'].includes(dock)) toHost('devtools-dock', id, dock);
  });
  wc.on('devtools-closed', () => {
    detachDevtools(id);
    toHost('devtools-closed', id);
  });
  host = { view, dock: 'right' };
  devtoolsHosts.set(id, host);
  wc.once('destroyed', () => {
    detachDevtools(id);
    devtoolsHosts.delete(id);
    view.webContents.close();
  });
  return host;
}

/** Takes the DevTools view off screen (closing its window, if any). */
function detachDevtools(id: number) {
  const host = devtoolsHosts.get(id);
  if (!host) return;
  if (host.window) {
    const w = host.window;
    host.window = undefined;
    if (!w.isDestroyed()) w.destroy();
  }
  if (win && !win.isDestroyed()) win.contentView.removeChildView(host.view);
}

function openDevtools(id: number, dock: Dock, bounds?: Rect) {
  const wc = getWC(id);
  const host = devtoolsHost(id);
  if (dock !== 'window') {
    if (host.window) {
      const w = host.window;
      host.window = undefined;
      w.destroy();
    }
    win?.contentView.addChildView(host.view);
    if (bounds) host.view.setBounds(bounds);
    host.view.setVisible(true);
  } else if (!host.window) {
    win?.contentView.removeChildView(host.view);
    const w = new BrowserWindow({ width: 1100, height: 720, title: 'DevTools', backgroundColor: '#000000', autoHideMenuBar: true });
    host.window = w;
    const fit = () => {
      const [width, height] = w.getContentSize();
      host.view.setBounds({ x: 0, y: 0, width, height });
    };
    w.contentView.addChildView(host.view);
    host.view.setVisible(true);
    fit();
    w.on('resize', fit);
    // Closing the window closes DevTools; devtools-closed then tells the shell.
    w.on('closed', () => host.window === w && !wc.isDestroyed() && wc.closeDevTools());
  }
  host.dock = dock;
  // Docked mode keeps the frontend's Dock side buttons; the hook drops the docked layout.
  if (!wc.isDevToolsOpened()) wc.openDevTools({ mode: 'right' });
  // Frontend already up (moving between sides): just update the side it shows.
  if (host.view.webContents.getURL().startsWith('devtools://')) host.view.webContents.executeJavaScript(dockHook(dock)).catch(() => {});
}

function closeDevtools(id: number) {
  detachDevtools(id);
  const wc = webContents.fromId(id);
  if (wc && !wc.isDestroyed() && wc.isDevToolsOpened()) wc.closeDevTools();
}

let clientScriptCache = '';
const portal = new Portal(
  () => (clientScriptCache ||= readFileSync(join(DIST, 'portal-client.js'), 'utf8')),
  (ev) => toHost('portal-event', ev),
  (info) => toHost('portal-status', info),
);

function configureSession() {
  const ses = session.fromPartition(PARTITION);
  defaultUA = ses.getUserAgent().replace(/ Electron\/\S+/, '').replace(/ fronttier\/\S+/i, '');
  ses.setUserAgent(defaultUA);
  ses.setSpellCheckerEnabled(false);
  const allowed = new Set(['geolocation', 'fullscreen', 'clipboard-read', 'clipboard-sanitized-write', 'notifications', 'media', 'pointerLock', 'idle-detection', 'window-management']);
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
  ses.webRequest.onHeadersReceived((details, cb) => {
    if (!flags.noCSP && details.resourceType === 'mainFrame' && Object.keys(details.responseHeaders ?? {}).some((k) => k.toLowerCase() === 'content-security-policy')) {
      toHost('csp-detected', details.url);
    }
    if (!flags.noCSP && !flags.cors) return cb({});
    const headers = { ...(details.responseHeaders ?? {}) };
    for (const key of Object.keys(headers)) {
      const k = key.toLowerCase();
      if (flags.noCSP && (k === 'content-security-policy' || k === 'content-security-policy-report-only')) delete headers[key];
      if (flags.cors && k.startsWith('access-control-allow-')) delete headers[key];
    }
    if (flags.cors) {
      headers['Access-Control-Allow-Origin'] = ['*'];
      headers['Access-Control-Allow-Headers'] = ['*'];
      headers['Access-Control-Allow-Methods'] = ['GET, POST, PUT, PATCH, DELETE, OPTIONS'];
    }
    cb({ responseHeaders: headers });
  });
  ses.on('will-download', (_e, item) => {
    item.once('done', (_ev, state) => toHost('toast', state === 'completed' ? `Descargado: ${item.getFilename()}` : `Descarga ${state}`));
  });
}

function paneContextMenu(wc: WebContents, p: Electron.ContextMenuParams) {
  const cmd = (action: string, extra: Record<string, unknown> = {}) => () => toHost('ctx', { wcId: wc.id, action, x: p.x, y: p.y, ...extra });
  const items: MenuItemConstructorOptions[] = [
    { label: 'Atrás', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
    { label: 'Adelante', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
    { label: 'Recargar este panel', click: () => wc.reload() },
    { type: 'separator' },
  ];
  if (p.linkURL) {
    items.push(
      { label: 'Abrir enlace en nueva pestaña', click: () => toHost('open-tab', p.linkURL) },
      { label: 'Copiar enlace', click: () => clipboard.writeText(p.linkURL) },
      { label: 'Copiar enlace como Markdown', click: () => clipboard.writeText(`[${p.linkText || p.linkURL}](${p.linkURL})`) },
      { label: 'Copiar texto del enlace', click: () => clipboard.writeText(p.linkText) },
      { type: 'separator' },
    );
  }
  if (p.mediaType === 'image' && p.srcURL) {
    items.push(
      { label: 'Copiar imagen', click: () => wc.copyImageAt(p.x, p.y) },
      { label: 'Copiar dirección de la imagen', click: () => clipboard.writeText(p.srcURL) },
      { label: 'Copiar como etiqueta <img>', click: cmd('copy-img-tag', { src: p.srcURL }) },
      { label: 'Copiar como background-image', click: () => clipboard.writeText(`background-image: url("${p.srcURL}");`) },
      { label: 'Guardar imagen como…', click: () => wc.downloadURL(p.srcURL) },
      { type: 'separator' },
    );
  }
  if (p.selectionText) items.push({ label: 'Copiar', role: 'copy' }, { label: 'Copiar enlace a lo resaltado', click: () => clipboard.writeText(`${wc.getURL().split('#')[0]}#:~:text=${encodeURIComponent(p.selectionText.trim().slice(0, 200))}`) });
  if (p.isEditable) items.push({ label: 'Cortar', role: 'cut' }, { label: 'Pegar', role: 'paste' }, { label: 'Deshacer', role: 'undo' }, { label: 'Rehacer', role: 'redo' });
  items.push(
    { type: 'separator' },
    { label: 'Autocompletar formulario (todos los paneles)', click: cmd('fill-forms') },
    { label: 'Limpiar formulario (todos los paneles)', click: cmd('clear-forms') },
    { label: 'Copiar selector CSS', click: cmd('copy-selector') },
    { label: 'Mostrar en Elementos', click: cmd('reveal-element') },
    { label: 'Captura de este panel', click: cmd('screenshot') },
    { label: 'Captura de página completa', click: cmd('screenshot-full') },
    { type: 'separator' },
    { label: 'Ver código fuente', click: () => toHost('open-tab', 'view-source:' + wc.getURL()) },
    { label: 'Inspeccionar elemento (DevTools de Chromium)', click: () => wc.inspectElement(p.x, p.y) },
  );
  Menu.buildFromTemplate(items).popup({ window: win ?? undefined });
}

function createWindow() {
  const bounds = settings.windowBounds ?? { width: 1440, height: 900 };
  win = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 560,
    title: 'Fronttier',
    backgroundColor: '#000000',
    // macOS: no title bar; the traffic lights sit inside the tab bar.
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
    trafficLightPosition: { x: 14, y: 13 },
    show: false,
    webPreferences: {
      preload: join(DIST, 'preload-shell.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: true,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win?.show());
  const saveBounds = () => {
    if (win && !win.isMinimized() && !win.isMaximized()) {
      settings.windowBounds = win.getBounds();
      persistSettings();
    }
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);
  win.on('closed', () => (win = null));
  win.on('enter-full-screen', () => toHost('fullscreen', true));
  win.on('leave-full-screen', () => toHost('fullscreen', false));

  // Every <webview> gets our pane preload and a locked-down renderer, whatever
  // the shell page asks for.
  win.webContents.on('will-attach-webview', (_e, prefs, params) => {
    delete (prefs as any).preloadURL;
    prefs.preload = PANE_PRELOAD;
    prefs.nodeIntegration = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
    prefs.spellcheck = false;
    params.partition = PARTITION;
  });
  win.webContents.on('did-attach-webview', (_e, wc) => {
    wc.setWindowOpenHandler(({ url }) => {
      toHost('open-tab', url);
      return { action: 'deny' };
    });
    wc.on('context-menu', (_ev, p) => paneContextMenu(wc, p));
    ensureAttached(wc.id).catch(() => {});
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  // Video recording captures the app window itself, no OS picker.
  session.defaultSession.setDisplayMediaRequestHandler((_req, cb) => cb({ video: win!.webContents.mainFrame }));

  buildMenu(win);
  win.loadFile(join(DIST, 'renderer/index.html'));
}

async function fetchText(url: string, init?: RequestInit) {
  try {
    const res = await net.fetch(url, { ...init, session: session.fromPartition(PARTITION) } as any);
    return { ok: res.ok, status: res.status, text: await res.text(), contentType: res.headers.get('content-type') ?? '' };
  } catch (e: any) {
    return { ok: false, status: 0, text: String(e?.message ?? e), contentType: '' };
  }
}

function registerIpc() {
  const h = ipcMain.handle.bind(ipcMain);
  h('cdp', (_e, id: number, method: string, params) => cdp(id, method, params));
  h('emulate', (_e, id: number, payload) => emulate(id, payload, defaultUA));
  // CDP screenshots of <webview> guests tile when a DPR override is active, so
  // capture what the compositor shows; full pages are stitched by the shell.
  h('capture', async (_e, id: number) => (await getWC(id).capturePage()).toDataURL());
  h('capture-window', async () => (await win!.webContents.capturePage()).toDataURL());
  h('save-data-url', async (_e, dataUrl: string, name: string) => {
    const dir = settings.screenshotDir || app.getPath('pictures');
    const r = await dialog.showSaveDialog(win!, { defaultPath: join(dir, name), filters: [{ name: 'PNG', extensions: ['png'] }] });
    if (r.canceled || !r.filePath) return null;
    writeFileSync(r.filePath, Buffer.from(dataUrl.split(',')[1], 'base64'));
    return r.filePath;
  });
  h('save-text', async (_e, text: string, name: string) => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: join(app.getPath('downloads'), name) });
    if (r.canceled || !r.filePath) return null;
    writeFileSync(r.filePath, text);
    return r.filePath;
  });
  h('save-recording', async (_e, buf: ArrayBuffer) => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: join(app.getPath('videos'), `fronttier-${Date.now()}.webm`), filters: [{ name: 'WebM', extensions: ['webm'] }] });
    if (r.canceled || !r.filePath) return null;
    writeFileSync(r.filePath, Buffer.from(buf));
    return r.filePath;
  });
  h('copy-image', (_e, dataUrl: string) => clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(nativeImage.createFromDataURL(dataUrl).toPNG())], { type: 'image/png' }) })]));
  h('copy-text', (_e, text: string) => clipboard.writeText(text));
  h('fetch-text', (_e, url: string) => fetchText(url));
  h('post-text', (_e, url: string, body: string, type: string) => fetchText(url, { method: 'POST', body, headers: { 'content-type': type } }));
  h('axe-source', () => readFileSync(join(DIST, 'vendor/axe.min.js'), 'utf8') + `;axe.configure({ locale: ${readFileSync(join(DIST, 'vendor/axe.es.json'), 'utf8')} });`);
  h('settings-get', () => settings);
  h('settings-set', (_e, data: Record<string, any>) => {
    settings = { ...settings, ...data };
    persistSettings();
  });
  h('clear-data', async (_e, kind: string) => {
    const ses = session.fromPartition(PARTITION);
    if (kind === 'cache' || kind === 'all') await ses.clearCache();
    if (kind === 'cookies') await ses.clearStorageData({ storages: ['cookies'] });
    if (kind === 'storage' || kind === 'all') await ses.clearStorageData();
  });
  h('session-flags', (_e, f: SessionFlags) => Object.assign(flags, f));
  h('open-devtools', (_e, id: number, dock?: Dock, bounds?: Rect) => openDevtools(id, dock ?? 'window', bounds));
  h('close-devtools', (_e, id: number) => closeDevtools(id));
  ipcMain.on('devtools-drag', (_e, id: number | null) => (devtoolsDragging = id));
  // Docked host follows the shell's layout; hidden while shell overlays (menus, dialogs) are open.
  ipcMain.on('devtools-bounds', (_e, id: number, bounds: Rect | null) => {
    const host = devtoolsHosts.get(id);
    if (!host || host.window) return;
    if (bounds) host.view.setBounds(bounds);
    host.view.setVisible(!!bounds);
  });
  h('inspect-element', (_e, id: number, x: number, y: number) => {
    if (!getWC(id).isDevToolsOpened()) openDevtools(id, 'window');
    getWC(id).inspectElement(x, y);
  });
  h('portal-start', (_e, url: string, port: number, pub: boolean) => portal.start(url, port, pub));
  h('portal-stop', () => portal.stop());
  ipcMain.on('portal-send', (_e, ev: SyncEvent) => portal.broadcast(ev));
  h('watch-folder', async (_e, pick: boolean) => {
    if (!pick) {
      watchFolder(null, () => {});
      return null;
    }
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory'], title: 'Carpeta a vigilar para live reload' });
    if (r.canceled || !r.filePaths[0]) return null;
    watchFolder(r.filePaths[0], (file) => toHost('live-reload', file));
    return r.filePaths[0];
  });
  h('serve-folder', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory'], title: 'Carpeta del sitio' });
    if (r.canceled || !r.filePaths[0]) return null;
    const url = await serveFolder(r.filePaths[0]);
    watchFolder(r.filePaths[0], (file) => toHost('live-reload', file));
    return url;
  });
  h('pick-image', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    return nativeImage.createFromPath(r.filePaths[0]).toDataURL();
  });
  h('metrics', () => {
    const processes = app.getAppMetrics().map((m) => ({ type: m.type, mb: Math.round(m.memory.workingSetSize / 1024) }));
    return { totalMB: processes.reduce((a, p) => a + p.mb, 0), processes };
  });
  h('locate-device', () => locateDevice());
  h('get-cookies', (_e, url: string) => session.fromPartition(PARTITION).cookies.get({ url }));
  h('open-external', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });
}

onNetwork((s) => toHost('net', s));

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    loadSettings();
    configureSession();
    registerIpc();
    createWindow();
    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  });
  app.on('window-all-closed', () => {
    portal.stop();
    if (process.platform !== 'darwin') app.quit();
  });
}
