import { h } from './dom';

export interface Command {
  id: string;
  label: string;
  keys?: string;
  run: () => void;
}

const isMac = navigator.platform.toLowerCase().includes('mac');
const keyLabel = (k: string) => (isMac ? k : k.replace(/⌘/g, 'Ctrl+').replace(/⇧/g, 'Shift+').replace(/⌥/g, 'Alt+'));

function score(label: string, q: string) {
  const l = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const query = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!query) return 1;
  if (l.includes(query)) return 100 - l.indexOf(query);
  let i = 0;
  for (const ch of l) if (ch === query[i]) i++;
  return i === query.length ? 10 : 0;
}

/** Command bar (Ctrl/Cmd+K). With `shortcutsOnly`, lists commands that have a key binding. */
export function openPalette(commands: Command[], shortcutsOnly = false) {
  document.querySelector('.palette-backdrop')?.remove();
  const input = h('input', { class: 'palette-input', placeholder: shortcutsOnly ? 'Atajos de teclado' : 'Escribe un comando…', 'aria-label': 'Comando' });
  const list = h('div', { class: 'palette-list', role: 'listbox' });
  let active = 0;
  let shown: Command[] = [];
  const close = () => backdrop.remove();
  const render = () => {
    const q = input.value;
    shown = commands
      .filter((c) => !shortcutsOnly || c.keys)
      .map((c) => ({ c, s: score(c.label, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 60)
      .map((x) => x.c);
    active = Math.min(active, Math.max(0, shown.length - 1));
    list.replaceChildren(
      ...shown.map((c, i) =>
        h(
          'button',
          { class: 'palette-item' + (i === active ? ' active' : ''), role: 'option', onmouseenter: () => ((active = i), render()), onclick: () => (close(), c.run()) },
          h('span', null, c.label),
          c.keys ? h('kbd', null, keyLabel(c.keys)) : null,
        ),
      ),
    );
    list.children[active]?.scrollIntoView({ block: 'nearest' });
  };
  input.addEventListener('input', () => ((active = 0), render()));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') (active = Math.min(shown.length - 1, active + 1)), render(), e.preventDefault();
    if (e.key === 'ArrowUp') (active = Math.max(0, active - 1)), render(), e.preventDefault();
    if (e.key === 'Enter' && shown[active]) close(), shown[active].run();
    if (e.key === 'Escape') close();
  });
  const backdrop = h('div', { class: 'palette-backdrop', onmousedown: (e: MouseEvent) => e.target === backdrop && close() }, h('div', { class: 'palette' }, input, list));
  document.body.appendChild(backdrop);
  render();
  input.focus();
}
