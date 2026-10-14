import { SOLID_KINDS, solidView, drawSolid, solidAspect } from './solid.js';
// Готовые фигуры в единичном квадрате [0..1]×[0..1] (y вниз). d — пунктир (невидимое ребро).
const L = (x1, y1, x2, y2, d = false) => ({ t: 'l', a: [x1, y1, x2, y2], d });
const E = (cx, cy, rx, ry, a0 = 0, a1 = Math.PI * 2, d = false) => ({ t: 'e', a: [cx, cy, rx, ry, a0, a1], d });
const AR = (x1, y1, x2, y2) => ({ t: 'ar', a: [x1, y1, x2, y2] });
const T = (x, y, s) => ({ t: 'txt', a: [x, y], s });
function regular(n) {
  const p = []; for (let k = 0; k < n; k++) { const a = -Math.PI / 2 + (k * 2 * Math.PI) / n; p.push([Math.cos(a), Math.sin(a)]); }
  const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]); const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return p.map(([x, y]) => [(x - x0) / (x1 - x0), (y - y0) / (y1 - y0)]);
}
function regularAspect(n) { const p = []; for (let k = 0; k < n; k++) { const a = -Math.PI / 2 + (k * 2 * Math.PI) / n; p.push([Math.cos(a), Math.sin(a)]); } const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]); return (Math.max(...ys) - Math.min(...ys)) / (Math.max(...xs) - Math.min(...xs)); }
const poly = (pts, hidden = []) => pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return L(p[0], p[1], q[0], q[1], hidden.includes(i)); });

const DEG = Math.PI / 180;
// angle — ползунок угла в панели фигуры. get(it) → градусы; set(it, deg) → какие поля поменять.
// Для треугольников и ромба угол задаётся пропорцией рамки, у параллелограмма и трапеции — полем ang.
const bottomH = (it, h) => ({ h, y: it.y + (it.h - h) * (it.s || 1) }); // нижняя сторона остаётся на месте
const centerH = (it, h) => ({ h, y: it.y + ((it.h - h) / 2) * (it.s || 1) });
const capH = (it, h) => Math.max(4, Math.min(it.w * 20, h));
const parOff = (it) => (it.ang == null ? 0.28 * it.w : it.h / Math.tan(it.ang * DEG)); // сдвиг верхней стороны
export const FIGS = {
  // ---- планиметрия ----
  triangle: { name: 'Равнобедренный треугольник', g: 'plane', prims: poly([[0.5, 0], [1, 1], [0, 1]]),
    angle: { label: 'Угол при вершине', min: 10, max: 170, get: (it) => 2 * Math.atan(it.w / 2 / it.h) / DEG, set: (it, d) => bottomH(it, capH(it, it.w / 2 / Math.tan((d * DEG) / 2))) } },
  eqtriangle: { name: 'Равносторонний треугольник', g: 'plane', aspect: Math.sqrt(3) / 2, prims: poly([[0.5, 0], [1, 1], [0, 1]]) },
  rtriangle: { name: 'Прямоугольный треугольник', g: 'plane', prims: poly([[0, 0], [1, 1], [0, 1]]), right: true,
    angle: { label: 'Острый угол', min: 5, max: 85, get: (it) => Math.atan(it.h / it.w) / DEG, set: (it, d) => bottomH(it, capH(it, it.w * Math.tan(d * DEG))) } },
  square: { name: 'Квадрат', g: 'plane', aspect: 1, prims: poly([[0, 0], [1, 0], [1, 1], [0, 1]]) },
  parallelogram: { name: 'Параллелограмм', g: 'plane', prims: poly([[0.28, 0], [1, 0], [0.72, 1], [0, 1]]),
    make: (it) => { if (it.ang == null) return null; const d = Math.min(0.95, parOff(it) / it.w); return poly([[d, 0], [1, 0], [1 - d, 1], [0, 1]]); },
    // нижняя сторона сохраняет длину, рамка расширяется под наклон
    angle: { label: 'Острый угол', min: 10, max: 90, get: (it) => Math.atan2(it.h, parOff(it)) / DEG,
      set: (it, d) => { const base = it.w - parOff(it); const off = it.h / Math.tan(d * DEG); return { ang: d, w: Math.max(4, base + off) }; } } },
  trapezoid: { name: 'Трапеция', g: 'plane', prims: poly([[0.25, 0], [0.75, 0], [1, 1], [0, 1]]),
    make: (it) => { if (it.ang == null) return null; const d = Math.min(0.48, it.h / Math.tan(it.ang * DEG) / it.w); return poly([[d, 0], [1 - d, 0], [1, 1], [0, 1]]); },
    // нижнее основание не меняется; если верхнее «схлопывается» — трапеция становится ниже
    angle: { label: 'Угол при основании', min: 10, max: 90, get: (it) => Math.atan2(it.h, it.w * (it.ang == null ? 0.25 : Math.min(0.48, it.h / Math.tan(it.ang * DEG) / it.w))) / DEG,
      set: (it, d) => { const t = Math.tan(d * DEG); const hMax = 0.48 * it.w * t; return it.h > hMax ? { ang: d, ...bottomH(it, Math.max(4, hMax)) } : { ang: d }; } } },
  rhombus: { name: 'Ромб', g: 'plane', prims: poly([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]),
    angle: { label: 'Угол ромба', min: 10, max: 170, get: (it) => 2 * Math.atan(it.h / it.w) / DEG, set: (it, d) => centerH(it, capH(it, it.w * Math.tan((d * DEG) / 2))) } },
  pentagon: { name: 'Правильный пятиугольник', g: 'plane', aspect: regularAspect(5), prims: poly(regular(5)) },
  hexagon: { name: 'Правильный шестиугольник', g: 'plane', aspect: Math.sqrt(3) / 2, prims: poly([[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]]) },
  inscribed: { name: 'Вписанная окружность', g: 'plane', aspect: Math.sqrt(3) / 2, prims: [...poly([[0.5, 0], [1, 0.866], [0, 0.866]]), E(0.5, 0.577, 0.289, 0.289)] },
  circumscribed: { name: 'Описанная окружность', g: 'plane', aspect: 1, prims: [...poly([[0.5, 0], [0.933, 0.75], [0.067, 0.75]]), E(0.5, 0.5, 0.5, 0.5)] },
  axes: { name: 'Оси координат', g: 'plane', prims: [AR(0, 0.5, 1, 0.5), AR(0.5, 1, 0.5, 0), T(0.97, 0.56, 'x'), T(0.53, 0.04, 'y'), T(0.46, 0.56, 'O')] },
  // ---- стереометрия (косоугольная проекция, невидимые рёбра пунктиром) ----
  cube: { name: 'Куб / параллелепипед', g: 'solid', prims: [
    L(0, 0.35, 0.65, 0.35), L(0.65, 0.35, 0.65, 1), L(0.65, 1, 0, 1), L(0, 1, 0, 0.35),
    L(0.35, 0, 1, 0), L(1, 0, 1, 0.65), L(0.35, 0.65, 1, 0.65, true), L(0.35, 0, 0.35, 0.65, true),
    L(0, 0.35, 0.35, 0), L(0.65, 0.35, 1, 0), L(0.65, 1, 1, 0.65), L(0, 1, 0.35, 0.65, true)] },
  tetra: { name: 'Треугольная пирамида', g: 'solid', prims: [
    L(0.45, 0, 0, 0.8), L(0.45, 0, 0.6, 1), L(0.45, 0, 1, 0.75), L(0, 0.8, 0.6, 1), L(0.6, 1, 1, 0.75), L(0, 0.8, 1, 0.75, true)] },
  pyramid: { name: 'Четырёхугольная пирамида', g: 'solid', prims: [
    L(0, 1, 0.7, 1), L(0.7, 1, 1, 0.72), L(1, 0.72, 0.3, 0.72, true), L(0.3, 0.72, 0, 1, true),
    L(0.5, 0, 0, 1), L(0.5, 0, 0.7, 1), L(0.5, 0, 1, 0.72), L(0.5, 0, 0.3, 0.72, true)] },
  rpyramid: { name: 'Прямоугольная пирамида (ребро ⟂ основанию)', g: 'solid', right: true, prims: [
    L(0, 1, 0.7, 1), L(0.7, 1, 1, 0.72), L(1, 0.72, 0.3, 0.72, true), L(0.3, 0.72, 0, 1, true),
    L(0, 0, 0, 1), L(0, 0, 0.7, 1), L(0, 0, 1, 0.72), L(0, 0, 0.3, 0.72, true)] },
  prism: { name: 'Треугольная призма', g: 'solid', prims: [
    L(0, 0.15, 0.55, 0.25), L(0.55, 0.25, 1, 0.1), L(1, 0.1, 0, 0.15),
    L(0, 0.9, 0.55, 1), L(0.55, 1, 1, 0.85), L(0, 0.9, 1, 0.85, true),
    L(0, 0.15, 0, 0.9), L(0.55, 0.25, 0.55, 1), L(1, 0.1, 1, 0.85)] },
  cylinder: { name: 'Цилиндр', g: 'solid', prims: [
    E(0.5, 0.12, 0.5, 0.12), E(0.5, 0.88, 0.5, 0.12, 0, Math.PI), E(0.5, 0.88, 0.5, 0.12, Math.PI, Math.PI * 2, true),
    L(0, 0.12, 0, 0.88), L(1, 0.12, 1, 0.88)] },
  cone: { name: 'Конус', g: 'solid', prims: [
    E(0.5, 0.88, 0.5, 0.12, 0, Math.PI), E(0.5, 0.88, 0.5, 0.12, Math.PI, Math.PI * 2, true),
    L(0.5, 0, 0, 0.88), L(0.5, 0, 1, 0.88), L(0.5, 0, 0.5, 0.88, true)] },
  sphere: { name: 'Шар', g: 'solid', aspect: 1, prims: [
    E(0.5, 0.5, 0.5, 0.5), E(0.5, 0.5, 0.5, 0.15, 0, Math.PI), E(0.5, 0.5, 0.5, 0.15, Math.PI, Math.PI * 2, true)] },
};

// Отрезки фигуры (для попадания курсором) в локальных координатах w×h
// примитивы фигуры с учётом её угла (если он задан)
export function figPrims(it) { const f = FIGS[it.kind]; if (!f) return []; return (f.make && f.make(it)) || f.prims; }
export function figSegments(it) {
  const f = FIGS[it.kind]; if (!f) return [];
  if (SOLID_KINDS.has(it.kind)) { const segs = []; for (const l of solidView(it).lines) for (let i = 1; i < l.pts.length; i++) segs.push([...l.pts[i - 1], ...l.pts[i]]); return segs; }
  const { w, h } = it;
  const segs = [];
  for (const p of figPrims(it)) {
    if (p.t === 'l' || p.t === 'ar') segs.push([p.a[0] * w, p.a[1] * h, p.a[2] * w, p.a[3] * h]);
    else if (p.t === 'e') {
      const [cx, cy, rx, ry, a0, a1] = p.a; const n = 32; let px, py;
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n; const x = (cx + rx * Math.cos(a)) * w, y = (cy + ry * Math.sin(a)) * h;
        if (i) segs.push([px, py, x, y]); px = x; py = y;
      }
    }
  }
  return segs;
}

export function drawFig(ctx, it) {
  const f = FIGS[it.kind]; if (!f) return;
  if (SOLID_KINDS.has(it.kind)) { drawSolid(ctx, it); return; } // стереометрия — по трёхмерной модели
  const { w, h } = it;
  const dash = [Math.max(4, it.size * 3), Math.max(3, it.size * 2.5)];
  ctx.lineWidth = it.size;
  for (const p of figPrims(it)) {
    ctx.setLineDash(p.d ? dash : []);
    if (p.t === 'l' || p.t === 'ar') {
      const [x1, y1, x2, y2] = [p.a[0] * w, p.a[1] * h, p.a[2] * w, p.a[3] * h];
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      if (p.t === 'ar') {
        const a = Math.atan2(y2 - y1, x2 - x1), Lh = Math.max(10, it.size * 4);
        ctx.setLineDash([]); ctx.beginPath();
        ctx.moveTo(x2 - Lh * Math.cos(a - 0.4), y2 - Lh * Math.sin(a - 0.4)); ctx.lineTo(x2, y2); ctx.lineTo(x2 - Lh * Math.cos(a + 0.4), y2 - Lh * Math.sin(a + 0.4)); ctx.stroke();
      }
    } else if (p.t === 'e') {
      const [cx, cy, rx, ry, a0, a1] = p.a;
      ctx.beginPath(); ctx.ellipse(cx * w, cy * h, Math.abs(rx * w), Math.abs(ry * h), 0, a0, a1); ctx.stroke();
    } else if (p.t === 'txt') {
      ctx.font = `italic ${Math.max(12, Math.min(w, h) * 0.07)}px "Times New Roman", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.s, p.a[0] * w, p.a[1] * h); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
  }
  ctx.setLineDash([]);
  if (f.right) { // значок прямого угла
    const m = Math.min(w, h) * 0.1; ctx.lineWidth = Math.max(1, it.size * 0.7);
    ctx.beginPath(); ctx.moveTo(0, h - m); ctx.lineTo(m, h - m); ctx.lineTo(m, h); ctx.stroke();
  }
}

// Иконка 24×24 из тех же примитивов
export function figIcon(kind) {
  const f = FIGS[kind]; const P = (u) => (3 + u * 18).toFixed(2);
  let s = '';
  for (const p of f.prims) {
    const da = p.d ? ' stroke-dasharray="2 1.8"' : '';
    if (p.t === 'l' || p.t === 'ar') s += `<path d="M${P(p.a[0])} ${P(p.a[1])}L${P(p.a[2])} ${P(p.a[3])}"${da}/>`;
    else if (p.t === 'e') {
      const [cx, cy, rx, ry, a0, a1] = p.a;
      if (a1 - a0 >= Math.PI * 2 - 1e-6) s += `<ellipse cx="${P(cx)}" cy="${P(cy)}" rx="${(rx * 18).toFixed(2)}" ry="${(ry * 18).toFixed(2)}"${da}/>`;
      else {
        const x0 = 3 + (cx + rx * Math.cos(a0)) * 18, y0 = 3 + (cy + ry * Math.sin(a0)) * 18, x1 = 3 + (cx + rx * Math.cos(a1)) * 18, y1 = 3 + (cy + ry * Math.sin(a1)) * 18;
        s += `<path d="M${x0.toFixed(2)} ${y0.toFixed(2)}A${(rx * 18).toFixed(2)} ${(ry * 18).toFixed(2)} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}"${da}/>`;
      }
    }
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${s}</svg>`;
}

for (const k of SOLID_KINDS) if (FIGS[k]) FIGS[k].aspect = solidAspect(k);
