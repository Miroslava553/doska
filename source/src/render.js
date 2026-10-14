// Геометрия и рисование объектов доски.
import { getStroke } from 'perfect-freehand';
import { compileMany } from './expr.js';
import { figSegments, drawFig, FIGS, figPrims } from './figs.js';

export const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
export const GRID = 40; // клетка в мировых единицах

// ---------- штрихи ----------
export function decodePts(it) {
  if (it._pts) return it._pts;
  const a = it.pts || [];
  const out = [];
  for (let i = 0; i + 2 < a.length; i += 3) out.push([a[i] / 10, a[i + 1] / 10, a[i + 2] / 100]);
  it._pts = out;
  return out;
}
export function encodePts(pts) {
  const a = new Array(pts.length * 3);
  for (let i = 0; i < pts.length; i++) {
    a[i * 3] = Math.round(pts[i][0] * 10);
    a[i * 3 + 1] = Math.round(pts[i][1] * 10);
    a[i * 3 + 2] = Math.round(Math.max(0, Math.min(1, pts[i][2])) * 100);
  }
  return a;
}
export function strokeOptions(it, last = true) {
  const hl = it.kind === 'hl';
  return {
    size: it.size,
    thinning: hl ? 0 : (it.thin ?? 0.5),
    // v2 — точки уже сглажены и уложены на кривую (ink.js): повторное «подтягивание» только срезает углы
    smoothing: it.v === 2 ? 0.35 : 0.5,
    streamline: it.v === 2 ? 0 : (hl ? 0.3 : 0.2),
    simulatePressure: false,
    easing: (t) => t,
    start: { taper: 0, cap: true },
    end: { taper: 0, cap: true },
    last,
  };
}
export function outlinePath(points, opts) {
  const o = getStroke(points, opts);
  const p = new Path2D();
  if (!o.length) return p;
  p.moveTo(o[0][0], o[0][1]);
  for (let i = 1; i < o.length; i++) {
    const [x0, y0] = o[i]; const [x1, y1] = o[(i + 1) % o.length];
    p.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  p.closePath();
  return p;
}
// Пунктирная ручка: средняя линия без нажима, сглаженная, рисуется штрихами
function smooth(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) out.push([(pts[i - 1][0] + 2 * pts[i][0] + pts[i + 1][0]) / 4, (pts[i - 1][1] + 2 * pts[i][1] + pts[i + 1][1]) / 4]);
  out.push(pts[pts.length - 1]);
  return out;
}
export function centerPath(pts, raw = false) {
  const p = new Path2D(); const q = raw ? pts : smooth(pts);
  if (raw) { if (!q.length) return p; p.moveTo(q[0][0], q[0][1]); if (q.length === 1) p.lineTo(q[0][0] + 0.01, q[0][1]); for (let i = 1; i < q.length; i++) p.lineTo(q[i][0], q[i][1]); return p; }
  if (!q.length) return p;
  p.moveTo(q[0][0], q[0][1]);
  if (q.length === 1) { p.lineTo(q[0][0] + 0.01, q[0][1]); return p; }
  for (let i = 1; i < q.length - 1; i++) p.quadraticCurveTo(q[i][0], q[i][1], (q[i][0] + q[i + 1][0]) / 2, (q[i][1] + q[i + 1][1]) / 2);
  p.lineTo(q[q.length - 1][0], q[q.length - 1][1]);
  return p;
}
// Единая отрисовка «чернил» (перо, маркер, пунктир) — для готовых, живых и чужих штрихов
export function paintInk(ctx, it, pts, last = true) {
  if (it.kind === 'dash') {
    ctx.save();
    ctx.strokeStyle = it.color; ctx.lineWidth = it.size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.setLineDash([it.size * 1.8, it.size * 2.6]); ctx.lineDashOffset = it.doff || 0; // кусок после ластика продолжает рисунок пунктира
    ctx.stroke(centerPath(pts, it.v === 2));
    ctx.restore();
  } else {
    ctx.fillStyle = it.color;
    ctx.fill(outlinePath(pts, strokeOptions(it, last)));
  }
}
export function strokePath(it) {
  if (!it._path) it._path = outlinePath(decodePts(it), strokeOptions(it, true));
  return it._path;
}

// ---------- формулы (MathJax → SVG → картинка) ----------
const texCache = new Map();
export let onAsyncLoad = () => {};
export function setAsyncLoad(f) { onAsyncLoad = f; }
export function texImage(tex, color, fs) {
  const key = tex + '\u0000' + color + '\u0000' + fs;
  let c = texCache.get(key);
  if (c) return c;
  c = { img: null, w: 0, h: 0, err: null };
  texCache.set(key, c);
  try {
    if (!window.MathJax?.tex2svg) throw new Error('MathJax не загрузился');
    const node = window.MathJax.tex2svg(tex, { display: true });
    const svg = node.querySelector('svg');
    const err = svg.querySelector('[data-mjx-error]');
    if (err) c.err = err.getAttribute('data-mjx-error');
    const ex = fs * 0.45;
    const w = parseFloat(svg.getAttribute('width')) * ex;
    const h = parseFloat(svg.getAttribute('height')) * ex;
    svg.setAttribute('width', w); svg.setAttribute('height', h);
    svg.setAttribute('style', 'color:' + color);
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.outerHTML.replace(/currentColor/g, color));
    c.w = w; c.h = h;
    const img = new Image();
    img.onload = () => { c.img = img; onAsyncLoad(); };
    img.src = src;
  } catch (e) { c.err = String(e.message || e); c.w = 200; c.h = fs * 1.4; }
  return c;
}

// ---------- картинки ----------
const imgCache = new Map();
export function getImage(src) {
  let c = imgCache.get(src);
  if (!c) {
    c = { img: new Image(), ok: false };
    c.img.onload = () => { c.ok = true; onAsyncLoad(); };
    c.img.src = src;
    imgCache.set(src, c);
  }
  return c.ok ? c.img : null;
}

// ---------- текст ----------
const mctx = document.createElement('canvas').getContext('2d');
export function textLines(it) {
  return String(it.text || '').split('\n');
}
export function measureText(it) {
  if (it._tm) return it._tm;
  mctx.font = `${it.fs}px ${FONT}`;
  const lines = textLines(it);
  let w = 0; for (const l of lines) w = Math.max(w, mctx.measureText(l || ' ').width);
  it._tm = { w: Math.max(w, it.fs * 0.5), h: lines.length * it.fs * 1.25 };
  return it._tm;
}
function wrap(text, maxW, font) {
  mctx.font = font;
  const out = [];
  for (const para of String(text || '').split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (mctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}

// ---------- рамки ----------
export function localBox(it) {
  if (it._lb) return it._lb;
  let b;
  switch (it.type) {
    case 'stroke': {
      const p = decodePts(it); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of p) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
      const r = it.size / 2 + 1; b = [x0 - r, y0 - r, x1 + r, y1 + r]; break;
    }
    case 'line': case 'arrow': {
      const r = it.size * (it.type === 'arrow' ? 4 : 1) + 2;
      b = [Math.min(it.x1, it.x2) - r, Math.min(it.y1, it.y2) - r, Math.max(it.x1, it.x2) + r, Math.max(it.y1, it.y2) + r]; break;
    }
    case 'rect': case 'ellipse': { const r = it.size / 2 + 1; b = [-r, -r, it.w + r, it.h + r]; break; }
    case 'fig': { const r = it.size / 2 + 2; b = [-r, -r, it.w + r, it.h + r]; break; }
    case 'poly': {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of it.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const r = it.size / 2 + 2; b = [x0 - r, y0 - r, x1 + r, y1 + r]; break;
    }
    case 'text': { const m = measureText(it); b = [0, 0, m.w, m.h]; break; }
    case 'tex': { const c = texImage(it.tex, it.color, it.fs); b = [0, 0, c.w || 100, c.h || 40]; break; }
    default: b = [0, 0, it.w || 100, it.h || 100];
  }
  it._lb = b;
  return b;
}
export function worldBox(it, ov) {
  const [a, b, c, d] = localBox(it);
  const t = itemTransform(it, ov);
  return [t.x + a * t.sx, t.y + b * t.sy, t.x + c * t.sx, t.y + d * t.sy];
}
// Рамка самой геометрии (без запаса на толщину линии) — от неё считаем масштаб, чтобы не было «дрейфа»
export function geomWorldBox(it) {
  let b;
  const mm = (pts) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; };
  if (it.type === 'stroke') b = mm(decodePts(it));
  else if (it.type === 'poly') b = mm(it.pts);
  else if (it.type === 'line' || it.type === 'arrow') b = mm([[it.x1, it.y1], [it.x2, it.y2]]);
  else b = localBox(it).slice();
  if (it.type === 'rect' || it.type === 'ellipse' || it.type === 'fig') b = [0, 0, it.w, it.h];
  const s = it.s || 1;
  return [it.x + b[0] * s, it.y + b[1] * s, it.x + b[2] * s, it.y + b[3] * s];
}
// Текст и формулы при растяжении по одной оси не искажаем — только сдвигаем.
export const NO_STRETCH = new Set(['text', 'tex']);
// Учитывает «предпросмотр» перемещения/масштаба (ov) ещё до записи в документ.
export function itemTransform(it, ov) {
  let x = it.x || 0, y = it.y || 0, s = it.s || 1, sx = s, sy = s;
  if (ov && ov.ids && ov.ids.has(it.id)) {
    const kx = ov.k || ov.kx || 1, ky = ov.k || ov.ky || 1;
    if (kx !== 1 || ky !== 1) {
      x = ov.ax + (x - ov.ax) * kx; y = ov.ay + (y - ov.ay) * ky;
      if (ov.k) { s *= ov.k; sx = sy = s; }
      else if (!NO_STRETCH.has(it.type)) { sx = s * kx; sy = s * ky; }
    }
    x += ov.dx || 0; y += ov.dy || 0;
  }
  return { x, y, s, sx, sy };
}

// ---------- попадание ----------
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay; const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx - px, qy = ay + t * dy - py; return Math.sqrt(qx * qx + qy * qy);
}
export { distSeg };
export function hitItem(it, wx, wy, tol) {
  const s = it.s || 1; const px = (wx - (it.x || 0)) / s, py = (wy - (it.y || 0)) / s; const t = tol / s;
  const [a, b, c, d] = localBox(it);
  if (px < a - t || py < b - t || px > c + t || py > d + t) return false;
  switch (it.type) {
    case 'stroke': {
      const p = decodePts(it); const r = t + it.size / 2;
      if (p.length === 1) return Math.hypot(px - p[0][0], py - p[0][1]) <= r;
      for (let i = 1; i < p.length; i++) if (distSeg(px, py, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]) <= r) return true;
      return false;
    }
    case 'line': case 'arrow': return distSeg(px, py, it.x1, it.y1, it.x2, it.y2) <= t + it.size / 2 + 2;
    case 'fig': {
      if (!it._segs) it._segs = figSegments(it);
      const r = t + it.size / 2 + 2;
      return it._segs.some((q) => distSeg(px, py, q[0], q[1], q[2], q[3]) <= r);
    }
    case 'poly': {
      const p = it.pts; const r = t + it.size / 2 + 2; const n = p.length;
      for (let i = 1; i < n + (it.closed ? 1 : 0); i++) { const a = p[i - 1], c = p[i % n]; if (distSeg(px, py, a[0], a[1], c[0], c[1]) <= r) return true; }
      return false;
    }
    case 'rect': {
      if (it.fill) return true;
      const r = t + it.size / 2 + 2;
      return distSeg(px, py, 0, 0, it.w, 0) <= r || distSeg(px, py, it.w, 0, it.w, it.h) <= r ||
        distSeg(px, py, it.w, it.h, 0, it.h) <= r || distSeg(px, py, 0, it.h, 0, 0) <= r;
    }
    case 'ellipse': {
      const rx = it.w / 2, ry = it.h / 2; const nx = (px - rx) / (rx || 1), ny = (py - ry) / (ry || 1);
      const k = Math.sqrt(nx * nx + ny * ny);
      if (it.fill && k <= 1) return true;
      return Math.abs(k - 1) * Math.min(rx, ry) <= t + it.size / 2 + 2;
    }
    default: return true; // текст, формулы, картинки, графики, стикеры — по рамке
  }
}

// ---------- рисование ----------
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw))); const f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}
function fmt(v) { const r = Math.round(v * 1e6) / 1e6; return String(r).replace('.', ','); }
const GRAPH_COLORS = ['#1971c2', '#e03131', '#2f9e44', '#9c36b5', '#f08c00', '#0c8599'];
const graphFnCache = new Map();
function graphFns(expr) {
  let c = graphFnCache.get(expr);
  if (!c) { try { c = { fns: compileMany(expr) }; } catch (e) { c = { err: e.message }; } graphFnCache.set(expr, c); }
  return c;
}

function drawGraph(ctx, it, scale) {
  const { w, h } = it; const { xmin, xmax, ymin, ymax } = it;
  const X = (v) => ((v - xmin) / (xmax - xmin)) * w;
  const Y = (v) => h - ((v - ymin) / (ymax - ymin)) * h;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  const sx = niceStep((xmax - xmin) / Math.max(2, w / 70)), sy = niceStep((ymax - ymin) / Math.max(2, h / 70));
  ctx.lineWidth = 1 / scale; ctx.strokeStyle = '#e3e8ef'; ctx.beginPath();
  for (let v = Math.ceil(xmin / sx) * sx; v <= xmax; v += sx) { ctx.moveTo(X(v), 0); ctx.lineTo(X(v), h); }
  for (let v = Math.ceil(ymin / sy) * sy; v <= ymax; v += sy) { ctx.moveTo(0, Y(v)); ctx.lineTo(w, Y(v)); }
  ctx.stroke();
  // оси
  const ax = Math.max(0, Math.min(h, Y(0))), ay = Math.max(0, Math.min(w, X(0)));
  ctx.strokeStyle = '#495057'; ctx.lineWidth = 1.5 / scale; ctx.beginPath();
  ctx.moveTo(0, ax); ctx.lineTo(w, ax); ctx.moveTo(ay, 0); ctx.lineTo(ay, h); ctx.stroke();
  ctx.fillStyle = '#495057';
  ctx.beginPath(); ctx.moveTo(w, ax); ctx.lineTo(w - 9, ax - 4); ctx.lineTo(w - 9, ax + 4); ctx.fill();
  ctx.beginPath(); ctx.moveTo(ay, 0); ctx.lineTo(ay - 4, 9); ctx.lineTo(ay + 4, 9); ctx.fill();
  ctx.font = `12px ${FONT}`; ctx.fillStyle = '#6c757d';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let v = Math.ceil(xmin / sx) * sx; v <= xmax; v += sx) if (Math.abs(v) > sx / 2 && X(v) > 12 && X(v) < w - 16) ctx.fillText(fmt(v), X(v), Math.min(h - 14, ax + 3));
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let v = Math.ceil(ymin / sy) * sy; v <= ymax; v += sy) if (Math.abs(v) > sy / 2 && Y(v) > 12 && Y(v) < h - 10) ctx.fillText(fmt(v), Math.max(24, ay - 4), Y(v));
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = `italic 13px ${FONT}`; ctx.fillStyle = '#495057';
  ctx.fillText('x', w - 12, ax - 8); ctx.fillText('y', ay + 7, 12);
  // кривые
  const g = graphFns(it.expr || '');
  if (g.err) {
    ctx.fillStyle = '#e03131'; ctx.font = `14px ${FONT}`; ctx.fillText('Ошибка: ' + g.err, 8, h - 10);
  } else {
    const n = Math.max(200, Math.min(2500, Math.round(w * scale)));
    g.fns.forEach((f, k) => {
      ctx.strokeStyle = k === 0 && it.color && it.color !== '#1e1e1e' ? it.color : GRAPH_COLORS[k % GRAPH_COLORS.length];
      ctx.lineWidth = 2.5 / Math.sqrt(scale) ; ctx.lineJoin = 'round'; ctx.beginPath();
      let pen = false, prevY = 0;
      for (let i = 0; i <= n; i++) {
        const xv = xmin + ((xmax - xmin) * i) / n; let yv;
        try { yv = f.fn(xv); } catch { yv = NaN; }
        const py = Y(yv);
        if (!Number.isFinite(py) || Math.abs(py) > h * 50) { pen = false; continue; }
        if (pen && Math.abs(py - prevY) > h * 2) pen = false; // разрыв (tg x, 1/x)
        if (pen) ctx.lineTo(X(xv), py); else ctx.moveTo(X(xv), py);
        pen = true; prevY = py;
      }
      ctx.stroke();
    });
    ctx.font = `14px ${FONT}`;
    g.fns.forEach((f, k) => {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const label = 'y = ' + f.src.replace(/^\s*y\s*=\s*/i, '');
      const tw = ctx.measureText(label).width;
      ctx.fillRect(6, 6 + k * 20, tw + 8, 19);
      ctx.fillStyle = k === 0 && it.color && it.color !== '#1e1e1e' ? it.color : GRAPH_COLORS[k % GRAPH_COLORS.length];
      ctx.fillText(label, 10, 21 + k * 20);
    });
  }
  ctx.restore();
  ctx.strokeStyle = '#ced4da'; ctx.lineWidth = 1 / scale; ctx.strokeRect(0, 0, w, h);
}

function arrowHead(ctx, x1, y1, x2, y2, size) {
  const a = Math.atan2(y2 - y1, x2 - x1); const L = Math.max(10, size * 4);
  ctx.beginPath();
  ctx.moveTo(x2 - L * Math.cos(a - 0.45), y2 - L * Math.sin(a - 0.45));
  ctx.lineTo(x2, y2);
  ctx.lineTo(x2 - L * Math.cos(a + 0.45), y2 - L * Math.sin(a + 0.45));
  ctx.stroke();
}

// Фигура как набор ломаных (локальные координаты) — точный ластик режет их как обычные линии
export function shapePolys(it) {
  const P = [], T = [];
  const add = (pts, dash, w) => P.push({ pts: pts.map(([x, y]) => [x, y, 1]), dash: dash || false, w: w ?? it.size });
  const ell = (cx, cy, rx, ry, a0, a1) => { const n = Math.max(24, Math.ceil(Math.abs(a1 - a0) / (Math.PI * 2) * 96)); const o = []; for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; o.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); } return o; };
  const head = (x1, y1, x2, y2, L, k) => { const a = Math.atan2(y2 - y1, x2 - x1); return [[x2 - L * Math.cos(a - k), y2 - L * Math.sin(a - k)], [x2, y2], [x2 - L * Math.cos(a + k), y2 - L * Math.sin(a + k)]]; };
  if (it.type === 'line' || it.type === 'arrow') {
    add([[it.x1, it.y1], [it.x2, it.y2]], it.dash);
    if (it.type === 'arrow') add(head(it.x1, it.y1, it.x2, it.y2, Math.max(10, it.size * 4), 0.45), false);
  } else if (it.type === 'rect') add([[0, 0], [it.w, 0], [it.w, it.h], [0, it.h], [0, 0]], it.dash);
  else if (it.type === 'ellipse') {
    add(ell(it.w / 2, it.h / 2, Math.abs(it.w / 2), Math.abs(it.h / 2), 0, Math.PI * 2), it.dash);
    if (it.center) add([[it.w / 2, it.h / 2], [it.w / 2, it.h / 2]], false, 2 * Math.max(2, it.size));
  } else if (it.type === 'poly') add(it.closed ? [...it.pts, it.pts[0]] : it.pts, it.dash);
  else if (it.type === 'fig') {
    const f = FIGS[it.kind]; const { w, h } = it; if (!f) return { polys: P, texts: T };
    for (const p of figPrims(it)) {
      if (p.t === 'l' || p.t === 'ar') {
        const [x1, y1, x2, y2] = [p.a[0] * w, p.a[1] * h, p.a[2] * w, p.a[3] * h];
        add([[x1, y1], [x2, y2]], p.d && 'fig');
        if (p.t === 'ar') add(head(x1, y1, x2, y2, Math.max(10, it.size * 4), 0.4), false);
      } else if (p.t === 'e') { const [cx, cy, rx, ry, a0, a1] = p.a; add(ell(cx * w, cy * h, Math.abs(rx * w), Math.abs(ry * h), a0, a1), p.d && 'fig'); }
      else if (p.t === 'txt') T.push({ x: p.a[0] * w, y: p.a[1] * h, s: p.s, fs: Math.max(12, Math.min(w, h) * 0.07) });
    }
    if (f.right) { const m = Math.min(w, h) * 0.1; add([[0, h - m], [m, h - m], [m, h]], false, Math.max(1, it.size * 0.7)); }
  }
  return { polys: P, texts: T };
}
export const ERASABLE_SHAPES = new Set(['line', 'arrow', 'rect', 'ellipse', 'poly', 'fig']);
function drawPieces(ctx, it, pieces) {
  for (const pc of pieces) {
    if (pc.text) { ctx.font = `italic ${pc.fs}px "Times New Roman", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(pc.s, pc.x, pc.y); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; continue; }
    ctx.lineWidth = pc.w; ctx.setLineDash(pc.dash === 'fig' ? [Math.max(4, pc.w * 3), Math.max(3, pc.w * 2.5)] : pc.dash ? [pc.w * 3, pc.w * 2.5] : []);
    ctx.lineDashOffset = pc.dash ? pc.pts[0][3] || 0 : 0;
    ctx.beginPath(); pc.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  }
  ctx.setLineDash([]);
}

// ctx уже в мировых координатах. scale — пикселей экрана на единицу мира (для детализации).
export function drawItem(ctx, it, ov, scale, pieces) {
  const t = itemTransform(it, ov);
  ctx.save();
  ctx.translate(t.x, t.y); ctx.scale(t.sx, t.sy);
  const sc = scale * t.s;
  ctx.strokeStyle = it.color; ctx.fillStyle = it.color;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (pieces && it.type !== 'stroke') { drawPieces(ctx, it, pieces); ctx.restore(); return; }
  switch (it.type) {
    case 'stroke': {
      if (it.kind === 'hl') { ctx.globalAlpha = 0.38; }
      if (it.kind === 'dash') { for (const p of pieces || [decodePts(it)]) paintInk(ctx, pieces && p[0] && p[0][3] != null ? { ...it, doff: p[0][3] } : it, p); break; }
      if (pieces) for (const p of pieces) ctx.fill(outlinePath(p, strokeOptions(it, true)));
      else ctx.fill(strokePath(it));
      break;
    }
    case 'line': case 'arrow': {
      ctx.lineWidth = it.size; if (it.dash) ctx.setLineDash([it.size * 3, it.size * 2.5]);
      ctx.beginPath(); ctx.moveTo(it.x1, it.y1); ctx.lineTo(it.x2, it.y2); ctx.stroke();
      ctx.setLineDash([]);
      if (it.type === 'arrow') arrowHead(ctx, it.x1, it.y1, it.x2, it.y2, it.size);
      break;
    }
    case 'rect': case 'ellipse': {
      ctx.lineWidth = it.size; if (it.dash) ctx.setLineDash([it.size * 3, it.size * 2.5]);
      ctx.beginPath();
      if (it.type === 'rect') ctx.rect(0, 0, it.w, it.h);
      else ctx.ellipse(it.w / 2, it.h / 2, Math.abs(it.w / 2), Math.abs(it.h / 2), 0, 0, Math.PI * 2);
      if (it.fill) { ctx.globalAlpha = 0.22; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.stroke(); ctx.setLineDash([]);
      if (it.center) { ctx.beginPath(); ctx.arc(it.w / 2, it.h / 2, Math.max(2, it.size), 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'fig': drawFig(ctx, it); break;
    case 'poly': {
      ctx.lineWidth = it.size; if (it.dash) { ctx.setLineDash(it.dfig ? [Math.max(4, it.size * 3), Math.max(3, it.size * 2.5)] : [it.size * 3, it.size * 2.5]); ctx.lineDashOffset = it.doff || 0; }
      ctx.beginPath(); it.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); if (it.closed) ctx.closePath();
      if (it.fill && it.closed) { ctx.globalAlpha = 0.22; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.stroke(); ctx.setLineDash([]);
      break;
    }
    case 'text': {
      ctx.font = `${it.fs}px ${FONT}`; ctx.textBaseline = 'top';
      textLines(it).forEach((l, i) => ctx.fillText(l, 0, i * it.fs * 1.25 + it.fs * 0.1));
      break;
    }
    case 'tex': {
      const c = texImage(it.tex, it.color, it.fs);
      if (c.img) ctx.drawImage(c.img, 0, 0, c.w, c.h);
      if (c.err) { ctx.fillStyle = '#e03131'; ctx.font = `14px ${FONT}`; ctx.fillText('⚠ ' + c.err, 0, (c.h || 40) + 16); }
      break;
    }
    case 'graph': drawGraph(ctx, it, sc); break;
    case 'image': {
      const img = getImage(it.src);
      if (img) ctx.drawImage(img, 0, 0, it.w, it.h);
      else { ctx.fillStyle = '#f1f3f5'; ctx.fillRect(0, 0, it.w, it.h); }
      break;
    }
    case 'note': {
      ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
      ctx.fillStyle = it.bg || '#fff3bf'; ctx.fillRect(0, 0, it.w, it.h);
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#212529'; const fs = it.fs || 20; const font = `${fs}px ${FONT}`; ctx.font = font; ctx.textBaseline = 'top';
      wrap(it.text, it.w - 24, font).forEach((l, i) => { if ((i + 1) * fs * 1.3 < it.h - 8) ctx.fillText(l, 12, 12 + i * fs * 1.3); });
      break;
    }
  }
  ctx.restore();
}

export function drawBackground(ctx, bg, view, w, h) {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  if (bg === 'plain') return;
  const step = GRID * view.z;
  if (step < 7) return;
  const alpha = Math.min(1, (step - 7) / 10);
  const ox = ((view.x % step) + step) % step, oy = ((view.y % step) + step) % step;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (bg === 'dots') {
    ctx.fillStyle = '#b8c2cf';
    const r = Math.max(1, Math.min(2, step / 25));
    for (let x = ox; x < w; x += step) for (let y = oy; y < h; y += step) ctx.fillRect(x - r / 2, y - r / 2, r, r);
  } else {
    ctx.strokeStyle = bg === 'lines' ? '#c9d6e8' : '#dbe4f0'; ctx.lineWidth = 1; ctx.beginPath();
    if (bg === 'grid') for (let x = ox; x < w; x += step) { const px = Math.round(x) + 0.5; ctx.moveTo(px, 0); ctx.lineTo(px, h); }
    for (let y = oy; y < h; y += step) { const py = Math.round(y) + 0.5; ctx.moveTo(0, py); ctx.lineTo(w, py); }
    ctx.stroke();
  }
  ctx.restore();
}
