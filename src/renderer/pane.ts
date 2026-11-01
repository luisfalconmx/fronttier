// One responsive pane: a <webview> sized like the emulated device, with its
// header, device chrome (notch, mobile browser bars) and Web Vitals footer.
import type { WebviewTag } from 'electron';
import type { PaneConfig, SyncEvent, Vitals } from '../shared/types';
import type { App } from './app';
import { DEVICES, GROUP_LABELS } from './devices';
import { api, clear, closePopover, h, icon, iconButton, menuList, popover } from './dom';
import { paneFromDevice } from './state';

const THRESHOLDS: Record<keyof Vitals, [number, number]> = {
  lcp: [2500, 4000],
  fcp: [1800, 3000],
  cls: [0.1, 0.25],
  inp: [200, 500],
  ttfb: [800, 1800],
};

export function grade(k: keyof Vitals, v?: number) {
  if (v === undefined) return 'none';
  const [good, poor] = THRESHOLDS[k];
  return v <= good ? 'good' : v <= poor ? 'mid' : 'poor';
}

export class PaneView {
  el: HTMLElement;
  webview: WebviewTag;
  wcId = 0;
  url = '';
  title = '';
  syncLoad = false;
  /** Time of the last real user input inside this pane. */
  lastInput = 0;
  vitals: Vitals = {};
  overflow = { overflow: false, amount: 0, count: 0 };
  private started = false;
  private pendingUrl = '';
  private frame: HTMLElement;
  private head: HTMLElement;
  private foot: HTMLElement;
  private sizeLabel: HTMLElement;
  private nameLabel: HTMLElement;
  private toolSeq = 0;
  private toolWaiters = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private cssKey: string | null = null;
  private override: { width: number; height: number } | null = null;

  constructor(
    private app: App,
    public cfg: PaneConfig,
  ) {
    this.webview = document.createElement('webview') as WebviewTag;
    this.webview.setAttribute('partition', 'persist:fronttier');
    this.webview.setAttribute('webpreferences', 'contextIsolation=yes, spellcheck=no');
    if (cfg.ua) this.webview.setAttribute('useragent', cfg.ua);
    // Start blank so emulation (UA, DPR, viewport) is in place before the first real request.
    this.webview.src = 'about:blank';

    this.nameLabel = h('span', { class: 'pane-name', title: 'Doble clic para renombrar', ondblclick: () => this.rename() }, cfg.name);
    this.sizeLabel = h('span', { class: 'pane-size' });
    this.head = h(
      'div',
      { class: 'pane-head', onmousedown: () => app.select(this) },
      this.nameLabel,
      this.sizeLabel,
      h('span', { class: 'spacer' }),
      iconButton('more', 'Acciones del panel', (e) => this.moreMenu(e.currentTarget as HTMLElement)),
    );
    this.frame = h('div', { class: 'pane-frame' });
    this.foot = h('div', { class: 'pane-foot' });
    this.el = h('section', { class: 'pane', 'data-id': cfg.id }, this.head, h('div', { class: 'pane-body' }, this.frame), this.foot);
    this.wire();
    this.layout();
    this.renderFoot();
  }

  get viewport() {
    const w = this.override?.width ?? this.cfg.width;
    const hgt = this.override?.height ?? this.cfg.height;
    const ui = this.cfg.showUI && this.cfg.ui && !this.override ? this.cfg.ui : { top: 0, bottom: 0 };
    return { width: w, height: Math.max(100, hgt - ui.top - ui.bottom), ui };
  }

  private wire() {
    const wv = this.webview;
    wv.addEventListener('dom-ready', async () => {
      this.wcId = wv.getWebContentsId();
      await this.emulate();
      wv.send('init', this.app.paneInit(this));
      if (this.app.settings.pageZoom !== 1) wv.setZoomFactor(this.app.settings.pageZoom);
      this.applyCSS(this.app.tab.css);
      if (!this.started) {
        this.started = true;
        if (this.pendingUrl) wv.loadURL(this.pendingUrl).catch(() => {});
      }
    });
    wv.addEventListener('did-navigate', (e) => {
      if (e.url === 'about:blank') return;
      this.vitals = {};
      this.renderFoot();
      this.app.onPaneNavigate(this, e.url, false);
    });
    wv.addEventListener('did-navigate-in-page', (e) => e.isMainFrame && this.app.onPaneNavigate(this, e.url, true));
    wv.addEventListener('page-title-updated', (e) => {
      this.title = e.title;
      this.app.onPaneTitle(this, e.title);
    });
    wv.addEventListener('page-favicon-updated', (e) => this.app.onPaneFavicon(this, e.favicons[0]));
    wv.addEventListener('did-start-loading', () => this.el.classList.add('loading'));
    wv.addEventListener('did-stop-loading', () => this.el.classList.remove('loading'));
    wv.addEventListener('did-fail-load', (e) => {
      if (e.isMainFrame) this.syncLoad = false;
      if (e.isMainFrame && e.errorCode !== -3)this.app.events.emit('console', { pane: this, level: 'error', message: `No se pudo cargar ${e.validatedURL}: ${e.errorDescription} (${e.errorCode})`, source: '' });
    });
    wv.addEventListener('console-message', (e: any) => {
      const lv = e.level;
      const level = typeof lv === 'string' ? lv : ['verbose', 'info', 'warning', 'error'][lv] ?? 'info';
      this.app.events.emit('console', { pane: this, level, message: e.message, source: e.sourceId ? `${e.sourceId}:${e.line ?? e.lineNumber ?? ''}` : '' });
    });
    wv.addEventListener('found-in-page', (e) => this.app.events.emit('found', { pane: this, result: e.result }));
    wv.addEventListener('render-process-gone', () => this.app.events.emit('console', { pane: this, level: 'error', message: 'El proceso del panel se cerró inesperadamente. Recarga el panel.', source: '' }));
    wv.addEventListener('ipc-message', (e) => {
      const [a, b, c] = e.args;
      switch (e.channel) {
        case 'sync':
          this.app.broadcast(this, a as SyncEvent);
          break;
        case 'user-input':
          this.lastInput = Date.now();
          closePopover();
          break;
        case 'tool-result': {
          const w = this.toolWaiters.get(a);
          if (!w) return;
          this.toolWaiters.delete(a);
          c ? w.reject(new Error(c)) : w.resolve(b);
          break;
        }
        case 'vitals':
          this.vitals = a;
          this.renderFoot();
          this.app.events.emit('vitals', this);
          break;
        case 'overflow':
          this.overflow = a;
          this.renderFoot();
          this.app.events.emit('overflow', this);
          break;
        case 'hover-at':
          if (this.wcId) api().cdp(this.wcId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: a, y: b }).catch(() => {});
          break;
      }
    });
  }

  load(url: string, bySync = false) {
    this.syncLoad = bySync;
    if (!this.started) {
      this.pendingUrl = url;
      return;
    }
    this.webview.loadURL(url).catch(() => {});
  }

  send(channel: string, ...args: unknown[]) {
    if (this.wcId) this.webview.send(channel, ...args);
  }

  tool<T = any>(name: string, args?: unknown, timeout = 20000): Promise<T> {
    if (!this.wcId) return Promise.reject(new Error('El panel aún no está listo'));
    const id = ++this.toolSeq;
    return new Promise<T>((resolve, reject) => {
      this.toolWaiters.set(id, { resolve, reject });
      this.webview.send('tool', id, name, args);
      setTimeout(() => {
        if (this.toolWaiters.delete(id)) reject(new Error('Tiempo de espera agotado'));
      }, timeout);
    });
  }

  async emulate() {
    if (!this.wcId) return;
    const vp = this.viewport;
    try {
      await api().emulate(this.wcId, { pane: this.cfg, viewport: { width: vp.width, height: vp.height }, emu: this.app.settings.emu, emulateDpr: this.app.settings.emulateDpr });
    } catch (e) {
      console.warn('emulación', e);
    }
  }

  /** PNG of the visible viewport, or of the whole page stitched from scrolled segments. */
  async capture(full: boolean): Promise<string> {
    if (!full) return api().capture(this.wcId);
    const off = { scroll: false, click: false, input: false, hover: false, keys: false, nav: false };
    this.send('sync-flags', off);
    const js = (code: string) => this.webview.executeJavaScript(code);
    let restore = { x: 0, y: 0 };
    try {
      const info: { total: number; vh: number; vw: number; x: number; y: number } = await js(`(() => {
        const se = document.scrollingElement || document.documentElement;
        window.__fronttierFixed = [...document.querySelectorAll('body *')].filter((e) => /fixed|sticky/.test(getComputedStyle(e).position));
        // visualViewport, not innerWidth: mobile pages that overflow are zoomed out.
        const vv = window.visualViewport;
        return { total: Math.min(se.scrollHeight, 16000), vh: vv ? vv.height : innerHeight, vw: vv ? vv.width : innerWidth, x: scrollX, y: scrollY };
      })()`);
      restore = { x: info.x, y: info.y };
      const canvas = document.createElement('canvas');
      let ratio = 0;
      let bottom = 0;
      let last = -1;
      const ctx = canvas.getContext('2d')!;
      for (let y = 0; y < info.total; y += info.vh) {
        const actual: number = await js(`(() => { scrollTo(0, ${y}); for (const e of window.__fronttierFixed) e.style.visibility = ${y > 0} ? 'hidden' : ''; return scrollY; })()`);
        // Mobile pages wider than the viewport cannot scroll any further; stop there.
        if (actual <= last) break;
        last = actual;
        // Wait for the scrolled frame to be painted (bounded: rAF pauses if the window is hidden).
        await Promise.race([js('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))'), new Promise((r) => setTimeout(r, 400))]);
        await new Promise((r) => setTimeout(r, 60));
        const img = await loadImg(await api().capture(this.wcId));
        if (!ratio) {
          ratio = img.width / info.vw;
          canvas.width = img.width;
          canvas.height = Math.round(info.total * ratio);
        }
        ctx.drawImage(img, 0, Math.round(actual * ratio));
        bottom = Math.max(bottom, Math.round(actual * ratio) + img.height);
        if (actual + info.vh >= info.total - 1) break;
      }
      if (bottom < canvas.height) {
        const cropped = document.createElement('canvas');
        cropped.width = canvas.width;
        cropped.height = bottom;
        cropped.getContext('2d')!.drawImage(canvas, 0, 0);
        return cropped.toDataURL('image/png');
      }
      return canvas.toDataURL('image/png');
    } finally {
      await js(`(() => { for (const e of window.__fronttierFixed || []) e.style.visibility = ''; scrollTo(${restore.x}, ${restore.y}); })()`).catch(() => {});
      this.send('sync-flags', this.app.settings.sync);
    }
  }

  async applyCSS(css: string) {
    if (!this.wcId) return;
    if (this.cssKey) await this.webview.removeInsertedCSS(this.cssKey).catch(() => {});
    this.cssKey = css.trim() ? await this.webview.insertCSS(css).catch(() => null) : null;
  }

  update(patch: Partial<PaneConfig>) {
    Object.assign(this.cfg, patch);
    this.nameLabel.textContent = this.cfg.name;
    if (patch.ua !== undefined) this.webview.setAttribute('useragent', this.cfg.ua ?? '');
    this.layout();
    if ('showVitals' in patch) this.renderFoot();
    this.emulate();
    this.app.persistTab();
    this.app.relayout();
  }

  setOverride(size: { width: number; height: number } | null) {
    this.override = size;
    this.layout();
    this.emulate();
  }

  setSelected(on: boolean) {
    this.el.classList.toggle('selected', on);
  }

  /** Recompute DOM sizes for the device frame. */
  layout() {
    const vp = this.viewport;
    const c = this.cfg;
    const totalH = this.override?.height ?? c.height;
    this.sizeLabel.textContent = `${vp.width} × ${vp.height}`;
    this.el.style.width = vp.width + 'px';
    const parts: Node[] = [];
    if (vp.ui.top) parts.push(h('div', { class: 'mobile-ui top', style: { height: vp.ui.top + 'px' } }, h('span', null, '9:41'), h('span', { class: 'url-pill' }, this.urlHost())));
    parts.push(this.webview);
    if (vp.ui.bottom) parts.push(h('div', { class: 'mobile-ui bottom', style: { height: vp.ui.bottom + 'px' } }, h('span', { class: 'bar' })));
    if (c.notch && c.notch !== 'none' && !this.override) parts.push(h('div', { class: 'notch ' + c.notch + (vp.ui.top ? ' under-ui' : '') }));
    this.webview.style.width = vp.width + 'px';
    this.webview.style.height = vp.height + 'px';
    // Re-append only when the structure changed: moving a webview reloads it.
    const current = Array.from(this.frame.children);
    const same = current.length === parts.length && current.every((n, i) => (n as HTMLElement).className === (parts[i] as HTMLElement).className);
    if (!same) {
      for (const n of current) if (n !== this.webview) n.remove();
      if (this.webview.parentElement !== this.frame) this.frame.appendChild(this.webview);
      for (const p of parts) if (p !== this.webview) parts.indexOf(p) < parts.indexOf(this.webview) ? this.frame.insertBefore(p, this.webview) : this.frame.appendChild(p);
    } else {
      current.forEach((n, i) => n !== this.webview && n.replaceWith(parts[i]));
    }
    this.frame.style.width = vp.width + 'px';
    this.frame.style.height = totalH + 'px';
  }

  private urlHost() {
    try {
      return new URL(this.url).host;
    } catch {
      return '';
    }
  }

  renderFoot() {
    const chip = (k: keyof Vitals, label: string, fmt: (v: number) => string) => {
      const v = this.vitals[k];
      return h('span', { class: 'vital ' + grade(k, v), title: label }, h('b', null, k.toUpperCase()), v === undefined ? '—' : fmt(v));
    };
    const ms = (v: number) => (v < 1000 ? Math.round(v) + 'ms' : (v / 1000).toFixed(1) + 's');
    const vitals = !!this.cfg.showVitals;
    this.foot.classList.toggle('hidden', !vitals && !this.overflow.overflow);
    clear(
      this.foot,
      vitals ? chip('lcp', 'Largest Contentful Paint', ms) : null,
      vitals ? chip('cls', 'Cumulative Layout Shift', (v) => v.toFixed(3)) : null,
      vitals ? chip('inp', 'Interaction to Next Paint (peor interacción)', ms) : null,
      vitals ? chip('fcp', 'First Contentful Paint', ms) : null,
      vitals ? chip('ttfb', 'Time to First Byte', ms) : null,
      this.overflow.overflow
        ? h('button', { class: 'overflow-warn', title: 'Haz clic para resaltar los elementos que desbordan', onclick: () => this.app.setTools({ overflow: true }) }, icon('warn', 12), ` Desborde horizontal ${this.overflow.amount}px`)
        : null,
    );
  }

  private rename() {
    const input = h('input', { class: 'pane-rename', value: this.cfg.name });
    this.nameLabel.replaceWith(input);
    input.focus();
    input.select();
    const done = () => {
      input.replaceWith(this.nameLabel);
      if (input.value.trim()) this.update({ name: input.value.trim() });
    };
    input.addEventListener('blur', done);
    input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
  }

  private cycleScheme() {
    const next = ({ '': 'dark', dark: 'light', light: '' } as const)[this.cfg.colorScheme ?? ''];
    this.update({ colorScheme: next });
    this.app.toast(next ? `Panel en modo ${next === 'dark' ? 'oscuro' : 'claro'}` : 'Panel con el esquema global');
  }

  private deviceMenu(anchor: HTMLElement) {
    const items: Parameters<typeof menuList>[0] = [];
    for (const g of Object.keys(GROUP_LABELS) as (keyof typeof GROUP_LABELS)[]) {
      items.push({ heading: GROUP_LABELS[g] });
      for (const d of DEVICES.filter((x) => x.group === g)) {
        items.push({
          label: d.name,
          hint: `${d.width}×${d.height}`,
          checked: this.cfg.deviceId === d.id,
          onclick: () => {
            const { id, ...rest } = paneFromDevice(d);
            void id;
            this.update(rest);
          },
        });
      }
    }
    const close = popover(anchor, menuList(items, () => close()), { width: 280 });
  }

  private moreMenu(anchor: HTMLElement) {
    const c = this.cfg;
    const num = (label: string, key: 'width' | 'height' | 'dpr') => {
      const input = h('input', { type: 'number', value: String(c[key]), min: key === 'dpr' ? '0.5' : '100', step: key === 'dpr' ? '0.25' : '1', onchange: () => this.update({ [key]: Number(input.value) || c[key] }) });
      return h('label', { class: 'mini-field' }, label, input);
    };
    const check = (label: string, key: 'mobile' | 'touch' | 'showUI') => {
      const input = h('input', { type: 'checkbox', checked: !!c[key], onchange: () => this.update({ [key]: input.checked }) });
      return h('label', { class: 'mini-check' }, input, label);
    };
    const ua = h('input', { type: 'text', placeholder: 'User agent por defecto', value: c.ua ?? '', onchange: () => this.update({ ua: ua.value.trim() || undefined }) });
    const vp = this.viewport;
    const scheme = { '': 'Esquema global', dark: 'Oscuro', light: 'Claro' }[c.colorScheme ?? ''];
    const body = h(
      'div',
      { class: 'pane-settings' },
      h(
        'div',
        { class: 'pane-info' },
        h('strong', { class: 'ellipsis' }, c.name),
        h('div', { class: 'pane-info-meta' }, h('span', null, `${vp.width} × ${vp.height} px`), h('span', null, `${c.dpr}x DPR`), c.touch ? h('span', null, 'Táctil') : null, c.mobile ? h('span', null, 'Móvil') : null),
      ),
      menuList(
        [
          { label: 'Cambiar dispositivo…', icon: 'emulate', onclick: () => setTimeout(() => this.deviceMenu(anchor)) },
          { label: 'Rotar', icon: 'rotate', onclick: () => this.update({ width: this.cfg.height, height: this.cfg.width }) },
          { label: 'Esquema de color', icon: 'scheme', hint: scheme, onclick: () => this.cycleScheme() },
          { label: 'Captura de este panel', icon: 'camera', onclick: () => this.app.screenshotPane(this, false) },
          { label: 'Captura de página completa', icon: 'fullPage', onclick: () => this.app.screenshotPane(this, true) },
          { label: 'DevTools de Chromium', icon: 'devtools', onclick: () => this.app.openDevtools('window', this, false) },
          { label: 'Recargar este panel', icon: 'reload', onclick: () => this.webview.reload() },
          { label: c.showVitals ? 'Ocultar métricas (LCP, CLS…)' : 'Mostrar métricas (LCP, CLS…)', icon: 'vitals', onclick: () => this.update({ showVitals: !c.showVitals }) },
        ],
        () => close(),
      ),
      h('div', { class: 'menu-sep' }),
      h('div', { class: 'menu-heading' }, 'Ajustes'),
      h('div', { class: 'row' }, num('Ancho', 'width'), num('Alto', 'height'), num('DPR', 'dpr')),
      h('div', { class: 'row' }, check('Móvil', 'mobile'), check('Táctil', 'touch'), c.ui ? check('Barras del navegador', 'showUI') : null),
      h('label', { class: 'mini-field wide' }, 'User agent', ua),
      menuList(
        [
          'sep',
          { label: 'Duplicar panel', icon: 'duplicate', onclick: () => this.app.addPane({ ...structuredClone(this.cfg), name: this.cfg.name + ' (copia)' }) },
          { label: 'Mover a la izquierda', icon: 'moveLeft', onclick: () => this.app.movePane(this, -1) },
          { label: 'Mover a la derecha', icon: 'moveRight', onclick: () => this.app.movePane(this, 1) },
          'sep',
          { label: 'Quitar panel', icon: 'trash', danger: true, onclick: () => this.app.removePane(this) },
        ],
        () => close(),
      ),
    );
    const close = popover(anchor, body, { width: 300, align: 'right', beside: this.el });
  }

  destroy() {
    for (const w of this.toolWaiters.values()) w.reject(new Error('Panel cerrado'));
    this.toolWaiters.clear();
    this.el.remove();
  }
}

function loadImg(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
