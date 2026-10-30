// Page audits that run inside a pane and return plain JSON to the shell.
import { blend, contrastRatio, apca, parseColor, suggestColor, toHex, type RGBA } from '../shared/color';
import { find, isOurs, selectorFor } from '../shared/sync-core';
import { accessibleName, docRect, el, isVisible, layer, roleOf, textOf } from './dom';

export interface Issue {
  level: 'error' | 'warn' | 'info';
  msg: string;
}

const attr = (sel: string, name = 'content') => document.querySelector(sel)?.getAttribute(name) ?? null;

export function meta() {
  const metas: Record<string, string> = {};
  document.querySelectorAll('meta[property], meta[name]').forEach((m) => {
    const k = m.getAttribute('property') || m.getAttribute('name');
    if (k && !(k in metas)) metas[k] = m.getAttribute('content') ?? '';
  });
  const og = Object.fromEntries(Object.entries(metas).filter(([k]) => k.startsWith('og:') || k.startsWith('article:') || k.startsWith('fb:')));
  const twitter = Object.fromEntries(Object.entries(metas).filter(([k]) => k.startsWith('twitter:')));
  const jsonld = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((s) => {
    try {
      const data = JSON.parse(s.textContent ?? '');
      const types = ([] as any[]).concat(data['@graph'] ?? data).map((d: any) => d?.['@type']).flat().filter(Boolean);
      return { ok: true, types, data };
    } catch (e: any) {
      return { ok: false, types: [], error: String(e.message), raw: (s.textContent ?? '').slice(0, 2000) };
    }
  });
  const icons = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"]')).map((l) => ({ rel: l.rel, href: l.href, sizes: l.getAttribute('sizes') ?? '' }));
  const alternates = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')).map((l) => ({ lang: l.hreflang, href: l.href }));
  const r = {
    url: location.href,
    title: document.title,
    description: metas.description ?? null,
    canonical: (document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.href ?? null,
    viewport: metas.viewport ?? null,
    lang: document.documentElement.lang || null,
    charset: document.characterSet,
    robots: metas.robots ?? null,
    themeColor: metas['theme-color'] ?? null,
    manifest: (document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null)?.href ?? null,
    generator: metas.generator ?? null,
    icons,
    alternates,
    og,
    twitter,
    jsonld,
    all: metas,
    h1: Array.from(document.querySelectorAll('h1')).map((h) => textOf(h)),
  };
  const issues: Issue[] = [];
  const len = (s: string | null) => (s ?? '').length;
  if (!r.title) issues.push({ level: 'error', msg: 'Falta <title>.' });
  else if (len(r.title) > 60) issues.push({ level: 'warn', msg: `El título tiene ${len(r.title)} caracteres (recomendado ≤ 60).` });
  if (!r.description) issues.push({ level: 'error', msg: 'Falta meta description.' });
  else if (len(r.description) < 50 || len(r.description) > 160) issues.push({ level: 'warn', msg: `La descripción tiene ${len(r.description)} caracteres (recomendado 50–160).` });
  if (!r.viewport) issues.push({ level: 'error', msg: 'Falta meta viewport: la página no será responsiva en móviles.' });
  else if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/.test(r.viewport)) issues.push({ level: 'warn', msg: 'El viewport impide el zoom (user-scalable/maximum-scale): problema de accesibilidad.' });
  if (!r.lang) issues.push({ level: 'error', msg: 'Falta el atributo lang en <html>.' });
  if (!r.canonical) issues.push({ level: 'info', msg: 'No hay URL canónica.' });
  if (r.h1.length === 0) issues.push({ level: 'warn', msg: 'No hay ningún <h1>.' });
  if (r.h1.length > 1) issues.push({ level: 'info', msg: `Hay ${r.h1.length} elementos <h1>.` });
  if (!og['og:title']) issues.push({ level: 'warn', msg: 'Falta og:title.' });
  if (!og['og:image']) issues.push({ level: 'warn', msg: 'Falta og:image: las vistas previas sociales no tendrán imagen.' });
  if (!og['og:description']) issues.push({ level: 'info', msg: 'Falta og:description.' });
  if (!twitter['twitter:card']) issues.push({ level: 'info', msg: 'Falta twitter:card.' });
  if (!icons.length) issues.push({ level: 'warn', msg: 'No hay favicon declarado.' });
  if (r.robots && /noindex/i.test(r.robots)) issues.push({ level: 'warn', msg: 'La página tiene noindex.' });
  for (const j of jsonld) if (!j.ok) issues.push({ level: 'error', msg: 'JSON-LD inválido: ' + j.error });
  return { ...r, issues };
}

const LANDMARK_SEL = 'header, nav, main, aside, footer, form[aria-label], form[aria-labelledby], section[aria-label], section[aria-labelledby], search, [role=banner], [role=navigation], [role=main], [role=complementary], [role=contentinfo], [role=search], [role=region], [role=form]';

export function outline() {
  const headings = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, [role=heading]'))
    .filter((h) => !isOurs(h))
    .map((h) => ({ level: Number(h.getAttribute('aria-level') ?? h.tagName.slice(1)) || 2, text: accessibleName(h), sel: selectorFor(h), hidden: !isVisible(h) }));
  let prev = 0;
  const hIssues = headings.map((h) => {
    const issues: string[] = [];
    if (!h.text) issues.push('Encabezado vacío');
    if (prev && h.level > prev + 1) issues.push(`Salta del nivel ${prev} al ${h.level}`);
    prev = h.level;
    return { ...h, issues };
  });
  const landmarks = Array.from(document.querySelectorAll(LANDMARK_SEL))
    .filter((e) => !isOurs(e))
    .map((e) => {
      let role = roleOf(e);
      if ((e.tagName === 'HEADER' || e.tagName === 'FOOTER') && e.parentElement?.closest('article, aside, main, nav, section')) role = 'generic';
      return { role, name: e.getAttribute('aria-label') ?? '', tag: e.tagName.toLowerCase(), sel: selectorFor(e) };
    })
    .filter((l) => l.role !== 'generic');
  const lIssues: string[] = [];
  const count = (r: string) => landmarks.filter((l) => l.role === r).length;
  if (!count('main')) lIssues.push('No hay landmark main.');
  if (count('main') > 1) lIssues.push('Hay más de un landmark main.');
  if (count('banner') > 1) lIssues.push('Hay más de un banner (header de página).');
  const navs = landmarks.filter((l) => l.role === 'navigation');
  if (navs.length > 1 && navs.some((n) => !n.name)) lIssues.push('Hay varios nav: dales nombres con aria-label.');
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .filter((a) => !isOurs(a))
    .slice(0, 800)
    .map((a) => {
      const text = accessibleName(a);
      const issues: string[] = [];
      if (!text) issues.push('Enlace sin texto accesible');
      if (/^(click here|here|read more|more|haz clic aquí|aquí|leer más|más|ver más)$/i.test(text)) issues.push('Texto poco descriptivo');
      if (a.target === '_blank' && !/noopener|noreferrer/.test(a.rel)) issues.push('target=_blank sin rel=noopener');
      if (a.getAttribute('href') === '#') issues.push('href="#"');
      return { text, href: a.href, sel: selectorFor(a), external: a.origin !== location.origin, issues };
    });
  const byText = new Map<string, Set<string>>();
  for (const l of links) if (l.text) byText.set(l.text.toLowerCase(), (byText.get(l.text.toLowerCase()) ?? new Set()).add(l.href));
  for (const l of links) if (l.text && (byText.get(l.text.toLowerCase())?.size ?? 0) > 1) l.issues.push('Mismo texto, distinto destino');
  return { headings: hIssues, landmarks, landmarkIssues: lIssues, links };
}

export function images() {
  const list = Array.from(document.querySelectorAll<HTMLElement>('img, input[type=image], [role=img], svg'))
    .filter((e) => !isOurs(e) && !(e.tagName.toLowerCase() === 'svg' && e.closest('[role=img], button, a') && !e.hasAttribute('role')))
    .slice(0, 500);
  return list.map((e) => {
    const issues: string[] = [];
    const tag = e.tagName.toLowerCase();
    const alt = e.getAttribute('alt');
    let src = '';
    let natural: { w: number; h: number } | null = null;
    const r = e.getBoundingClientRect();
    if (e instanceof HTMLImageElement) {
      src = e.currentSrc || e.src;
      natural = { w: e.naturalWidth, h: e.naturalHeight };
      if (alt === null) issues.push('Falta el atributo alt');
      else if (/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(alt.trim())) issues.push('El alt parece un nombre de archivo');
      else if (/^(image|imagen|foto|picture|photo|graphic)( of| de)?\b/i.test(alt.trim())) issues.push('No empieces el alt con "imagen de"');
      else if (alt.length > 150) issues.push('Alt muy largo (> 150 caracteres)');
      if (natural.w && r.width && natural.w > r.width * 2.5 * devicePixelRatio) issues.push(`Imagen sobredimensionada (${natural.w}px para ${Math.round(r.width)}px)`);
      if (!e.hasAttribute('width') || !e.hasAttribute('height')) issues.push('Sin width/height: puede causar CLS');
      if (e.getAttribute('loading') !== 'lazy' && r.top > innerHeight * 2) issues.push('Fuera de pantalla sin loading="lazy"');
    } else if (tag === 'svg') {
      const name = accessibleName(e) || e.querySelector('title')?.textContent;
      if (!name && e.getAttribute('aria-hidden') !== 'true') issues.push('SVG sin nombre ni aria-hidden');
    } else if (!accessibleName(e)) issues.push('Sin nombre accesible');
    return { tag, src, alt, name: accessibleName(e), sel: selectorFor(e), natural, rendered: { w: Math.round(r.width), h: Math.round(r.height) }, visible: isVisible(e), decorative: alt === '' || e.getAttribute('aria-hidden') === 'true', issues };
  });
}

function backgroundOf(e: Element): RGBA | null {
  let color: RGBA = [0, 0, 0, 0];
  for (let n: Element | null = e; n; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
    const bg = parseColor(cs.backgroundColor);
    if (bg && bg[3] > 0) {
      color = blend(color, bg);
      if (color[3] >= 0.99) return color;
    }
  }
  return blend(color, [255, 255, 255, 1]);
}

export function contrastAudit() {
  const items: { sel: string; text: string; fg: string; bg: string; ratio: number; apca: number; large: boolean; aa: boolean; aaa: boolean; suggestion: string | null }[] = [];
  let unknown = 0;
  const walker = document.createTreeWalker(document.body ?? document.documentElement, NodeFilter.SHOW_TEXT);
  const seen = new Set<Element>();
  for (let n = walker.nextNode(); n && items.length < 400; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (!parent || seen.has(parent) || !n.textContent?.trim() || isOurs(parent) || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(parent.tagName)) continue;
    seen.add(parent);
    if (!isVisible(parent)) continue;
    const cs = getComputedStyle(parent);
    const fg = parseColor(cs.color);
    const bg = backgroundOf(parent);
    if (!fg || !bg) {
      unknown++;
      continue;
    }
    const realFg = blend(fg, bg);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    const ratio = contrastRatio(realFg, bg);
    const aa = ratio >= (large ? 3 : 4.5);
    items.push({
      sel: selectorFor(parent),
      text: textOf(parent, 60),
      fg: toHex(realFg),
      bg: toHex(bg),
      ratio,
      apca: apca(realFg, bg),
      large,
      aa,
      aaa: ratio >= (large ? 4.5 : 7),
      suggestion: aa ? null : suggestColor(realFg, bg, large ? 3 : 4.5),
    });
  }
  return { items, unknown };
}

/** Width breakpoints from same-origin stylesheets; cross-origin hrefs are returned for the shell to fetch. */
export function breakpoints() {
  const values: string[] = [];
  const external: string[] = [];
  const walk = (rules: CSSRuleList) => {
    for (const r of Array.from(rules)) {
      if (r instanceof CSSMediaRule) {
        values.push(r.conditionText);
        walk(r.cssRules);
      } else if ('cssRules' in r && (r as CSSGroupingRule).cssRules) walk((r as CSSGroupingRule).cssRules);
    }
  };
  for (const s of Array.from(document.styleSheets)) {
    try {
      walk(s.cssRules);
    } catch {
      if (s.href) external.push(s.href);
    }
  }
  return { media: values, external };
}

export function domChildren(sel?: string) {
  const root = sel ? find(sel) : document.documentElement;
  if (!root) return { children: [] };
  const children = Array.from(root.children)
    .filter((c) => !isOurs(c) && !c.hasAttribute('data-fronttier'))
    .slice(0, 400)
    .map((c) => ({
      sel: selectorFor(c),
      tag: c.tagName.toLowerCase(),
      attrs: Array.from(c.attributes)
        .filter((a) => !a.name.startsWith('data-fronttier'))
        .slice(0, 12)
        .map((a) => [a.name, a.value.slice(0, 200)] as [string, string]),
      text: Array.from(c.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join('')
        .trim()
        .slice(0, 80),
      n: c.children.length,
    }));
  return { children };
}

export function highlight(sel: string, scroll: boolean) {
  const e = find(sel);
  const l = layer('highlight', 'doc');
  l.innerHTML = '';
  if (!e) return false;
  if (scroll) e.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
  const r = docRect(e);
  const box = el('div', 'hl', { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
  const tag = e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  box.appendChild(el('div', 'hl-label', { left: '-2px', top: '-2px' }, `${tag}  ${Math.round(r.w)}×${Math.round(r.h)}`));
  l.appendChild(box);
  setTimeout(() => {
    box.style.opacity = '0';
    setTimeout(() => box.remove(), 400);
  }, 1800);
  return true;
}

export function domEdit(op: { kind: 'attr' | 'removeAttr' | 'text' | 'remove' | 'style'; sel: string; name?: string; value?: string }) {
  const e = find(op.sel) as HTMLElement | null;
  if (!e) return false;
  if (op.kind === 'attr') e.setAttribute(op.name!, op.value ?? '');
  if (op.kind === 'removeAttr') e.removeAttribute(op.name!);
  if (op.kind === 'text') e.textContent = op.value ?? '';
  if (op.kind === 'remove') e.remove();
  if (op.kind === 'style') e.style.cssText = op.value ?? '';
  return true;
}

const SAMPLE = {
  first: 'Ana',
  last: 'García',
  phone: '+52 55 1234 5678',
  street: 'Av. Reforma 123',
  city: 'Ciudad de México',
  state: 'CDMX',
  zip: '06600',
  company: 'Ejemplo S.A. de C.V.',
  url: 'https://example.com',
  text: 'Texto de prueba generado por Fronttier.',
  password: 'Fronttier#Prueba2026',
};

export function fillForms(email: string) {
  let filled = 0;
  const today = new Date().toISOString().slice(0, 10);
  const setValue = (e: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, v: string) => {
    const proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(e, v);
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
    filled++;
  };
  const radios = new Set<string>();
  for (const f of Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select'))) {
    if (f.disabled || (f as HTMLInputElement).readOnly || isOurs(f)) continue;
    const hint = `${f.name} ${f.id} ${f.getAttribute('autocomplete') ?? ''} ${f.getAttribute('placeholder') ?? ''} ${accessibleName(f)}`.toLowerCase();
    if (f instanceof HTMLSelectElement) {
      const opt = Array.from(f.options).find((o) => o.value && !o.disabled);
      if (opt) setValue(f, opt.value);
      continue;
    }
    if (f instanceof HTMLTextAreaElement) {
      setValue(f, SAMPLE.text);
      continue;
    }
    const type = f.type;
    if (['hidden', 'submit', 'button', 'reset', 'image', 'file'].includes(type)) continue;
    if (type === 'checkbox') {
      if (!f.checked && (f.required || /term|accept|acept|agree|privac/.test(hint))) f.click(), filled++;
      continue;
    }
    if (type === 'radio') {
      if (!radios.has(f.name)) {
        radios.add(f.name);
        if (!f.checked) f.click(), filled++;
      }
      continue;
    }
    let v = SAMPLE.text.slice(0, 20);
    if (type === 'email' || /e-?mail|correo/.test(hint)) v = email;
    else if (type === 'password') v = SAMPLE.password;
    else if (type === 'tel' || /phone|tel|móvil|movil|celular/.test(hint)) v = SAMPLE.phone;
    else if (type === 'url' || /url|website|sitio/.test(hint)) v = SAMPLE.url;
    else if (type === 'number' || type === 'range') v = f.min ? f.min : type === 'range' ? String((Number(f.max || 100) + Number(f.min || 0)) / 2) : '42';
    else if (type === 'date') v = today;
    else if (type === 'datetime-local') v = today + 'T10:30';
    else if (type === 'time') v = '10:30';
    else if (type === 'month') v = today.slice(0, 7);
    else if (type === 'week') v = today.slice(0, 4) + '-W10';
    else if (type === 'color') v = '#e7000b';
    else if (/given|first|fname|primer nombre/.test(hint)) v = SAMPLE.first;
    else if (/family|last|apellido|lname|surname/.test(hint)) v = SAMPLE.last;
    else if (/name|nombre/.test(hint)) v = `${SAMPLE.first} ${SAMPLE.last}`;
    else if (/postal|zip|cp\b|código postal/.test(hint)) v = SAMPLE.zip;
    else if (/city|ciudad|locality/.test(hint)) v = SAMPLE.city;
    else if (/state|estado|region|province/.test(hint)) v = SAMPLE.state;
    else if (/address|street|calle|direcci/.test(hint)) v = SAMPLE.street;
    else if (/company|organization|empresa/.test(hint)) v = SAMPLE.company;
    else if (/search|buscar|query|\bq\b/.test(hint)) v = 'fronttier';
    if (f.maxLength > 0) v = v.slice(0, f.maxLength);
    setValue(f, v);
  }
  return filled;
}

export function clearForms() {
  document.querySelectorAll('form').forEach((f) => f.reset());
  for (const f of Array.from(document.querySelectorAll<HTMLInputElement>('input:not([type=hidden]):not([type=submit]):not([type=button]), textarea'))) {
    if (f.type === 'checkbox' || f.type === 'radio') f.checked = false;
    else f.value = '';
    f.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return true;
}

export function storage() {
  const dump = (s: Storage) => {
    const out: [string, string][] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i)!;
      out.push([k, (s.getItem(k) ?? '').slice(0, 2000)]);
    }
    return out;
  };
  try {
    return { local: dump(localStorage), session: dump(sessionStorage), cookie: document.cookie };
  } catch (e: any) {
    return { local: [], session: [], cookie: '', error: String(e.message) };
  }
}

export function storageEdit(op: { area: 'local' | 'session'; action: 'clear' | 'remove' | 'set'; key?: string; value?: string }) {
  const s = op.area === 'local' ? localStorage : sessionStorage;
  if (op.action === 'clear') s.clear();
  if (op.action === 'remove' && op.key) s.removeItem(op.key);
  if (op.action === 'set' && op.key) s.setItem(op.key, op.value ?? '');
  return true;
}

export function selectorAt(x: number, y: number) {
  const e = document.elementFromPoint(x, y);
  return e && !isOurs(e) ? selectorFor(e) : null;
}

export function reloadCSS() {
  const stamp = Date.now();
  document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((l) => {
    const u = new URL(l.href, location.href);
    u.searchParams.set('fronttier-reload', String(stamp));
    const clone = l.cloneNode() as HTMLLinkElement;
    clone.href = u.href;
    clone.onload = () => l.remove();
    l.after(clone);
  });
  return true;
}

/** Main readable text: the element with the most paragraph text. */
export function reader() {
  let best: Element | null = document.querySelector('article, main, [role=main]');
  let bestScore = 0;
  if (!best) {
    for (const e of Array.from(document.querySelectorAll('div, section'))) {
      const score = Array.from(e.querySelectorAll(':scope > p')).reduce((a, p) => a + (p.textContent?.length ?? 0), 0);
      if (score > bestScore) [best, bestScore] = [e, score];
    }
  }
  const root = best ?? document.body;
  const blocks = Array.from(root.querySelectorAll('h1, h2, h3, h4, p, li, blockquote, pre, figcaption'))
    .filter((e) => isVisible(e) && !isOurs(e))
    .map((e) => ({ tag: e.tagName.toLowerCase(), text: textOf(e, 5000) }))
    .filter((b) => b.text);
  const words = blocks.reduce((a, b) => a + b.text.split(/\s+/).length, 0);
  return { title: document.title, blocks, words, minutes: Math.max(1, Math.round(words / 230)) };
}

export function html() {
  return '<!DOCTYPE html>\n' + document.documentElement.outerHTML.replace(/<fronttier-overlay[^>]*><\/fronttier-overlay>/g, '').replace(/<style id="fronttier-style-[^"]*"[^>]*>[\s\S]*?<\/style>/g, '');
}
