// Performance, emulation, debugging, storage, Portal and settings panels.
import qrcode from 'qrcode-generator';
import type { MemoryReport } from '../../shared/api';
import type { Emulation, NetworkPreset, PortalInfo, Vitals } from '../../shared/types';
import type { App } from '../app';
import { api, clear, field, fmtMs, h, select, toggle } from '../dom';
import { grade } from '../pane';
import { PRESETS } from '../devices';
import { defaultSettings, type Settings } from '../state';
import { action, copyBtn, empty, kv, link, pill, section, table } from './ui';

const VITAL_LABEL: [keyof Vitals, string, (v: number) => string][] = [
  ['lcp', 'LCP', fmtMs],
  ['cls', 'CLS', (v) => v.toFixed(3)],
  ['inp', 'INP', fmtMs],
  ['fcp', 'FCP', fmtMs],
  ['ttfb', 'TTFB', fmtMs],
];

export function performancePanel(app: App) {
  const vitals = h('div');
  const crux = h('div');
  const mem = h('div');
  let shown = false;

  const renderVitals = () => {
    if (!shown) return;
    clear(
      vitals,
      app.panes.length
        ? table(
            ['Panel', ...VITAL_LABEL.map((v) => v[1])],
            app.panes.map((p) => [p.cfg.name, ...VITAL_LABEL.map(([k, , f]) => h('span', { class: 'vital ' + grade(k, p.vitals[k]) }, p.vitals[k] === undefined ? '—' : f(p.vitals[k]!)))]),
          )
        : empty('Sin paneles.'),
      h('p', { class: 'muted small' }, 'Medido en este equipo con la emulación de cada panel. INP muestra la peor interacción hasta ahora; interactúa con la página para medirlo. Bueno: LCP ≤ 2.5 s · CLS ≤ 0.1 · INP ≤ 200 ms.'),
    );
  };

  const loadCrux = async () => {
    const key = app.settings.cruxKey;
    if (!key) return clear(crux, h('p', { class: 'muted small' }, 'Agrega una clave de la API de Chrome UX Report en Ajustes para comparar con datos reales de usuarios (CrUX).'));
    let url = '';
    try {
      url = new URL(app.tab.url).href;
    } catch {
      return;
    }
    clear(crux, empty('Consultando CrUX…'));
    const metrics = ['largest_contentful_paint', 'cumulative_layout_shift', 'interaction_to_next_paint', 'first_contentful_paint', 'experimental_time_to_first_byte'];
    const query = async (formFactor: string, byOrigin: boolean) => {
      const body = JSON.stringify({ [byOrigin ? 'origin' : 'url']: byOrigin ? new URL(url).origin : url, formFactor, metrics });
      const r = await api().postText(`https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${encodeURIComponent(key)}`, body, 'application/json');
      return r.ok ? JSON.parse(r.text).record : null;
    };
    const rows: any[][] = [];
    for (const [ff, label] of [['PHONE', 'Móvil'], ['DESKTOP', 'Escritorio']]) {
      let rec = await query(ff, false);
      let scope = 'URL';
      if (!rec) {
        rec = await query(ff, true);
        scope = 'origen';
      }
      if (!rec) {
        rows.push([label, 'sin datos', '', '', '', '']);
        continue;
      }
      const p75 = (m: string) => rec.metrics?.[m]?.percentiles?.p75;
      rows.push([
        `${label} (${scope})`,
        fmtMs(p75('largest_contentful_paint')),
        p75('cumulative_layout_shift') ?? '—',
        fmtMs(p75('interaction_to_next_paint')),
        fmtMs(p75('first_contentful_paint')),
        fmtMs(p75('experimental_time_to_first_byte')),
      ]);
    }
    clear(crux, table(['Usuarios reales (p75)', 'LCP', 'CLS', 'INP', 'FCP', 'TTFB'], rows), h('p', { class: 'muted small' }, 'Datos de los últimos 28 días de Chrome UX Report.'));
  };

  const renderMem = (m: MemoryReport) => {
    if (!shown) return;
    const byType = new Map<string, number>();
    for (const p of m.processes) byType.set(p.type, (byType.get(p.type) ?? 0) + p.mb);
    clear(
      mem,
      kv([
        ['Total', `${m.totalMB} MB`],
        ['Por panel (promedio)', app.panes.length ? `${Math.round((byType.get('Tab') ?? 0) / Math.max(1, app.panes.length + 1))} MB aprox.` : '—'],
        ...[...byType.entries()].map(([t, mb]) => [t, `${mb} MB`] as [string, string]),
      ]),
      h('p', { class: 'muted small' }, 'Para ahorrar memoria: cierra pestañas (las inactivas ya se descargan), reduce paneles o desactiva la emulación de DPR en Diseño.'),
    );
  };

  app.events.on('vitals', renderVitals);
  app.events.on('metrics', renderMem);
  const el = h('div', null, section('Core Web Vitals por panel', vitals), section('Comparación con usuarios reales', h('div', { class: 'row' }, action('Consultar CrUX', loadCrux, 'btn small')), crux), section('Memoria de Fronttier', mem));
  return {
    el,
    show: () => {
      shown = true;
      renderVitals();
      loadCrux();
      api().metrics().then(renderMem);
    },
    hide: () => (shown = false),
  };
}

const LOCALES = ['es-MX', 'es-ES', 'es-AR', 'en-US', 'en-GB', 'pt-BR', 'fr-FR', 'de-DE', 'it-IT', 'ja-JP', 'zh-CN', 'ko-KR', 'ar-SA', 'he-IL', 'hi-IN', 'ru-RU'];
const ZONES = ['America/Mexico_City', 'America/Bogota', 'America/Buenos_Aires', 'America/New_York', 'America/Los_Angeles', 'Europe/Madrid', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Australia/Sydney', 'UTC'];
const PLACES: [string, number, number][] = [
  ['Ciudad de México', 19.4326, -99.1332],
  ['Madrid', 40.4168, -3.7038],
  ['Buenos Aires', -34.6037, -58.3816],
  ['Nueva York', 40.7128, -74.006],
  ['Londres', 51.5072, -0.1276],
  ['Tokio', 35.6762, 139.6503],
];

export function emulationPanel(app: App) {
  const body = h('div');
  const render = () => {
    const e = app.settings.emu;
    const set = (patch: Partial<Emulation>) => (app.setEmu(patch), render());
    const lat = h('input', { type: 'number', step: '0.0001', value: e.geo ? String(e.geo.lat) : '', placeholder: 'Latitud' });
    const lng = h('input', { type: 'number', step: '0.0001', value: e.geo ? String(e.geo.lng) : '', placeholder: 'Longitud' });
    const locale = h('input', { type: 'text', list: 'locales', value: e.locale, placeholder: 'Idioma del sistema', onchange: () => set({ locale: locale.value.trim() }) });
    const tz = h('input', { type: 'text', list: 'zones', value: e.timezone, placeholder: 'Zona horaria del sistema', onchange: () => set({ timezone: tz.value.trim() }) });
    clear(
      body,
      h('datalist', { id: 'locales' }, LOCALES.map((l) => h('option', { value: l }))),
      h('datalist', { id: 'zones' }, ZONES.map((z) => h('option', { value: z }))),
      h('p', { class: 'muted small' }, 'Se aplica a todos los paneles mediante el protocolo de DevTools. Cada panel puede sobrescribir su esquema de color desde su encabezado.'),
      section(
        'Características de medios',
        field('prefers-color-scheme', select(e.colorScheme, [['', 'Sistema'], ['light', 'light'], ['dark', 'dark']], (v) => set({ colorScheme: v }))),
        field('prefers-reduced-motion', select(e.reducedMotion, [['', 'Sistema'], ['no-preference', 'no-preference'], ['reduce', 'reduce']], (v) => set({ reducedMotion: v }))),
        field('forced-colors', select(e.forcedColors, [['', 'Sistema'], ['none', 'none'], ['active', 'active (alto contraste)']], (v) => set({ forcedColors: v }))),
        field('prefers-contrast', select(e.contrast, [['', 'Sistema'], ['no-preference', 'no-preference'], ['more', 'more'], ['less', 'less']], (v) => set({ contrast: v }))),
        field('prefers-reduced-data', select(e.reducedData, [['', 'Sistema'], ['reduce', 'reduce']], (v) => set({ reducedData: v }))),
        field('Tipo de medio', select(e.mediaType, [['', 'screen (normal)'], ['print', 'print (impresión)']], (v) => set({ mediaType: v }))),
      ),
      section('Idioma y región', field('Idioma (navigator.language y Accept-Language)', locale), field('Zona horaria', tz)),
      section(
        'Geolocalización',
        h('div', { class: 'row' }, lat, lng, h('button', { class: 'btn small', onclick: () => set({ geo: lat.value && lng.value ? { lat: Number(lat.value), lng: Number(lng.value) } : null }) }, 'Aplicar')),
        h('div', { class: 'chips' }, PLACES.map(([n, la, lo]) => h('button', { class: 'chip' + (e.geo?.lat === la ? ' on' : ''), onclick: () => set({ geo: { lat: la, lng: lo } }) }, n)), h('button', { class: 'chip', onclick: () => set({ geo: null }) }, 'Real')),
      ),
      section(
        'Red y CPU',
        field('Velocidad de red', select<NetworkPreset>(e.network, [['none', 'Sin límite'], ['fast4g', '4G rápido'], ['fast3g', '3G rápido'], ['slow3g', '3G lento'], ['offline', 'Sin conexión']], (v) => set({ network: v }))),
        field('CPU', select(String(e.cpu), [['1', 'Sin límite'], ['2', '2× más lento'], ['4', '4× más lento'], ['6', '6× más lento'], ['20', '20× más lento']], (v) => set({ cpu: Number(v) }))),
        toggle('Desactivar caché HTTP', e.disableCache, (v) => set({ disableCache: v })),
        toggle('Desactivar JavaScript', e.disableJS, (v) => set({ disableJS: v }), 'Recarga la página para ver el efecto completo.'),
      ),
      h('button', { class: 'btn', onclick: () => set({ ...defaultSettings().emu }) }, 'Restablecer emulación'),
    );
  };
  render();
  return { el: body, show: render };
}

export function debugPanel(app: App) {
  const body = h('div');
  const render = () => {
    const t = app.tools;
    const g = t.grid ?? { columns: 12, gutter: 24, margin: 16, maxWidth: 1200 };
    const num = (label: string, key: keyof typeof g) => {
      const i = h('input', { type: 'number', value: String(g[key]), min: '0', onchange: () => app.setTools({ grid: { ...g, [key]: Number(i.value) } }) });
      return h('label', { class: 'mini-field' }, label, i);
    };
    const opacity = h('input', { type: 'range', min: '0.05', max: '1', step: '0.05', value: String(t.reference?.opacity ?? 0.5), oninput: () => t.reference && app.setTools({ reference: { ...t.reference, opacity: Number(opacity.value) } }) });
    const css = h('textarea', { class: 'code-input', rows: 8, spellcheck: false, placeholder: '/* CSS que se inyecta en todos los paneles en vivo */\nbody { outline: 2px solid hotpink; }' });
    css.value = app.tab.css;
    let cssTimer: ReturnType<typeof setTimeout> | undefined;
    css.addEventListener('input', () => {
      clearTimeout(cssTimer);
      cssTimer = setTimeout(() => {
        app.tab.css = css.value;
        for (const p of app.panes) p.applyCSS(css.value);
        app.save();
      }, 250);
    });
    css.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        css.setRangeText('  ', css.selectionStart, css.selectionEnd, 'end');
      }
    });
    clear(
      body,
      section(
        'Capas de depuración',
        toggle('Depuración de layout (contornos de todos los elementos)', t.layoutDebug, (v) => app.setTools({ layoutDebug: v })),
        toggle('Resaltar elementos que desbordan horizontalmente', t.overflow, (v) => app.setTools({ overflow: v })),
        toggle('Reglas y posición del cursor', t.rulers, (v) => app.setTools({ rulers: v })),
        toggle('Orden de foco', t.focusOrder, (v) => app.setTools({ focusOrder: v })),
        toggle('Mostrar texto alternativo de imágenes', t.showAlt, (v) => app.setTools({ showAlt: v })),
        toggle('Desactivar hojas de estilo', t.disableCSS, (v) => app.setTools({ disableCSS: v })),
        toggle('Ocultar imágenes y fondos', t.disableImages, (v) => app.setTools({ disableImages: v })),
      ),
      section(
        'Cuadrícula de columnas',
        toggle('Mostrar cuadrícula', !!t.grid, (v) => app.setTools({ grid: v ? g : null })),
        h('div', { class: 'row' }, num('Columnas', 'columns'), num('Separación', 'gutter'), num('Margen', 'margin'), num('Ancho máx.', 'maxWidth')),
      ),
      section(
        'Imagen de referencia (comparar con el diseño)',
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn small', onclick: async () => {
            const src = await api().pickImage();
            if (src) app.setTools({ reference: { src, opacity: 0.5, difference: false } });
            render();
          } }, 'Elegir imagen…'),
          t.reference ? h('button', { class: 'btn small', onclick: () => (app.setTools({ reference: null }), render()) }, 'Quitar') : null,
        ),
        t.reference ? h('div', null, h('label', { class: 'mini-field wide' }, 'Opacidad', opacity), toggle('Modo diferencia (resalta lo que no coincide)', t.reference.difference, (v) => app.setTools({ reference: { ...t.reference!, difference: v } }))) : null,
      ),
      section('CSS en vivo (todos los paneles)', css, h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => app.toolAll('reloadCSS') }, 'Recargar CSS de la página'))),
      section(
        'Seguridad de la sesión (solo para desarrollo)',
        toggle('Desactivar Content-Security-Policy', app.flags.noCSP, (v) => app.setSessionFlags({ noCSP: v })),
        toggle('Permitir CORS desde cualquier origen', app.flags.cors, (v) => app.setSessionFlags({ cors: v })),
      ),
      section(
        'Archivos locales',
        h('div', { class: 'row wrap' }, h('button', { class: 'btn small', onclick: () => app.runCommand('open-folder') }, 'Servir una carpeta (modo local)'), h('button', { class: 'btn small', onclick: () => app.runCommand('live-reload') }, 'Live reload de carpeta'), h('button', { class: 'btn small', onclick: () => app.runCommand('auto-reload') }, 'Recarga automática')),
      ),
      section('Lectura', h('div', { class: 'row' }, action('Modo lectura del panel seleccionado', () => openReader(app), 'btn small'))),
    );
  };
  app.events.on('tab', () => body.isConnected && render());
  render();
  return { el: body, show: render };
}

async function openReader(app: App) {
  const p = app.primary();
  if (!p) return;
  const r = await p.tool<{ title: string; blocks: { tag: string; text: string }[]; words: number; minutes: number }>('reader');
  const tagFor = (t: string) => (['h1', 'h2', 'h3', 'h4', 'blockquote', 'pre', 'li'].includes(t) ? t : 'p') as 'p';
  const overlay = h(
    'div',
    { class: 'modal-backdrop', onmousedown: (e: MouseEvent) => e.target === overlay && overlay.remove() },
    h(
      'article',
      { class: 'modal reader' },
      h('button', { class: 'icon-btn close', onclick: () => overlay.remove(), title: 'Cerrar' }, '✕'),
      h('h1', null, r.title),
      h('p', { class: 'muted' }, `${r.words} palabras · ${r.minutes} min de lectura`),
      r.blocks.map((b) => h(tagFor(b.tag), null, b.text)),
    ),
  );
  document.body.appendChild(overlay);
}

export function storagePanel(app: App) {
  const body = h('div');
  async function load() {
    const p = app.primary();
    if (!p) return clear(body, empty('Abre una página.'));
    const s = await p.tool<{ local: [string, string][]; session: [string, string][]; error?: string }>('storage');
    const cookies = p.url.startsWith('http') ? await api().getCookies(p.url) : [];
    const area = (name: 'local' | 'session', label: string, rows: [string, string][]) =>
      section(
        `${label} (${rows.length})`,
        h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: async () => (await app.toolAll('storageEdit', { area: name, action: 'clear' }), load()) }, 'Vaciar en todos los paneles')),
        rows.length
          ? table(
              ['Clave', 'Valor', ''],
              rows.map(([k, v]) => [h('code', null, k), h('span', { class: 'break small' }, v.length > 300 ? v.slice(0, 300) + '…' : v), h('button', { class: 'icon-btn tiny', title: 'Eliminar', onclick: async () => (await app.toolAll('storageEdit', { area: name, action: 'remove', key: k }), load()) }, '✕')]),
              'compact',
            )
          : empty('Vacío.'),
      );
    clear(
      body,
      h('div', { class: 'row wrap' }, action('Actualizar', load, 'btn small'), h('button', { class: 'btn small', onclick: () => app.runCommand('clear-cookies') }, 'Borrar cookies'), h('button', { class: 'btn small', onclick: () => app.runCommand('clear-cache') }, 'Borrar caché'), h('button', { class: 'btn small danger', onclick: () => app.runCommand('clear-storage') }, 'Borrar todo')),
      s.error ? empty(s.error) : null,
      area('local', 'localStorage', s.local),
      area('session', 'sessionStorage', s.session),
      section(
        `Cookies (${cookies.length})`,
        cookies.length
          ? table(
              ['Nombre', 'Valor', 'Dominio', 'Flags'],
              cookies.map((c) => [h('code', null, c.name), h('span', { class: 'break small' }, c.value.slice(0, 120)), c.domain ?? '', [c.secure ? 'Secure' : '', c.httpOnly ? 'HttpOnly' : ''].filter(Boolean).join(' ')]),
              'compact',
            )
          : empty('Sin cookies.'),
      ),
    );
  }
  return { el: body, show: () => load().catch((e) => clear(body, empty(e.message))) };
}

export function portalPanel(app: App) {
  const body = h('div');
  const render = (info: PortalInfo = app.portal) => {
    const port = h('input', { type: 'number', value: String(app.settings.portalPort), min: '0', max: '65535', onchange: () => ((app.settings.portalPort = Number(port.value)), app.save()) });
    const qr = (url: string) => {
      const q = qrcode(0, 'M');
      q.addData(url);
      q.make();
      return h('div', { class: 'qr', html: q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) });
    };
    const urls = [...info.lan, ...(info.publicUrl ? [info.publicUrl] : [])];
    clear(
      body,
      h('p', { class: 'muted small' }, 'Portal comparte el sitio de la pestaña actual con teléfonos, tabletas u otros navegadores de tu red. Scroll, clics, formularios y navegación se sincronizan en ambos sentidos.'),
      info.running
        ? h(
            'div',
            null,
            kv([
              ['Sitio', info.target ?? ''],
              ['Dispositivos conectados', String(info.clients)],
            ]),
            urls.map((u) => h('div', { class: 'portal-url' }, qr(u), h('div', null, h('code', null, u), copyBtn(u), h('div', { class: 'muted small' }, u === info.publicUrl ? 'URL pública (Cloudflare Tunnel)' : 'Red local: el dispositivo debe estar en el mismo Wi-Fi')))),
            info.tunnelError ? h('p', null, pill('warn', info.tunnelError), ' ', link('https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/', 'Descargar cloudflared')) : null,
            action('Detener Portal', () => api().portalStop(), 'btn danger'),
          )
        : h(
            'div',
            null,
            field('Puerto (0 = automático)', port),
            toggle('Crear también una URL pública (requiere cloudflared instalado)', app.settings.portalPublic, (v) => ((app.settings.portalPublic = v), app.save())),
            action('Iniciar Portal', async () => {
              if (!/^https?:/.test(app.tab.url)) return app.toast('Abre primero un sitio http(s) en esta pestaña.');
              try {
                render(await api().portalStart(app.tab.url, app.settings.portalPort, app.settings.portalPublic));
              } catch (e: any) {
                app.toast('No se pudo iniciar Portal: ' + e.message, 'error');
              }
            }, 'btn primary'),
            h('p', { class: 'muted small' }, 'En Windows y macOS el sistema puede pedir permiso de firewall la primera vez.'),
          ),
    );
  };
  app.events.on('portal', render);
  render();
  return { el: body, show: () => render() };
}

export function settingsPanel(app: App) {
  const body = h('div');
  const render = () => {
    const s = app.settings;
    const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
      s[k] = v;
      app.save();
    };
    const email = h('input', { type: 'email', value: s.formEmail, onchange: () => set('formEmail', email.value.trim()) });
    const crux = h('input', { type: 'password', value: s.cruxKey, placeholder: 'AIza…', onchange: () => set('cruxKey', crux.value.trim()) });
    clear(
      body,
      section(
        'General',
        field('Tema de Fronttier', select(s.theme, [['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro']], (v) => (set('theme', v), app.applyTheme()))),
        field('Buscador de la barra de direcciones', select(s.searchEngine, [['duckduckgo', 'DuckDuckGo'], ['google', 'Google'], ['bing', 'Bing'], ['ecosia', 'Ecosia']], (v) => set('searchEngine', v))),
        field('Paneles para pestañas nuevas', select(s.defaultPreset, Object.entries(PRESETS).map(([k, p]) => [k, p.label] as [string, string]), (v) => set('defaultPreset', v))),
        toggle('Emular densidad de píxeles (DPR)', s.emulateDpr, (v) => (set('emulateDpr', v), app.panes.forEach((p) => p.emulate())), 'Desactívalo para ahorrar memoria en equipos modestos.'),
      ),
      section('Formularios', field('Correo para autocompletar', email)),
      section('Rendimiento', field('Clave de la API de Chrome UX Report', crux, 'Opcional. Gratuita en Google Cloud Console (Chrome UX Report API).')),
      section(
        'Datos',
        h(
          'div',
          { class: 'row wrap' },
          h('button', { class: 'btn small', onclick: () => (set('history', []), app.toast('Historial borrado')) }, 'Borrar historial'),
          h('button', { class: 'btn small', onclick: () => (set('bookmarks', []), app.toast('Marcadores borrados')) }, 'Borrar marcadores'),
          h('button', { class: 'btn small danger', onclick: async () => {
            await api().settingsSet({ app: null });
            location.reload();
          } }, 'Restablecer todos los ajustes'),
        ),
      ),
      section('Atajos', h('button', { class: 'btn small', onclick: () => app.runCommand('shortcuts') }, 'Ver atajos de teclado')),
    );
  };
  render();
  return { el: body, show: render };
}
