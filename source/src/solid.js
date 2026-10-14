// Стереометрия — настоящие трёхмерные модели.
// Фигура хранит (по желанию) свои вершины m и углы обзора yaw/pitch/roll. Отсюда считается проекция:
// какие рёбра видны (сплошные), какие закрыты гранями (пунктир), где контур у цилиндра, конуса и шара.
// Поворот в пространстве = yaw/pitch, поворот на доске = roll, перетаскивание вершины = правка m.
const D = Math.PI / 180;
export const SOLID_KINDS = new Set(['cube', 'tetra', 'pyramid', 'rpyramid', 'prism', 'cylinder', 'cone', 'sphere']);
export const VIEW0 = { yaw: 28, pitch: 16, roll: 0 };
const N = 48; // точек на окружности цилиндра и конуса

const ring = (n, r, y, a0 = 0) => Array.from({ length: n }, (_, k) => { const a = a0 + (k * 2 * Math.PI) / n; return [r * Math.cos(a), y, r * Math.sin(a)]; });
const MODELS = {};
function build(kind) {
  if (MODELS[kind]) return MODELS[kind];
  let v = [], f = [], g = null, handles = null, decor = [], hull = false;
  if (kind === 'cube') {
    for (let i = 0; i < 8; i++) v.push([(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1]);
    f = [[0, 2, 6, 4], [1, 3, 7, 5], [0, 1, 5, 4], [2, 3, 7, 6], [0, 1, 3, 2], [4, 5, 7, 6]];
  } else if (kind === 'pyramid' || kind === 'rpyramid') {
    v = [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1], kind === 'pyramid' ? [0, 1.8, 0] : [-1, 1.8, 1]];
    f = [[0, 1, 2, 3], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]];
  } else if (kind === 'tetra') {
    v = [...ring(3, 1.15, 0, Math.PI / 2), [0, 1.8, 0]];
    f = [[0, 1, 2], [0, 1, 3], [1, 2, 3], [2, 0, 3]];
  } else if (kind === 'prism') {
    v = [...ring(3, 1.15, 0, Math.PI / 2), ...ring(3, 1.15, 1.8, Math.PI / 2)];
    f = [[0, 1, 2], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]];
  } else if (kind === 'cylinder') {
    v = [...ring(N, 1, 0), ...ring(N, 1, 1.8)];
    f = [Array.from({ length: N }, (_, i) => i), Array.from({ length: N }, (_, i) => N + i)]; g = ['b', 't'];
    for (let i = 0; i < N; i++) { const j = (i + 1) % N; f.push([i, j, N + j, N + i]); g.push('lat'); }
    handles = [];
  } else if (kind === 'cone') {
    v = [...ring(N, 1, 0), [0, 1.9, 0], [0, 0, 0]];
    f = [Array.from({ length: N }, (_, i) => i)]; g = ['b'];
    for (let i = 0; i < N; i++) { f.push([i, (i + 1) % N, N]); g.push('lat'); }
    handles = [N]; decor = [[N, N + 1]]; // высота — пунктиром
  } else if (kind === 'sphere') {
    const M = 24, K = 72; v.push([0, 1, 0]);
    for (let a = 1; a < M; a++) { const t = (a * Math.PI) / M; v.push(...ring(K, Math.sin(t), Math.cos(t))); }
    v.push([0, -1, 0]); g = [];
    const id = (a, k) => 1 + (a - 1) * K + (k % K), S = v.length - 1;
    for (let k = 0; k < K; k++) { f.push([0, id(1, k), id(1, k + 1)]); g.push('n'); f.push([S, id(M - 1, k + 1), id(M - 1, k)]); g.push('s'); }
    for (let a = 1; a < M - 1; a++) for (let k = 0; k < K; k++) { f.push([id(a, k), id(a + 1, k), id(a + 1, k + 1), id(a, k + 1)]); g.push(a < M / 2 ? 'n' : 's'); }
    handles = []; hull = true; // контур шара — по проекции, экватор — граница полушарий
  }
  if (!g) g = f.map((_, i) => 'f' + i);
  if (!handles) handles = v.map((_, i) => i);
  const nMesh = kind === 'cone' ? N + 1 : v.length; // точки граней (без центра основания конуса)
  return (MODELS[kind] = { v, f, g, handles, decor, hull, nMesh });
}
export const canonical = (kind) => build(kind).v.map((p) => p.slice());

// Поворот: сначала вокруг вертикали (yaw), потом наклон (pitch), потом на доске (roll)
export function rotMat(yaw, pitch, roll) {
  const [cy, sy, cp, sp, cr, sr] = [Math.cos(yaw * D), Math.sin(yaw * D), Math.cos(pitch * D), Math.sin(pitch * D), Math.cos(roll * D), Math.sin(roll * D)];
  const Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
  const Rx = [[1, 0, 0], [0, cp, -sp], [0, sp, cp]];
  const Rz = [[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]];
  return mul(Rz, mul(Rx, Ry));
}
const mul = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const ap = (A, p) => [A[0][0] * p[0] + A[0][1] * p[1] + A[0][2] * p[2], A[1][0] * p[0] + A[1][1] * p[1] + A[1][2] * p[2], A[2][0] * p[0] + A[2][1] * p[1] + A[2][2] * p[2]];
const T = (A) => [[A[0][0], A[1][0], A[2][0]], [A[0][1], A[1][1], A[2][1]], [A[0][2], A[1][2], A[2][2]]];

export const viewOf = (it) => ({ yaw: it.yaw ?? VIEW0.yaw, pitch: it.pitch ?? VIEW0.pitch, roll: it.roll ?? VIEW0.roll });
const verts = (it) => (Array.isArray(it.m) && it.m.length === build(it.kind).v.length ? it.m : build(it.kind).v);

// Проекция: точки на экране (x вправо, y вниз), глубина и рамка
export function project(it, view = viewOf(it), V = verts(it)) {
  const R = rotMat(view.yaw, view.pitch, view.roll);
  const Q = V.map((p) => ap(R, p));
  const nm = build(it.kind).nMesh;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < Q.length; i++) { if (i >= nm && it.kind === 'cone') continue; const x = Q[i][0], y = -Q[i][1]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  let cx = 0, cy = 0; for (let i = 0; i < nm; i++) { cx += Q[i][0]; cy -= Q[i][1]; } cx /= nm; cy /= nm;
  return { R, Q, x0, y0, pw: Math.max(1e-6, x1 - x0), ph: Math.max(1e-6, y1 - y0), cx, cy };
}

// Что рисовать: ломаные (в координатах рамки w×h) со знаком «пунктир»
export function solidView(it) {
  const view = viewOf(it); const V = verts(it);
  const key = `${it.kind}|${view.yaw}|${view.pitch}|${view.roll}|${it.w}|${it.h}|${it.m ? JSON.stringify(it.m) : ''}`;
  if (it._sv && it._sv.key === key) return it._sv;
  const mdl = build(it.kind); const pr = project(it, view, V);
  const fx = it.w / pr.pw, fy = it.h / pr.ph;
  const P = pr.Q.map((q) => [(q[0] - pr.x0) * fx, (-q[1] - pr.y0) * fy]);
  // нормали граней (метод Ньюэлла), наружу от центра тела; видна, если смотрит на нас (z > 0)
  let c = [0, 0, 0]; for (let i = 0; i < mdl.nMesh; i++) for (let k = 0; k < 3; k++) c[k] += pr.Q[i][k] / mdl.nMesh;
  const front = mdl.f.map((face) => {
    let n = [0, 0, 0], fc = [0, 0, 0];
    for (let i = 0; i < face.length; i++) {
      const a = pr.Q[face[i]], b = pr.Q[face[(i + 1) % face.length]];
      n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
      for (let k = 0; k < 3; k++) fc[k] += a[k] / face.length;
    }
    if (n[0] * (fc[0] - c[0]) + n[1] * (fc[1] - c[1]) + n[2] * (fc[2] - c[2]) < 0) n = n.map((x) => -x);
    return n[2] > 1e-9;
  });
  const edges = new Map();
  mdl.f.forEach((face, fi) => { for (let i = 0; i < face.length; i++) { const a = face[i], b = face[(i + 1) % face.length]; const k = a < b ? a + ',' + b : b + ',' + a; if (!edges.has(k)) edges.set(k, []); edges.get(k).push(fi); } });
  const solid = [], dashed = [];
  for (const [k, fs] of edges) {
    const [a, b] = k.split(',').map(Number);
    const hard = fs.length < 2 || mdl.g[fs[0]] !== mdl.g[fs[1]];
    const vis = fs.some((fi) => front[fi]);
    if (hard) (vis ? solid : dashed).push([a, b]);
    else if (!mdl.hull && fs.length === 2 && front[fs[0]] !== front[fs[1]]) solid.push([a, b]); // контур цилиндра и конуса
  }
  for (const d of mdl.decor) dashed.push(d);
  const lines = [...chain(solid).map((ix) => ({ pts: ix.map((i) => P[i]), d: false })), ...chain(dashed).map((ix) => ({ pts: ix.map((i) => P[i]), d: true }))];
  if (mdl.hull) { const h = convexHull(P.slice(0, mdl.nMesh)); lines.push({ pts: [...h, h[0]], d: false }); }
  it._sv = { key, lines, P, handles: mdl.handles };
  return it._sv;
}
// рёбра одного вида — в длинные ломаные, чтобы пунктир шёл ровно и по окружности
function chain(E) {
  const adj = new Map(); const add = (a, b, e) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push([b, e]); };
  E.forEach(([a, b], e) => { add(a, b, e); add(b, a, e); });
  const used = new Array(E.length).fill(false), out = [];
  const walk = (start) => { const path = [start]; let cur = start; for (;;) { const nx = (adj.get(cur) || []).find(([, e]) => !used[e]); if (!nx) break; used[nx[1]] = true; cur = nx[0]; path.push(cur); } return path; };
  for (const [v, l] of adj) if (l.length === 1 && l.some(([, e]) => !used[e])) out.push(walk(v)); // сначала от концов
  E.forEach(([a], e) => { if (!used[e]) out.push(walk(a)); }); // остались замкнутые
  return out.filter((p) => p.length > 1);
}
function convexHull(pts) {
  const p = pts.map((q) => q.slice()).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop(); return lo.concat(up);
}
export function drawSolid(ctx, it) {
  const sv = solidView(it);
  const dash = [Math.max(4, it.size * 3), Math.max(3, it.size * 2.5)];
  ctx.lineWidth = it.size; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const l of sv.lines) { ctx.setLineDash(l.d ? dash : []); ctx.beginPath(); l.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
  ctx.setLineDash([]);
}

// ---------- изменения: всё в «запечённом» виде, без растяжения рамки ----------
// Растяжение рамки переносим в сами вершины: тогда поворот не искажает фигуру.
export function bake(it) {
  const pr = project(it);
  const fx = it.w / pr.pw, fy = it.h / pr.ph, fz = Math.sqrt(fx * fy);
  const Rt = T(pr.R);
  return verts(it).map((p) => { const q = ap(pr.R, p); return ap(Rt, [q[0] * fx, q[1] * fy, q[2] * fz]); });
}
// Новый вид (углы) и/или новые вершины → поля фигуры. Точка pin (номер вершины или 'c' — центр) остаётся на месте.
export function reproject(it, view, m, pin = 'c') {
  const s = it.s || 1;
  const old = project(it); // it — уже «запечённая» фигура (см. prepared)
  const nw = project(it, view, m);
  const at = (pr, P) => (pin === 'c' ? [pr.cx - pr.x0, pr.cy - pr.y0] : [pr.Q[pin][0] - pr.x0, -pr.Q[pin][1] - pr.y0]);
  const a = at(old), b = at(nw);
  return { m, yaw: view.yaw, pitch: view.pitch, roll: view.roll, w: nw.pw, h: nw.ph, x: it.x + (a[0] - b[0]) * s, y: it.y + (a[1] - b[1]) * s };
}
// Фигура с вершинами, в которые перенесено растяжение рамки (масштаб 1:1) — с ней удобно поворачивать и тянуть
export function prepared(it) { const m = bake(it); const pr = project({ ...it, m }); const { _sv, ...rest } = it; return { ...rest, m, w: pr.pw, h: pr.ph }; }
// Сдвинуть вершину i на (dx, dy) в координатах рамки
export function moveVertex(it, i, dx, dy) {
  const view = viewOf(it); const R = rotMat(view.yaw, view.pitch, view.roll);
  const m = it.m.map((p) => p.slice());
  const d = ap(T(R), [dx, -dy, 0]);
  m[i] = [m[i][0] + d[0], m[i][1] + d[1], m[i][2] + d[2]];
  return m;
}
export const solidHandles = (it) => { const sv = solidView(it); return sv.handles.map((i) => ({ i, p: sv.P[i] })); };
// Правильная форма: вершины как у образца, углы обзора те же, ширина та же
export function regularSolid(it) {
  const pr = project({ ...it, m: null });
  const k = it.w / pr.pw;
  const w = pr.pw * k, h = pr.ph * k, s = it.s || 1;
  return { m: null, w, h, y: it.y + ((it.h - h) / 2) * s };
}
export const solidAspect = (kind) => { const pr = project({ kind }); return pr.ph / pr.pw; };
