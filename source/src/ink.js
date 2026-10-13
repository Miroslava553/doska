// Построение линии из точек ввода.
// 1) Между точками — гладкая кривая (центростремительный сплайн Катмулла–Рома), а не прямые отрезки:
//    при быстром движении точки редкие, и прямые дают ломаную (так делают Square, Blender).
// 2) Кривая нарезается равномерно и усредняется вдоль длины. Радиус усреднения у мыши растёт
//    вместе с расстоянием между точками: на быстром движении точки редкие и «ступенчатые»
//    (целые пиксели), и именно там нужно сглаживать сильнее. У пера координаты точные — радиус маленький.
// 3) Острые углы (галочка, зигзаг, буква «N») не скругляются: на них усреднение останавливается.
// Концы линии остаются точно на месте.

function catmull(p0, p1, p2, p3, n, out, r1, r2) {
  // centripetal (alpha = 0.5) — без петель и выбросов на резких поворотах
  const d = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) || 1e-4;
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  for (let k = 1; k <= n; k++) {
    const t = t1 + ((t2 - t1) * k) / n;
    const lerp = (a, b, ta, tb) => { const w = (tb - ta) || 1e-4; const u = (t - ta) / w; return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; };
    const A1 = lerp(p0, p1, t0, t1), A2 = lerp(p1, p2, t1, t2), A3 = lerp(p2, p3, t2, t3);
    const B1 = lerp(A1, A2, t0, t2), B2 = lerp(A2, A3, t1, t3);
    const C = lerp(B1, B2, t1, t2);
    const u = k / n;
    out.push([C[0], C[1], p1[2] + (p2[2] - p1[2]) * u, r1 + (r2 - r1) * u]);
  }
}

// keys — точки ввода [x, y, p] в мировых единицах.
// o: { step, base, spread, max, corner } — шаг нарезки, базовый радиус, множитель от расстояния между точками,
//    предел радиуса (всё в мировых единицах), угол «острого угла» в градусах.
export function buildInk(keys, o) {
  const n = keys.length;
  if (n < 2) return keys.map((q) => q.slice(0, 3));
  const { step, base, spread = 0, max = base, corner = 50 } = o;
  // расстояние до соседних точек → местный радиус усреднения
  const seg = []; for (let i = 0; i < n - 1; i++) seg.push(Math.hypot(keys[i + 1][0] - keys[i][0], keys[i + 1][1] - keys[i][1]));
  const rad = keys.map((_, i) => {
    const s = Math.max(seg[i - 1] || 0, seg[i] || 0);
    return Math.min(max, Math.max(base, s * spread));
  });
  // острые углы: направление «до» и «после» сравниваем на отрезках не короче ~3 шагов (шум не считается углом)
  const isCorner = new Uint8Array(n); const cosA = new Float32Array(n).fill(1);
  const minArm = step * 3, cosLim = Math.cos((corner * Math.PI) / 180);
  for (let i = 1; i < n - 1; i++) {
    let a = i - 1; while (a > 0 && Math.hypot(keys[i][0] - keys[a][0], keys[i][1] - keys[a][1]) < minArm) a--;
    let b = i + 1; while (b < n - 1 && Math.hypot(keys[b][0] - keys[i][0], keys[b][1] - keys[i][1]) < minArm) b++;
    const ux = keys[i][0] - keys[a][0], uy = keys[i][1] - keys[a][1], vx = keys[b][0] - keys[i][0], vy = keys[b][1] - keys[i][1];
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (lu < minArm * 0.7 || lv < minArm * 0.7) continue;
    cosA[i] = (ux * vx + uy * vy) / (lu * lv);
    if (cosA[i] < cosLim) isCorner[i] = 1;
  }
  // в группе соседних отметок угол один — там, где поворот самый резкий (вершина)
  for (let i = 1; i < n - 1; i++) {
    if (!isCorner[i]) continue;
    let j = i, best = i; while (j + 1 < n - 1 && isCorner[j + 1]) { j++; if (cosA[j] < cosA[best]) best = j; }
    for (let k = i; k <= j; k++) isCorner[k] = k === best ? 1 : 0;
    i = j;
  }
  // 1) плотные точки вдоль сплайна; на углах сплайн не «перекидывает» кривую через угол
  const dense = [[keys[0][0], keys[0][1], keys[0][2], rad[0]]]; const breaks = [0];
  for (let i = 0; i < n - 1; i++) {
    const p1 = keys[i], p2 = keys[i + 1];
    const p0 = i > 0 && !isCorner[i] ? keys[i - 1] : p1;
    const p3 = i + 2 < n && !isCorner[i + 1] ? keys[i + 2] : p2;
    const segs = Math.max(1, Math.min(96, Math.ceil(seg[i] / step)));
    if (segs === 1) dense.push([p2[0], p2[1], p2[2], rad[i + 1]]); else catmull(p0, p1, p2, p3, segs, dense, rad[i], rad[i + 1]);
    if (isCorner[i + 1]) breaks.push(dense.length - 1);
  }
  breaks.push(dense.length - 1);
  // 2) усреднение вдоль линии, отдельно на каждом куске между углами (углы и концы — неподвижны)
  const out = dense.map((q) => [q[0], q[1], q[2]]);
  for (let b = 0; b < breaks.length - 1; b++) {
    const s0 = breaks[b], s1 = breaks[b + 1];
    for (let i = s0 + 1; i < s1; i++) {
      const K = Math.min(Math.round(dense[i][3] / step), i - s0, s1 - i);
      if (K < 1) continue;
      const sig = Math.max(1, K / 2); let sx = 0, sy = 0, sp = 0, sw = 0;
      for (let j = -K; j <= K; j++) { const q = dense[i + j], w = Math.exp(-(j * j) / (2 * sig * sig)); sx += q[0] * w; sy += q[1] * w; sp += q[2] * w; sw += w; }
      out[i] = [sx / sw, sy / sw, sp / sw];
    }
  }
  return out;
}

// Прореживание для хранения: убираем точки, которые почти не меняют форму (допуск в мировых единицах)
export function simplifyInk(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); const A = pts[a], B = pts[b];
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
    let best = -1, bd = 0;
    for (let i = a + 1; i < b; i++) {
      const P = pts[i];
      const dist = L < 1e-6 ? Math.hypot(P[0] - A[0], P[1] - A[1]) : Math.abs((P[0] - A[0]) * dy - (P[1] - A[1]) * dx) / L; // замкнутая линия: концы совпадают
      const dp = Math.abs(P[2] - (A[2] + ((B[2] - A[2]) * (i - a)) / (b - a))) * 4 * tol; // нажим тоже сохраняем
      const d = Math.max(dist, dp);
      if (d > bd) { bd = d; best = i; }
    }
    if (best > 0 && bd > tol) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
