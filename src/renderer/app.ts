import type { PaneConfig, PaneInit, PaneToolsState, PortalInfo, SessionFlags, SyncEvent, Emulation, NetSummary } from '../shared/types';
import { openEditor } from './editor';
import { api, ask, clear, escapeHtml, h, icon, iconButton, menuList, popover, toast } from './dom';
import { DEVICES, GROUP_LABELS, PRESETS } from './devices';
import { PaneView } from './pane';
import { openPalette, type Command } from './palette';
import { PANELS, type PanelInstance } from './panels';
import { Recorder } from './recorder';
import { version } from '../../package.json';
import { DEFAULT_EMULATION, DEFAULT_TOOLS, defaultSettings, newTab, normalizeUrl, paneFromDevice, paneFromWidth, presetPanes, type Align, type Layout, type Settings, type TabState } from './state';

type Handler = (...args: any[]) => void;
class Emitter {
  private map = new Map<string, Set<Handler>>();
  on(ev: string, fn: Handler) {
    if (!this.map.has(ev)) this.map.set(ev, new Set());
    this.map.get(ev)!.add(fn);
    return () => this.map.get(ev)?.delete(fn);
  }
  emit(ev: string, ...args: any[]) {
    this.map.get(ev)?.forEach((fn) => fn(...args));
  }
}

const LAYOUTS: [Layout, string][] = [
  ['horizontal', 'Horizontal'],
  ['vertical', 'Vertical'],
  ['focus', 'Focus'],
  ['full', 'Full'],
];
const ALIGNS: [Align, string][] = [
  ['left', 'Left'],
  ['center', 'Center'],
  ['right', 'Right'],
];
/** Layouts that show only the selected pane. */
const SOLO = new Set<Layout>(['focus', 'full']);

export class App {
  settings: Settings = defaultSettings();
  tab!: TabState;
  panes: PaneView[] = [];
  selected: PaneView | null = null;
  tools: PaneToolsState = { ...DEFAULT_TOOLS };
  flags: SessionFlags = { noCSP: false, cors: false };
  portal: PortalInfo = { running: false, port: 0, lan: [], clients: 0 };
  events = new Emitter();
  scale = 1;
  net = new Map<number, NetSummary>();
  commands: Command[] = [];
  private closedTabs: TabState[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private autoReload: ReturnType<typeof setInterval> | undefined;
  private recorder = new Recorder((on) => this.recordBtn.classList.toggle('recording', on));
  private panels = new Map<string, PanelInstance>();

  // DOM
  private tabsEl = h('div', { class: 'tabs', role: 'tablist' });
  private urlInput = h('input', { class: 'url', type: 'text', spellcheck: false, placeholder: 'Escribe una URL, localhost:3000 o una búsqueda', 'aria-label': 'Dirección' });
  private urlList = h('datalist', { id: 'url-history' });
  private recordBtn!: HTMLButtonElement;
  private syncBtn!: HTMLButtonElement;
  private starBtn!: HTMLButtonElement;
  private schemeBtn = h('button', { class: 'icon-btn', onclick: () => this.cycleColorScheme() });
  private zoomOutBtn = iconButton('zoomOut', 'Alejar (Ctrl/Cmd+-)', () => this.zoom(-0.1));
  private zoomInBtn = iconButton('zoomIn', 'Acercar (Ctrl/Cmd+=)', () => this.zoom(0.1));
  private wrap = h('div', { class: 'panes-wrap' });
  private sizer = h('div', { class: 'panes-sizer' });
  private inner = h('div', { class: 'panes' });
  private start = h('div', { class: 'start' });
  private focusBar = h('div', { class: 'focus-bar hidden', role: 'toolbar', 'aria-label': 'Paneles' });
  private cspNotice = h('div', { class: 'csp-notice hidden', role: 'alertdialog', 'aria-label': 'Cabecera CSP detectada' });
  private findBar = h('div', { class: 'find-bar hidden' });
  private side = h('aside', { class: 'side' });
  private sideTabs = h('nav', { class: 'side-tabs', 'aria-label': 'Herramientas' });
  private sideBody = h('div', { class: 'side-body' });
  private status = h('footer', { class: 'status' });
  private ramText = h('span');
  private ram = h('span', { class: 'ram', title: 'Memoria usada por Fronttier' }, icon('ram', 13), this.ramText);

  async init() {
    const saved = (await api().settingsGet()).app as Partial<Settings> | undefined;
    if (saved) {
      const d = defaultSettings();
      this.settings = { ...d, ...saved, emu: { ...DEFAULT_EMULATION, ...saved.emu, geo: saved.emu?.geo ?? DEFAULT_EMULATION.geo }, sync: { ...d.sync, ...saved.sync } };
      if (!this.settings.tabs?.length) this.settings.tabs = d.tabs;
      if (!LAYOUTS.some(([l]) => l === this.settings.layout)) this.settings.layout = 'horizontal';
    }
    this.tab = this.settings.tabs.find((t) => t.id === this.settings.activeTab) ?? this.settings.tabs[0];
    this.applyTheme();
    document.documentElement.classList.toggle('mac', api().platform === 'darwin');
    this.buildCommands();
    this.buildDom();
    for (const p of PANELS) if (p.eager) this.panels.set(p.id, p.create(this));
    let statusTimer: ReturnType<typeof setTimeout> | undefined;
    this.events.on('overflow', () => {
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => this.renderStatus(), 300);
    });
    this.wireIpc();
    this.renderTabs();
    this.mountTab();
    this.openPanel(this.settings.panelTab, false);
    this.side.classList.toggle('hidden', !this.settings.panelOpen);
    setInterval(() => this.updateRam(), 4000);
    this.updateRam();
    new ResizeObserver(() => this.relayout()).observe(this.wrap);
  }

  // ---------- persistence ----------
  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => api().settingsSet({ app: this.settings }), 400);
  }

  persistTab() {
    this.tab.panes = this.panes.map((p) => p.cfg);
    this.save();
  }

  toast(msg: string, kind: 'info' | 'error' = 'info') {
    toast(msg, kind);
  }

  applyTheme() {
    document.documentElement.dataset.theme = 'dark';
  }

  // ---------- DOM ----------
  private buildDom() {
    const root = document.getElementById('app')!;
    this.urlInput.setAttribute('list', 'url-history');
    this.urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.navigate(this.urlInput.value);
        this.urlInput.blur();
      }
      if (e.key === 'Escape') {
        this.urlInput.value = this.tab.url;
        this.urlInput.blur();
      }
    });
    this.urlInput.addEventListener('focus', () => this.urlInput.select());
    const sideAction = (name: string, title: string, onclick: (e: MouseEvent) => void, extra = '') =>
      h('button', { class: 'side-tab side-action ' + extra, title, 'aria-label': title, onclick }, icon(name, 18));
    this.recordBtn = sideAction('record', 'Grabar video (Ctrl/Cmd+Shift+E)', () => this.toggleRecording(), 'record-btn');
    this.syncBtn = sideAction('sync', 'Sincronización', (e) => this.syncMenu(e.currentTarget as HTMLElement));
    this.starBtn = iconButton('star', 'Marcador', () => this.toggleBookmark());

    const toolbar = h(
      'header',
      { class: 'toolbar' },
      iconButton('back', 'Atrás', () => this.history(-1)),
      iconButton('forward', 'Adelante', () => this.history(1)),
      iconButton('reload', 'Recargar todo (Ctrl/Cmd+R)', () => this.reloadAll(false)),
      h('div', { class: 'url-box' }, this.urlInput, this.starBtn, this.urlList),
      this.zoomOutBtn,
      this.zoomInBtn,
      this.schemeBtn,
      iconButton('layout', 'Diseño de los paneles', (e) => this.layoutMenu(e.currentTarget as HTMLElement)),
      iconButton('addPane', 'Agregar panel', (e) => this.addPaneMenu(e.currentTarget as HTMLElement)),
      iconButton('panel', 'Panel lateral (Ctrl/Cmd+\\)', () => this.togglePanel()),
    );
    this.wrap.append(this.sizer);
    this.sizer.append(this.inner);
    const main = h('main', { class: 'main' }, this.findBar, this.focusBar, this.wrap, this.start, this.cspNotice);
    const resizer = h('div', { class: 'side-resizer', title: 'Arrastra para cambiar el ancho' });
    resizer.addEventListener('mousedown', (e) => this.resizeSide(e));
    this.side.append(resizer, this.sideTabs, this.sideBody);
    this.side.style.width = this.settings.panelWidth + 'px';
    for (const p of PANELS) this.sideTabs.append(h('button', { class: 'side-tab', 'data-id': p.id, title: p.title, 'aria-label': p.title, onclick: () => this.openPanel(p.id) }, icon(p.icon, 18)));
    // Global actions live at the bottom of the rail (Portal already has its own tab above).
    this.sideTabs.append(
      h('div', { class: 'side-sep', role: 'separator' }),
      this.syncBtn,
      sideAction('camera', 'Capturas', (e) => this.screenshotMenu(e.currentTarget as HTMLElement)),
      this.recordBtn,
      sideAction('command', 'Barra de comandos (Ctrl/Cmd+K)', () => this.runCommand('command')),
    );
    clear(root, h('div', { class: 'tabbar' }, this.tabsEl, iconButton('plus', 'Nueva pestaña (Ctrl/Cmd+T)', () => this.openTab(''))), toolbar, h('div', { class: 'workspace' }, main, this.side), this.status);
    this.buildFindBar();
    this.renderSchemeBtn();
    this.renderHistory();
    this.wrap.addEventListener('mousedown', (e) => {
      if (e.target === this.wrap || e.target === this.sizer || e.target === this.inner) this.select(null);
    });
  }

  private buildFindBar() {
    const input = h('input', { type: 'search', placeholder: 'Buscar en todos los paneles…' });
    const count = h('span', { class: 'muted' });
    const run = (next = false) => {
      const q = input.value;
      for (const p of this.panes) q ? p.webview.findInPage(q, { findNext: next }) : p.webview.stopFindInPage('clearSelection');
    };
    input.addEventListener('input', () => run(false));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') run(true);
      if (e.key === 'Escape') this.toggleFind(false);
    });
    this.events.on('found', ({ pane, result }) => {
      if (pane === this.primary() && result.finalUpdate) count.textContent = `${result.activeMatchOrdinal}/${result.matches}`;
    });
    clear(this.findBar, icon('search'), input, count, iconButton('close', 'Cerrar', () => this.toggleFind(false)));
  }

  toggleFind(on = this.findBar.classList.contains('hidden')) {
    this.findBar.classList.toggle('hidden', !on);
    const input = this.findBar.querySelector('input')!;
    if (on) input.focus();
    else {
      input.value = '';
      for (const p of this.panes) p.webview.stopFindInPage('clearSelection');
    }
  }

  private renderHistory() {
    clear(this.urlList, this.settings.history.slice(0, 50).map((u) => h('option', { value: u })));
  }

  private renderStart() {
    const recent = this.settings.history.slice(0, 8);
    const presets = Object.entries(PRESETS).map(([k, p]) =>
      h('button', { class: 'chip' + (this.settings.defaultPreset === k ? ' on' : ''), onclick: () => ((this.settings.defaultPreset = k), (this.tab.panes = presetPanes(k)), this.save(), this.renderStart()) }, p.label),
    );
    const input = h('input', { class: 'start-url', placeholder: 'https://tu-sitio.com o localhost:3000', onkeydown: (e: KeyboardEvent) => e.key === 'Enter' && this.navigate(input.value) });
    clear(
      this.start,
      h(
        'div',
        { class: 'start-card' },
        h('img', { class: 'logo', src: 'logo.png', alt: '' }),
        h('div', null, h('h1', null, 'Fronttier'), h('span', { class: 'start-version' }, `v${version}`)),
        h('p', { class: 'muted' }, 'Abre un sitio y míralo en varios dispositivos a la vez. Todo lo que hagas en un panel se refleja en los demás.'),
        input,
        h('div', { class: 'row center' }, h('button', { class: 'btn primary', onclick: () => this.navigate(input.value) }, 'Abrir'), h('button', { class: 'btn', onclick: () => this.runCommand('open-folder') }, icon('folder'), 'Abrir carpeta local')),
        h('h3', null, 'Paneles iniciales'),
        h('div', { class: 'chips' }, presets),
        recent.length ? h('h3', null, 'Recientes') : null,
        recent.length ? h('div', { class: 'recent' }, recent.map((u) => h('button', { class: 'link', onclick: () => this.navigate(u) }, u))) : null,
        this.settings.bookmarks.length ? h('h3', null, 'Marcadores') : null,
        h('div', { class: 'recent' }, this.settings.bookmarks.map((b) => h('button', { class: 'link', onclick: () => this.navigate(b.url) }, b.title || b.url))),
        h('p', { class: 'muted small' }, 'Consejo: mantén presionada Alt/Option sobre un elemento para inspeccionarlo. Ctrl/Cmd+K abre la barra de comandos.'),
      ),
    );
    setTimeout(() => input.focus(), 50);
  }

  // ---------- tabs ----------
  renderTabs() {
    clear(
      this.tabsEl,
      this.settings.tabs.map((t) =>
        h(
          'div',
          { class: 'tab' + (t.id === this.tab.id ? ' active' : ''), role: 'tab', 'aria-selected': String(t.id === this.tab.id), title: t.url || t.title, onmousedown: (e: MouseEvent) => (e.button === 1 ? this.closeTab(t) : this.switchTab(t)) },
          t.favicon ? h('img', { class: 'favicon', src: t.favicon, alt: '' }) : h('span', { class: 'favicon blank' }),
          h('span', { class: 'tab-title' }, t.title || 'Nueva pestaña'),
          h('button', { class: 'tab-close', title: 'Cerrar pestaña', 'aria-label': 'Cerrar pestaña', onmousedown: (e: MouseEvent) => e.stopPropagation(), onclick: () => this.closeTab(t) }, icon('close', 12)),
        ),
      ),
    );
  }

  openTab(url: string, panes?: PaneConfig[]) {
    const t = newTab(url ? normalizeUrl(url, this.settings.searchEngine) : '', panes ?? presetPanes(this.settings.defaultPreset));
    this.settings.tabs.push(t);
    this.switchTab(t);
  }

  switchTab(t: TabState) {
    if (t === this.tab) return;
    this.persistTab();
    this.tab = t;
    this.settings.activeTab = t.id;
    this.renderTabs();
    this.mountTab();
    this.save();
  }

  closeTab(t: TabState) {
    const i = this.settings.tabs.indexOf(t);
    this.closedTabs.push(t);
    this.settings.tabs.splice(i, 1);
    if (!this.settings.tabs.length) this.settings.tabs.push(newTab('', presetPanes(this.settings.defaultPreset)));
    if (t === this.tab) {
      this.tab = this.settings.tabs[Math.max(0, i - 1)];
      this.settings.activeTab = this.tab.id;
      this.mountTab();
    }
    this.renderTabs();
    this.save();
  }

  /** Inactive tabs are fully unloaded to keep memory low; only the active tab has live panes. */
  mountTab() {
    for (const p of this.panes) p.destroy();
    this.panes = [];
    this.selected = null;
    this.net.clear();
    this.urlInput.value = this.tab.url;
    this.updateStar();
    const empty = !this.tab.url;
    this.start.classList.toggle('hidden', !empty);
    this.wrap.classList.toggle('hidden', empty);
    if (empty) this.renderStart();
    else for (const cfg of this.tab.panes) this.createPane(cfg);
    this.relayout();
    this.events.emit('tab');
    this.renderStatus();
  }

  private createPane(cfg: PaneConfig) {
    const p = new PaneView(this, cfg);
    this.panes.push(p);
    p.el.style.order = String(this.panes.length);
    this.inner.append(p.el);
    p.load(this.tab.url);
    return p;
  }

  // ---------- panes ----------
  addPane(cfg: PaneConfig) {
    if (!this.tab.url) {
      this.tab.panes.push(cfg);
      this.save();
      this.toast('Panel agregado. Abre una URL para verlo.');
      return;
    }
    const p = this.createPane(cfg);
    this.persistTab();
    // In focus/full the new pane would be off-stage; switch to it right away.
    if (SOLO.has(this.settings.layout) && p) this.select(p);
    this.relayout();
  }

  removePane(p: PaneView) {
    p.destroy();
    this.panes = this.panes.filter((x) => x !== p);
    if (this.selected === p) this.selected = null;
    this.persistTab();
    this.relayout();
  }

  movePane(p: PaneView, dir: number) {
    const i = this.panes.indexOf(p);
    const j = i + dir;
    if (j < 0 || j >= this.panes.length) return;
    [this.panes[i], this.panes[j]] = [this.panes[j], this.panes[i]];
    // CSS order instead of DOM moves: re-attaching a webview reloads it.
    this.panes.forEach((x, k) => (x.el.style.order = String(k)));
    this.persistTab();
    this.relayout();
  }

  replacePanes(cfgs: PaneConfig[]) {
    this.tab.panes = cfgs;
    this.save();
    this.mountTab();
  }

  select(p: PaneView | null) {
    if (this.selected === p) return;
    this.selected = p;
    for (const x of this.panes) x.setSelected(x === p);
    if (SOLO.has(this.settings.layout)) this.relayout();
    this.events.emit('select', p);
  }

  primary(): PaneView | undefined {
    return this.selected ?? this.panes[0];
  }

  paneInit(p: PaneView): PaneInit {
    return { paneId: p.cfg.id, sync: this.settings.sync, tools: this.tools, formEmail: this.settings.formEmail };
  }

  async toolAll<T = any>(name: string, args?: unknown) {
    return Promise.allSettled(this.panes.map((p) => p.tool<T>(name, args)));
  }

  setTools(patch: Partial<PaneToolsState>) {
    this.tools = { ...this.tools, ...patch };
    for (const p of this.panes) p.send('tools-state', this.tools);
    this.events.emit('tools');
  }

  setEmu(patch: Partial<Emulation>) {
    this.settings.emu = { ...this.settings.emu, ...patch };
    for (const p of this.panes) p.emulate();
    this.save();
    this.events.emit('emu');
    this.renderStatus();
    this.renderSchemeBtn();
  }

  /** Toolbar switch for prefers-color-scheme: system → light → dark. */
  private cycleColorScheme() {
    const next = ({ '': 'light', light: 'dark', dark: '' } as const)[this.settings.emu.colorScheme];
    this.setEmu({ colorScheme: next });
  }

  private renderSchemeBtn() {
    const [name, label] = { '': ['system', 'del sistema'], light: ['sun', 'claro'], dark: ['moon', 'oscuro'] }[this.settings.emu.colorScheme];
    clear(this.schemeBtn, icon(name));
    this.schemeBtn.title = `prefers-color-scheme: modo ${label} (clic para cambiar)`;
    this.schemeBtn.setAttribute('aria-label', this.schemeBtn.title);
  }

  setSync(patch: Partial<Settings['sync']>) {
    this.settings.sync = { ...this.settings.sync, ...patch };
    for (const p of this.panes) p.send('sync-flags', this.settings.sync);
    this.syncBtn.classList.toggle('off', !Object.values(this.settings.sync).some(Boolean));
    this.save();
    this.renderStatus();
  }

  async setSessionFlags(patch: Partial<SessionFlags>) {
    this.flags = { ...this.flags, ...patch };
    await api().setSessionFlags(this.flags);
    this.toast('Cambio aplicado. Recarga para que surta efecto en las páginas abiertas.');
    this.renderStatus();
    this.events.emit('flags');
  }

  // ---------- layout & zoom ----------
  relayout() {
    const L = this.settings.layout;
    const focused = this.primary();
    this.inner.className = 'panes layout-' + L + ' align-' + this.settings.align + (this.settings.headers ? '' : ' no-headers');
    this.wrap.classList.remove('align-left', 'align-center', 'align-right');
    this.wrap.classList.add('align-' + this.settings.align);
    const shown = new Set(SOLO.has(L) ? [focused] : this.panes);
    for (const p of this.panes) p.el.classList.toggle('offstage', !shown.has(p));
    this.renderFocusBar();
    // No scrollbars in full, so the area is measured at its real size.
    this.wrap.classList.toggle('full', L === 'full');
    const wrapW = this.wrap.clientWidth;
    const wrapH = this.wrap.clientHeight;
    // Full turns the selected pane into the whole main area: no header, no gaps, no zoom.
    const full = L === 'full';
    if (full && focused) focused.setOverride({ width: wrapW, height: wrapH });
    for (const p of this.panes) if (!full || p !== focused) p.setOverride(null);

    let s = this.settings.zoomFit || full ? 1 : this.settings.zoom;
    const visible = this.panes.filter((p) => shown.has(p));
    if (this.settings.zoomFit && visible.length && !full) {
      const gap = 16;
      const widths = visible.map((p) => p.el.offsetWidth);
      const heights = visible.map((p) => p.el.offsetHeight);
      const maxH = Math.max(...heights);
      const maxW = Math.max(...widths);
      const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0) + gap * (xs.length + 1);
      const totalW = L === 'horizontal' ? sum(widths) : maxW + gap * 2;
      const totalH = L === 'vertical' ? sum(heights) : maxH + gap * 2;
      s = Math.min(1, (wrapW - 8) / totalW, (wrapH - 8) / totalH);
      s = Math.max(0.1, Math.floor(s * 100) / 100);
    }
    this.scale = s;
    this.inner.style.transform = `scale(${s})`;
    // Solo layouts span the visible area so alignment has room to act; wider content just scrolls.
    this.inner.style.minWidth = SOLO.has(L) ? wrapW / s + 'px' : '';
    requestAnimationFrame(() => {
      this.sizer.style.width = this.inner.offsetWidth * s + 'px';
      this.sizer.style.height = this.inner.offsetHeight * s + 'px';
    });
    const pct = (this.settings.zoomFit ? 'ajustado, ' : '') + Math.round(s * 100) + ' %';
    this.zoomOutBtn.title = `Alejar (Ctrl/Cmd+-) · Zoom ${pct}`;
    this.zoomInBtn.title = `Acercar (Ctrl/Cmd+=) · Zoom ${pct}`;
    this.renderStatus();
  }

  /** Polypane-style notice: the page sends a CSP header that can block Fronttier's injected tools. */
  private showCspNotice(url: string) {
    let key: string;
    try {
      const u = new URL(url);
      key = u.origin + u.pathname;
    } catch {
      return;
    }
    if (this.flags.noCSP || this.settings.cspSeen.includes(key)) return;
    this.settings.cspSeen = [key, ...this.settings.cspSeen].slice(0, 500);
    this.save();
    const hide = () => this.cspNotice.classList.add('hidden');
    clear(
      this.cspNotice,
      h(
        'div',
        { class: 'csp-head' },
        icon('warn', 20),
        h('div', { class: 'grow' }, h('strong', null, 'Este sitio envía una cabecera CSP'), h('div', { class: 'muted small' }, 'Puede impedir que Fronttier funcione correctamente.')),
        iconButton('close', 'Cerrar', hide),
      ),
      h(
        'div',
        { class: 'csp-body' },
        h(
          'p',
          null,
          h('strong', null, 'Content-Security-Policy'),
          ' es una cabecera que impide que código de terceros haga cambios en la página. ',
          h('button', { class: 'link', onclick: () => api().openExternal('https://developer.mozilla.org/es/docs/Web/HTTP/CSP') }, 'Más información sobre CSP'),
        ),
        h('p', null, h('strong', null, 'Desactiva las cabeceras CSP'), ' para usar todas las herramientas de Fronttier en este sitio.'),
      ),
      h(
        'div',
        { class: 'csp-foot' },
        h('span', { class: 'muted small' }, 'Se muestra una vez por URL.'),
        h('button', { class: 'btn primary', onclick: async () => (hide(), await this.setSessionFlags({ noCSP: true }), this.reloadAll(false)) }, 'Desactivar cabeceras CSP'),
      ),
    );
    this.cspNotice.classList.remove('hidden');
  }

  /** Focus mode: quick switcher between panes, plus a way to add one. */
  private renderFocusBar() {
    const on = this.settings.layout === 'focus' && this.panes.length > 0;
    this.focusBar.classList.toggle('hidden', !on);
    if (!on) return;
    const current = this.primary();
    clear(
      this.focusBar,
      this.panes.map((p) =>
        h(
          'button',
          { class: 'focus-chip' + (p === current ? ' on' : ''), title: `${p.cfg.name} · ${p.cfg.width} × ${p.cfg.height}`, onclick: () => this.select(p) },
          icon(p.cfg.mobile ? 'emulate' : 'monitor', 14),
          h('span', { class: 'ellipsis' }, p.cfg.name),
          h('small', null, `${p.cfg.width}×${p.cfg.height}`),
        ),
      ),
      iconButton('addPane', 'Agregar panel', (e) => this.addPaneMenu(e.currentTarget as HTMLElement)),
    );
  }

  setAlign(a: Align) {
    this.settings.align = a;
    this.relayout();
    this.save();
  }

  setLayout(L: Layout) {
    this.settings.layout = L;
    if (SOLO.has(L)) this.selected ??= this.panes[0] ?? null;
    this.relayout();
    this.save();
  }

  zoom(delta: number | 'fit' | 'reset') {
    if (delta === 'fit') this.settings.zoomFit = true;
    else if (delta === 'reset') {
      this.settings.zoomFit = false;
      this.settings.zoom = 1;
    } else {
      this.settings.zoom = Math.min(2, Math.max(0.1, Math.round((this.scale + delta) * 100) / 100));
      this.settings.zoomFit = false;
    }
    this.relayout();
    this.save();
  }

  pageZoom(delta: number | 'reset') {
    this.settings.pageZoom = delta === 'reset' ? 1 : Math.min(3, Math.max(0.25, Math.round((this.settings.pageZoom + delta) * 100) / 100));
    for (const p of this.panes) p.webview.setZoomFactor(this.settings.pageZoom);
    this.toast(`Zoom de página ${Math.round(this.settings.pageZoom * 100)} %`);
    this.save();
  }

  private resizeSide(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = this.side.offsetWidth;
    document.body.classList.add('resizing');
    const move = (ev: MouseEvent) => {
      this.settings.panelWidth = Math.min(900, Math.max(280, startW - (ev.clientX - startX)));
      this.side.style.width = this.settings.panelWidth + 'px';
    };
    const up = () => {
      document.body.classList.remove('resizing');
      removeEventListener('mousemove', move);
      removeEventListener('mouseup', up);
      this.save();
    };
    addEventListener('mousemove', move);
    addEventListener('mouseup', up);
  }

  // ---------- navigation & sync ----------
  navigate(input: string) {
    const url = normalizeUrl(input, this.settings.searchEngine);
    if (!url) return;
    const wasEmpty = !this.tab.url;
    this.setTabUrl(url);
    if (wasEmpty || !this.panes.length) this.mountTab();
    else for (const p of this.panes) p.load(url, true);
  }

  private setTabUrl(url: string) {
    this.tab.url = url;
    if (document.activeElement !== this.urlInput) this.urlInput.value = url;
    const hist = this.settings.history.filter((u) => u !== url);
    hist.unshift(url);
    this.settings.history = hist.slice(0, 200);
    this.renderHistory();
    this.updateStar();
    this.save();
    this.events.emit('navigate', url);
    if (this.portal.running) api().portalSend({ t: 'nav', url });
  }

  onPaneNavigate(pane: PaneView, url: string, inPage: boolean) {
    pane.url = url;
    const isPrimary = pane === this.primary();
    if (pane.syncLoad) {
      pane.syncLoad = false;
      if (isPrimary && url !== this.tab.url) this.setTabUrl(url);
      return;
    }
    if (url === this.tab.url) return;
    // Pages that rewrite their URL by themselves would echo between panes
    // forever (each viewport yields different coordinates), so in-page
    // changes only count when they come from the pane the user drives.
    if (inPage && pane !== this.leadPane()) return;
    this.setTabUrl(url);
    if (!this.settings.sync.nav) return;
    if (inPage) {
      setTimeout(() => {
        for (const p of this.panes) if (p !== pane && p.url !== url) p.send('spa-nav', url);
      }, 350);
    } else for (const p of this.panes) if (p !== pane && p.url !== url) p.load(url, true);
  }

  /** Pane with real user input in the last few seconds, else the primary one. */
  private leadPane() {
    const recent = this.panes.reduce<PaneView | null>((a, p) => (p.lastInput > (a?.lastInput ?? 0) ? p : a), null);
    return recent && Date.now() - recent.lastInput < 5000 ? recent : this.primary();
  }

  onPaneTitle(pane: PaneView, title: string) {
    if (pane !== this.primary()) return;
    this.tab.title = title;
    this.renderTabs();
    this.save();
  }

  onPaneFavicon(pane: PaneView, src?: string) {
    if (pane !== this.primary() || !src) return;
    this.tab.favicon = src;
    this.renderTabs();
  }

  broadcast(from: PaneView | null, ev: SyncEvent) {
    for (const p of this.panes) if (p !== from) p.send('sync', ev);
    if (from && this.portal.running) api().portalSend(ev);
  }

  history(dir: -1 | 1) {
    for (const p of this.panes) {
      const can = dir < 0 ? p.webview.canGoBack() : p.webview.canGoForward();
      if (!can) continue;
      p.syncLoad = true;
      dir < 0 ? p.webview.goBack() : p.webview.goForward();
    }
  }

  reloadAll(hard: boolean) {
    for (const p of this.panes) (hard ? p.webview.reloadIgnoringCache() : p.webview.reload());
  }

  // ---------- side panel ----------
  openPanel(id: string, show = true) {
    const def = PANELS.find((p) => p.id === id) ?? PANELS[0];
    this.settings.panelTab = def.id;
    let inst = this.panels.get(def.id);
    if (!inst) {
      inst = def.create(this);
      this.panels.set(def.id, inst);
    }
    for (const [k, other] of this.panels) if (k !== def.id) other.hide?.();
    clear(this.sideBody, h('div', { class: 'side-head' }, h('h2', null, def.title)), inst.el);
    this.sideTabs.querySelectorAll('.side-tab').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.id === def.id));
    if (show && !this.settings.panelOpen) this.togglePanel(true);
    inst.show?.();
    this.save();
    return inst;
  }

  togglePanel(on = !this.settings.panelOpen) {
    this.settings.panelOpen = on;
    this.side.classList.toggle('hidden', !on);
    if (on) this.panels.get(this.settings.panelTab)?.show?.();
    this.save();
  }

  // ---------- menus ----------
  private addPaneMenu(anchor: HTMLElement) {
    const items: Parameters<typeof menuList>[0] = [
      { label: 'Panel personalizado…', onclick: () => this.customPaneDialog(anchor) },
      { label: 'Crear desde breakpoints CSS', onclick: () => this.breakpointPanes(false) },
      { label: 'Crear en bordes de breakpoints', onclick: () => this.breakpointPanes(true) },
      { heading: 'Conjuntos' },
      ...Object.entries(PRESETS).map(([k, p]) => ({ label: p.label, onclick: () => this.replacePanes(presetPanes(k)) })),
    ];
    for (const g of Object.keys(GROUP_LABELS) as (keyof typeof GROUP_LABELS)[]) {
      items.push({ heading: GROUP_LABELS[g] });
      for (const d of DEVICES.filter((x) => x.group === g)) items.push({ label: d.name, hint: `${d.width}×${d.height}`, onclick: () => this.addPane(paneFromDevice(d)) });
    }
    const close = popover(anchor, menuList(items, () => close()), { width: 300 });
  }

  private customPaneDialog(anchor: HTMLElement) {
    const w = h('input', { type: 'number', value: '1024', min: '100' });
    const hh = h('input', { type: 'number', value: '768', min: '100' });
    const name = h('input', { type: 'text', placeholder: 'Nombre (opcional)' });
    const body = h(
      'div',
      { class: 'pane-settings' },
      h('div', { class: 'row' }, h('label', { class: 'mini-field' }, 'Ancho', w), h('label', { class: 'mini-field' }, 'Alto', hh)),
      h('label', { class: 'mini-field wide' }, 'Nombre', name),
      h('button', { class: 'btn primary', onclick: () => (this.addPane(paneFromWidth(Number(w.value) || 1024, Number(hh.value) || 768, name.value.trim() || undefined)), close()) }, 'Agregar'),
    );
    const close = popover(anchor, body, { width: 260 });
    w.focus();
  }

  private layoutMenu(anchor: HTMLElement) {
    const close = popover(
      anchor,
      h(
        'div',
        null,
        menuList(
          LAYOUTS.map(([l, label]) => ({ label, checked: this.settings.layout === l, onclick: () => this.setLayout(l) })),
          () => close(),
        ),
        h('div', { class: 'menu-sep' }),
        h(
          'div',
          { class: 'seg seg-fill', role: 'group', 'aria-label': 'Alineación' },
          ALIGNS.map(([a, label]) => h('button', { class: this.settings.align === a ? 'on' : '', onclick: () => (this.setAlign(a), close()) }, label)),
        ),
      ),
      { width: 200, align: 'right' },
    );
  }

  private syncMenu(anchor: HTMLElement) {
    const s = this.settings.sync;
    const labels: [keyof Settings['sync'], string][] = [
      ['scroll', 'Scroll'],
      ['click', 'Clics'],
      ['input', 'Formularios y foco'],
      ['hover', 'Hover'],
      ['keys', 'Teclas (Esc, Enter, flechas)'],
      ['nav', 'Navegación'],
    ];
    const all = Object.values(s).every(Boolean);
    const close = popover(
      anchor,
      menuList([{ label: all ? 'Desactivar toda la sincronización' : 'Activar toda la sincronización', onclick: () => this.setSync(Object.fromEntries(labels.map(([k]) => [k, !all]))) }, 'sep', ...labels.map(([k, l]) => ({ label: l, checked: s[k], onclick: () => this.setSync({ [k]: !s[k] }) }))], () => close()),
      { width: 260 },
    );
  }

  private screenshotMenu(anchor: HTMLElement) {
    const p = this.primary();
    const close = popover(
      anchor,
      menuList(
        [
          { label: 'Todos los paneles (vista)', hint: '⇧⌘S', onclick: () => this.screenshotAll(false) },
          { label: 'Todos los paneles (página completa)', onclick: () => this.screenshotAll(true) },
          { label: 'Panel seleccionado (vista)', onclick: () => p && this.screenshotPane(p, false) },
          { label: 'Panel seleccionado (página completa)', onclick: () => p && this.screenshotPane(p, true) },
          { label: 'Ventana de Fronttier', onclick: async () => openEditor(await api().captureWindow(), 'fronttier-ventana.png') },
        ],
        () => close(),
      ),
      { width: 300 },
    );
  }

  // ---------- screenshots & recording ----------
  async screenshotPane(p: PaneView, full: boolean) {
    if (!p.wcId) return;
    try {
      const data = await p.capture(full);
      openEditor(data, `${slug(this.tab.title)}-${slug(p.cfg.name)}${full ? '-completa' : ''}.png`);
    } catch (e: any) {
      this.toast('No se pudo capturar: ' + e.message, 'error');
    }
  }

  async screenshotAll(full: boolean) {
    const panes = this.panes.filter((p) => p.wcId);
    if (!panes.length) return;
    this.toast('Capturando paneles…');
    // Sequential: full-page capture scrolls each pane while it runs.
    const shots: { p: PaneView; img: HTMLImageElement }[] = [];
    for (const p of panes) shots.push({ p, img: await loadImage(await p.capture(full)) });
    const pad = 40;
    const label = 36;
    const scaled = shots.map(({ p, img }) => ({ p, img, w: p.viewport.width, h: Math.round((img.height / img.width) * p.viewport.width) }));
    const W = scaled.reduce((a, s) => a + s.w + pad, pad);
    const H = Math.max(...scaled.map((s) => s.h)) + pad * 2 + label;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    let x = pad;
    for (const s of scaled) {
      ctx.fillStyle = '#ededed';
      ctx.font = '600 16px system-ui, sans-serif';
      ctx.fillText(`${s.p.cfg.name} — ${s.p.viewport.width}×${s.p.viewport.height}`, x, pad + 18);
      ctx.shadowColor = 'rgba(0,0,0,.2)';
      ctx.shadowBlur = 16;
      ctx.drawImage(s.img, x, pad + label, s.w, s.h);
      ctx.shadowBlur = 0;
      x += s.w + pad;
    }
    openEditor(canvas.toDataURL('image/png'), `${slug(this.tab.title)}-todos${full ? '-completa' : ''}.png`);
  }

  toggleRecording() {
    this.recorder.toggle().catch((e) => this.toast('No se pudo grabar: ' + e.message, 'error'));
  }

  // ---------- breakpoints ----------
  async breakpointPanes(edges: boolean) {
    const p = this.primary();
    if (!p) return this.toast('Abre una página primero.');
    try {
      const r = await p.tool<{ media: string[]; external: string[] }>('breakpoints');
      const media = [...r.media];
      for (const href of r.external.slice(0, 20)) {
        const res = await api().fetchText(href);
        if (res.ok) for (const m of res.text.matchAll(/@media([^{]+)\{/g)) media.push(m[1]);
      }
      const bps = new Map<number, 'min' | 'max'>();
      const add = (v: string, unit: string, kind: 'min' | 'max') => {
        const n = Math.round(parseFloat(v) * (unit === 'px' ? 1 : 16));
        if (n >= 200 && n <= 4000) bps.set(n, kind);
      };
      for (const m of media) {
        for (const x of m.matchAll(/(min|max)-width\s*:\s*([\d.]+)(px|em|rem)/g)) add(x[2], x[3], x[1] as 'min' | 'max');
        for (const x of m.matchAll(/width\s*(>=|<=|>|<)\s*([\d.]+)(px|em|rem)/g)) add(x[2], x[3], x[1].startsWith('>') ? 'min' : 'max');
        for (const x of m.matchAll(/([\d.]+)(px|em|rem)\s*(<=|<|>=|>)\s*width/g)) add(x[1], x[2], x[3].startsWith('<') ? 'min' : 'max');
      }
      if (!bps.size) return this.toast('No se encontraron breakpoints de ancho en el CSS.');
      const sorted = [...bps.entries()].sort((a, b) => a[0] - b[0]);
      let widths: number[];
      if (edges) widths = sorted.flatMap(([v, k]) => (k === 'min' ? [v - 1, v] : [v, v + 1]));
      else {
        const starts = sorted.map(([v, k]) => (k === 'min' ? v : v + 1));
        widths = [Math.min(320, starts[0] - 1), ...starts];
      }
      widths = [...new Set(widths)].sort((a, b) => a - b).slice(0, 14);
      this.replacePanes(widths.map((w) => paneFromWidth(w)));
      this.toast(`${widths.length} paneles creados desde ${sorted.length} breakpoints.`);
    } catch (e: any) {
      this.toast('No se pudieron leer los breakpoints: ' + e.message, 'error');
    }
  }

  // ---------- misc ----------
  private toggleBookmark() {
    const url = this.tab.url;
    if (!url) return;
    const i = this.settings.bookmarks.findIndex((b) => b.url === url);
    if (i >= 0) this.settings.bookmarks.splice(i, 1);
    else this.settings.bookmarks.unshift({ url, title: this.tab.title });
    this.updateStar();
    this.save();
  }

  private updateStar() {
    this.starBtn?.classList.toggle('on', this.settings.bookmarks.some((b) => b.url === this.tab.url));
  }

  private async updateRam() {
    try {
      const m = await api().metrics();
      this.ramText.textContent = `RAM ${fmtMB(m.totalMB)}`;
      this.ram.title = m.processes.map((p) => `${p.type}: ${fmtMB(p.mb)}`).join('\n');
      this.events.emit('metrics', m);
    } catch {}
  }

  renderStatus() {
    const s = this.settings;
    const syncOn = Object.values(s.sync).filter(Boolean).length;
    const overflowing = this.panes.filter((p) => p.overflow.overflow).length;
    const emu = s.emu;
    const emuTags = [
      emu.colorScheme && `color-scheme: ${emu.colorScheme}`,
      emu.reducedMotion && 'reduced-motion',
      emu.forcedColors === 'active' && 'forced-colors',
      emu.network !== 'none' && `red: ${emu.network}`,
      emu.cpu > 1 && `CPU ${emu.cpu}×`,
      emu.disableJS && 'sin JS',
      emu.locale && emu.locale,
      emu.vision && `visión: ${emu.vision}`,
      this.tools.simulator && `simulador: ${this.tools.simulator}`,
    ].filter(Boolean) as string[];
    clear(
      this.status,
      h('span', { class: 'version' }, icon('tag', 13), `v${version}`),
      h('span', null, icon('panes', 13), `${this.panes.length} paneles`),
      this.ram,
      syncOn === 6 ? null : h('span', { class: 'warn' }, icon('sync', 13), syncOn ? `Sincronización parcial (${syncOn}/6)` : 'Sin sincronización'),
      overflowing ? h('button', { class: 'warn link', onclick: () => this.setTools({ overflow: true }) }, icon('warn', 13), `${overflowing} con desborde horizontal`) : null,
      this.portal.running ? h('button', { class: 'link', onclick: () => this.openPanel('portal') }, icon('portal', 13), `Portal activo · ${this.portal.clients} dispositivo(s)`) : null,
      this.flags.noCSP ? h('span', { class: 'warn' }, icon('shield', 13), 'CSP desactivado') : null,
      this.flags.cors ? h('span', { class: 'warn' }, icon('shield', 13), 'CORS abierto') : null,
      emuTags.length ? h('span', { class: 'emu-tags', title: emuTags.join(' · ') }, icon('emulate', 13), emuTags.join(' · ')) : null,
    );
  }

  // ---------- IPC ----------
  private wireIpc() {
    const a = api();
    a.on('menu', (cmd: string) => this.runCommand(cmd));
    a.on('net', (s: NetSummary) => {
      this.net.set(s.wcId, s);
      this.events.emit('net', s);
    });
    a.on('open-tab', (url: string) => this.openTab(url, structuredClone(this.tab.panes).map((p) => ({ ...p, id: Math.random().toString(36).slice(2) }))));
    a.on('toast', (msg: string) => this.toast(msg));
    a.on('csp-detected', (url: string) => this.showCspNotice(url));
    a.on('portal-event', (ev: SyncEvent) => {
      if (ev.t === 'nav') {
        if (ev.url !== this.tab.url) this.navigate(ev.url);
      } else this.broadcast(null, ev);
    });
    a.on('fullscreen', (on: boolean) => document.documentElement.classList.toggle('fullscreen', on));
    a.on('portal-status', (info: PortalInfo) => {
      this.portal = info;
      this.events.emit('portal', info);
      this.renderStatus();
    });
    a.on('live-reload', (file: string) => {
      if (file.endsWith('.css')) this.toolAll('reloadCSS');
      else this.reloadAll(false);
      this.toast('Cambio detectado: ' + file);
    });
    a.on('ctx', (c: { wcId: number; action: string; x: number; y: number; src?: string }) => this.onContext(c));
  }

  private async onContext(c: { wcId: number; action: string; x: number; y: number; src?: string }) {
    const pane = this.panes.find((p) => p.wcId === c.wcId);
    if (!pane) return;
    switch (c.action) {
      case 'fill-forms':
        return this.runCommand('fill-forms');
      case 'clear-forms':
        return this.runCommand('clear-forms');
      case 'copy-selector': {
        const sel = await pane.tool<string | null>('selectorAt', { x: c.x, y: c.y });
        if (sel) {
          await api().copyText(sel);
          this.toast('Selector copiado: ' + sel);
        }
        return;
      }
      case 'reveal-element': {
        const sel = await pane.tool<string | null>('selectorAt', { x: c.x, y: c.y });
        this.select(pane);
        const inst = this.openPanel('elements') as PanelInstance & { reveal?: (s: string) => void };
        if (sel) inst.reveal?.(sel);
        return;
      }
      case 'screenshot':
        return this.screenshotPane(pane, false);
      case 'screenshot-full':
        return this.screenshotPane(pane, true);
      case 'copy-img-tag':
        await api().copyText(`<img src="${escapeHtml(c.src ?? '')}" alt="">`);
        return this.toast('Etiqueta <img> copiada');
    }
  }

  // ---------- commands ----------
  private buildCommands() {
    const c = (id: string, label: string, run: () => void, keys?: string): Command => ({ id, label, run, keys });
    const ws = (verb: 'save' | 'restore', n: number) =>
      c(`ws-${verb}-${n}`, `${verb === 'save' ? 'Guardar en' : 'Restaurar'} espacio de trabajo ${n}`, () => {
        if (verb === 'save') {
          this.settings.workspaces[n - 1] = structuredClone(this.panes.length ? this.panes.map((p) => p.cfg) : this.tab.panes);
          this.save();
          this.toast(`Espacio ${n} guardado`);
        } else {
          const w = this.settings.workspaces[n - 1];
          if (!w) return this.toast(`El espacio ${n} está vacío`);
          this.replacePanes(structuredClone(w));
        }
      });
    this.commands = [
      c('new-tab', 'Nueva pestaña', () => this.openTab(''), '⌘T'),
      c('duplicate-tab', 'Duplicar pestaña', () => this.openTab(this.tab.url, structuredClone(this.tab.panes))),
      c('close-tab', 'Cerrar pestaña', () => this.closeTab(this.tab), '⌘W'),
      c('reopen-tab', 'Reabrir pestaña cerrada', () => {
        const t = this.closedTabs.pop();
        if (t) {
          this.settings.tabs.push(t);
          this.switchTab(t);
        }
      }, '⇧⌘T'),
      c('focus-url', 'Ir a la barra de direcciones', () => this.urlInput.focus(), '⌘L'),
      c('open-folder', 'Abrir carpeta local (modo local)', async () => {
        const url = await api().serveFolder();
        if (url) this.navigate(url);
      }, '⌘O'),
      c('live-reload', 'Live reload: vigilar una carpeta', async () => {
        const dir = await api().watchFolder(true);
        if (dir) this.toast('Vigilando ' + dir);
      }),
      c('auto-reload', 'Recarga automática cada N segundos', async () => {
        const v = await ask('Recargar cada cuántos segundos (0 = desactivar)', '10');
        clearInterval(this.autoReload);
        const n = Number(v);
        if (n > 0) {
          this.autoReload = setInterval(() => this.reloadAll(false), n * 1000);
          this.toast(`Recarga automática cada ${n} s`);
        }
      }),
      c('reload', 'Recargar todos los paneles', () => this.reloadAll(false), '⌘R'),
      c('hard-reload', 'Vaciar caché y recargar', async () => {
        await api().clearData('cache');
        this.reloadAll(true);
      }, '⇧⌘R'),
      c('reload-css', 'Recargar solo el CSS', () => this.toolAll('reloadCSS'), '⌥⌘R'),
      ...LAYOUTS.map(([l, label], i) => c('layout-' + l, 'Diseño: ' + label, () => this.setLayout(l), `⌥${i + 1}`)),
      c('zoom-in', 'Acercar', () => this.zoom(0.1), '⌘='),
      c('zoom-out', 'Alejar', () => this.zoom(-0.1), '⌘-'),
      c('zoom-fit', 'Ajustar a la ventana', () => this.zoom('fit'), '⌘0'),
      c('zoom-reset', 'Zoom 100 %', () => this.zoom('reset')),
      c('page-zoom-in', 'Zoom de página +', () => this.pageZoom(0.1)),
      c('page-zoom-out', 'Zoom de página −', () => this.pageZoom(-0.1)),
      c('page-zoom-reset', 'Restablecer zoom de página', () => this.pageZoom('reset')),
      c('toggle-panel', 'Mostrar/ocultar panel lateral', () => this.togglePanel(), '⌘\\'),
      c('toggle-headers', 'Mostrar/ocultar encabezados de panel', () => {
        this.settings.headers = !this.settings.headers;
        this.relayout();
        this.save();
      }),
      c('toggle-dpr', 'Emular densidad de píxeles (más nitidez, más memoria)', () => {
        this.settings.emulateDpr = !this.settings.emulateDpr;
        for (const p of this.panes) p.emulate();
        this.save();
        this.toast(this.settings.emulateDpr ? 'DPR emulado' : 'DPR a 1× (modo ahorro de memoria)');
      }),
      c('toggle-rulers', 'Reglas', () => this.setTools({ rulers: !this.tools.rulers })),
      c('toggle-layout-debug', 'Depuración de layout', () => this.setTools({ layoutDebug: !this.tools.layoutDebug })),
      c('toggle-sync-scroll', 'Sincronizar scroll', () => this.setSync({ scroll: !this.settings.sync.scroll })),
      c('new-pane', 'Nuevo panel', () => this.addPane(paneFromWidth(1024, 768)), '⇧⌘N'),
      c('rotate-panes', 'Rotar todos los paneles', () => this.panes.forEach((p) => p.update({ width: p.cfg.height, height: p.cfg.width }))),
      c('randomize-panes', 'Tamaños de panel aleatorios', () =>
        this.panes.forEach((p) => {
          const w = 320 + Math.round(Math.random() * 1280);
          p.update({ width: w, height: 600 + Math.round(Math.random() * 500), name: `${w}px`, deviceId: undefined });
        }),
      ),
      c('remove-panes', 'Quitar todos los paneles', () => this.replacePanes([])),
      c('bp-panes', 'Crear paneles desde breakpoints CSS', () => this.breakpointPanes(false)),
      c('bp-edges', 'Crear paneles en los bordes de breakpoints', () => this.breakpointPanes(true)),
      ...[1, 2, 3, 4, 5].flatMap((n) => [ws('save', n), ws('restore', n)]),
      c('command', 'Barra de comandos', () => openPalette(this.commands), '⌘K'),
      c('find', 'Buscar en la página', () => this.toggleFind(), '⌘F'),
      c('devtools-pane', 'DevTools de Chromium del panel seleccionado', () => {
        const p = this.primary();
        if (p?.wcId) api().openDevTools(p.wcId);
      }, 'F12'),
      c('screenshot-all', 'Captura de todos los paneles', () => this.screenshotAll(false), '⇧⌘S'),
      c('screenshot-full-all', 'Captura de página completa (todos)', () => this.screenshotAll(true)),
      c('record', 'Grabar video', () => this.toggleRecording(), '⇧⌘E'),
      c('portal', 'Portal: probar en dispositivos reales', () => this.openPanel('portal')),
      c('fill-forms', 'Autocompletar formularios', async () => {
        const r = await this.toolAll<number>('fillForms', { email: this.settings.formEmail });
        const n = r.find((x) => x.status === 'fulfilled') as PromiseFulfilledResult<number> | undefined;
        this.toast(`${n?.value ?? 0} campos completados en cada panel`);
      }, '⇧⌘F'),
      c('clear-forms', 'Limpiar formularios', () => this.toolAll('clearForms')),
      c('toggle-csp', 'Activar/desactivar Content-Security-Policy', () => this.setSessionFlags({ noCSP: !this.flags.noCSP })),
      c('toggle-cors', 'Permitir/bloquear CORS abierto', () => this.setSessionFlags({ cors: !this.flags.cors })),
      c('clear-cache', 'Borrar caché', async () => (await api().clearData('cache'), this.toast('Caché borrada'))),
      c('clear-cookies', 'Borrar cookies', async () => (await api().clearData('cookies'), this.toast('Cookies borradas'))),
      c('clear-storage', 'Borrar todo el almacenamiento', async () => (await api().clearData('storage'), this.toast('Almacenamiento borrado'))),
      c('shortcuts', 'Atajos de teclado', () => openPalette(this.commands, true), '⌘/'),
      ...PANELS.map((p) => c('panel-' + p.id, 'Abrir herramienta: ' + p.title, () => this.openPanel(p.id))),
    ];
  }

  runCommand(id: string) {
    const cmd = this.commands.find((c) => c.id === id);
    if (cmd) cmd.run();
  }
}

function slug(s: string) {
  return (s || 'pagina').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'pagina';
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Megabytes as "500 MB", switching to "1.8 GB" from 1000 MB up. */
function fmtMB(mb: number) {
  return mb >= 1000 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}
