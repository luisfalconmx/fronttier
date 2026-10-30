// Built-in screenshot editor: annotate, pixelate, crop, then save or copy.
import { api, h, icon, toast } from './dom';

type Tool = 'pen' | 'marker' | 'rect' | 'arrow' | 'text' | 'pixelate' | 'crop';
type Op =
  | { type: 'pen' | 'marker'; pts: [number, number][]; color: string; width: number }
  | { type: 'rect' | 'arrow' | 'pixelate'; a: [number, number]; b: [number, number]; color: string; width: number }
  | { type: 'text'; at: [number, number]; text: string; color: string; size: number };

const TOOLS: [Tool, string][] = [
  ['pen', 'Lápiz'],
  ['marker', 'Resaltador'],
  ['rect', 'Rectángulo'],
  ['arrow', 'Flecha'],
  ['text', 'Texto'],
  ['pixelate', 'Pixelar'],
  ['crop', 'Recortar'],
];

export function openEditor(dataUrl: string, filename: string) {
  const img = new Image();
  img.onload = () => mount(img, filename);
  img.src = dataUrl;
}

function mount(img: HTMLImageElement, filename: string) {
  const canvas = h('canvas', { class: 'editor-canvas' });
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  const ops: Op[] = [];
  const redo: Op[] = [];
  let tool: Tool = 'arrow';
  let color = '#ef4444';
  let width = Math.max(3, Math.round(img.naturalWidth / 400));
  type Rect = { a: [number, number]; b: [number, number] };
  let crop: Rect | null = null as Rect | null;
  let draft: Op | null = null as Op | null;
  let cropDraft: Rect | null = null as Rect | null;

  const toImage = (e: MouseEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height];
  };

  const drawOp = (op: Op) => {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (op.type === 'pen' || op.type === 'marker') {
      ctx.strokeStyle = op.color;
      ctx.lineWidth = op.type === 'marker' ? op.width * 5 : op.width;
      ctx.globalAlpha = op.type === 'marker' ? 0.35 : 1;
      ctx.beginPath();
      op.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    } else if (op.type === 'rect') {
      ctx.strokeStyle = op.color;
      ctx.lineWidth = op.width;
      ctx.strokeRect(op.a[0], op.a[1], op.b[0] - op.a[0], op.b[1] - op.a[1]);
    } else if (op.type === 'arrow') {
      const [x1, y1] = op.a;
      const [x2, y2] = op.b;
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const head = op.width * 5;
      ctx.strokeStyle = ctx.fillStyle = op.color;
      ctx.lineWidth = op.width;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2 - Math.cos(ang) * head * 0.6, y2 - Math.sin(ang) * head * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(ang - 0.45), y2 - head * Math.sin(ang - 0.45));
      ctx.lineTo(x2 - head * Math.cos(ang + 0.45), y2 - head * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fill();
    } else if (op.type === 'pixelate') {
      const x = Math.round(Math.min(op.a[0], op.b[0]));
      const y = Math.round(Math.min(op.a[1], op.b[1]));
      const w = Math.round(Math.abs(op.b[0] - op.a[0]));
      const hh = Math.round(Math.abs(op.b[1] - op.a[1]));
      if (w > 2 && hh > 2) {
        const block = Math.max(6, Math.round(Math.min(w, hh) / 12));
        const small = document.createElement('canvas');
        small.width = Math.max(1, Math.ceil(w / block));
        small.height = Math.max(1, Math.ceil(hh / block));
        small.getContext('2d')!.drawImage(canvas, x, y, w, hh, 0, 0, small.width, small.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, hh);
      }
    } else if (op.type === 'text') {
      ctx.fillStyle = op.color;
      ctx.font = `600 ${op.size}px system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.lineWidth = Math.max(2, op.size / 8);
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.strokeText(op.text, op.at[0], op.at[1]);
      ctx.fillText(op.text, op.at[0], op.at[1]);
    }
    ctx.restore();
  };

  const render = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    for (const op of ops) drawOp(op);
    if (draft) drawOp(draft);
    const c = cropDraft ?? crop;
    if (c) {
      const x = Math.min(c.a[0], c.b[0]);
      const y = Math.min(c.a[1], c.b[1]);
      const w = Math.abs(c.b[0] - c.a[0]);
      const hh = Math.abs(c.b[1] - c.a[1]);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, canvas.height);
      ctx.rect(x, y, w, hh);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#fff';
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, hh);
      ctx.restore();
    }
  };

  canvas.addEventListener('mousedown', async (e) => {
    const p = toImage(e);
    if (tool === 'text') {
      const text = await askInline();
      if (text) {
        ops.push({ type: 'text', at: p, text, color, size: width * 7 });
        redo.length = 0;
        render();
      }
      return;
    }
    if (tool === 'crop') cropDraft = { a: p, b: p };
    else if (tool === 'pen' || tool === 'marker') draft = { type: tool, pts: [p], color, width };
    else draft = { type: tool, a: p, b: p, color, width };
    const move = (ev: MouseEvent) => {
      const q = toImage(ev);
      if (cropDraft) cropDraft.b = q;
      else if (draft && 'pts' in draft) draft.pts.push(q);
      else if (draft && 'b' in draft) draft.b = q;
      render();
    };
    const up = () => {
      removeEventListener('mousemove', move);
      removeEventListener('mouseup', up);
      if (cropDraft) {
        crop = Math.abs(cropDraft.b[0] - cropDraft.a[0]) > 4 ? cropDraft : null;
        cropDraft = null;
      } else if (draft) {
        ops.push(draft);
        redo.length = 0;
        draft = null;
      }
      render();
    };
    addEventListener('mousemove', move);
    addEventListener('mouseup', up);
  });

  const askInline = () =>
    new Promise<string | null>((resolve) => {
      const input = h('input', { class: 'editor-text', placeholder: 'Texto y Enter' });
      toolbar.appendChild(input);
      input.focus();
      const done = (v: string | null) => (input.remove(), resolve(v));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') done(input.value.trim() || null);
        if (e.key === 'Escape') done(null);
      });
      input.addEventListener('blur', () => done(input.value.trim() || null));
    });

  const output = () => {
    const saved = crop;
    crop = null;
    render();
    let url = canvas.toDataURL('image/png');
    if (saved) {
      const x = Math.min(saved.a[0], saved.b[0]);
      const y = Math.min(saved.a[1], saved.b[1]);
      const w = Math.abs(saved.b[0] - saved.a[0]);
      const hh = Math.abs(saved.b[1] - saved.a[1]);
      const out = document.createElement('canvas');
      out.width = w;
      out.height = hh;
      out.getContext('2d')!.drawImage(canvas, x, y, w, hh, 0, 0, w, hh);
      url = out.toDataURL('image/png');
    }
    crop = saved;
    render();
    return url;
  };

  const close = () => {
    backdrop.remove();
    removeEventListener('keydown', keys, true);
  };
  const keys = (e: KeyboardEvent) => {
    if (document.activeElement?.classList.contains('editor-text')) return;
    if (e.key === 'Escape') close();
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      const op = e.shiftKey ? redo.pop() : ops.pop();
      if (op) (e.shiftKey ? ops : redo).push(op);
      render();
    }
  };
  addEventListener('keydown', keys, true);

  const toolButtons = TOOLS.map(([t, label]) =>
    h('button', { class: 'chip' + (t === tool ? ' on' : ''), 'data-tool': t, onclick: () => ((tool = t), toolButtons.forEach((b) => b.classList.toggle('on', b.dataset.tool === t))) }, label),
  );
  const colorInput = h('input', { type: 'color', value: color, title: 'Color', oninput: () => (color = colorInput.value) });
  const widthInput = h('input', { type: 'range', min: '1', max: '20', value: String(width), title: 'Grosor', oninput: () => (width = Number(widthInput.value)) });
  const toolbar = h(
    'div',
    { class: 'editor-toolbar' },
    toolButtons,
    colorInput,
    widthInput,
    h('button', { class: 'btn', title: 'Deshacer (Ctrl/Cmd+Z)', onclick: () => (ops.length && redo.push(ops.pop()!), render()) }, 'Deshacer'),
    h('button', { class: 'btn', onclick: () => ((crop = null), render()) }, 'Quitar recorte'),
    h('span', { class: 'spacer' }),
    h('span', { class: 'muted small' }, `${img.naturalWidth}×${img.naturalHeight}`),
    h('button', { class: 'btn', onclick: async () => (await api().copyImage(output()), toast('Imagen copiada al portapapeles')) }, icon('copy'), 'Copiar'),
    h('button', { class: 'btn primary', onclick: async () => {
      const path = await api().saveDataURL(output(), filename);
      if (path) toast('Guardado en ' + path), close();
    } }, icon('download'), 'Guardar PNG'),
    h('button', { class: 'icon-btn', title: 'Cerrar', onclick: close }, icon('close')),
  );
  const backdrop = h('div', { class: 'editor' }, toolbar, h('div', { class: 'editor-stage' }, canvas));
  document.body.appendChild(backdrop);
  render();
}
