// Перо: от сырых точек ввода до готовой линии. Без DOM — только геометрия (проверяется отдельно).
//
// Устройство (по шагам, каждый отвечает за одну вещь):
//   1. Профиль устройства. Перо даёт точные координаты с шумом датчика; мышь — целые пиксели и редкие точки.
//   2. Фильтр шума (только перо): «1€» — гасит дрожание на медленном движении, не мешает на быстром.
//   3. Точка или линия: пока смещение меньше TAP_SLOP — это точка, она не дёргается.
//   4. Ключевые точки (keys): отфильтрованные точки не ближе 0,75 px друг к другу.
//   5. Геометрия (ink.js): гладкая кривая через ключевые точки + усреднение вдоль длины, углы не скругляются.
//   6. Кончик: линия на экране всегда доходит до текущей точки пера — разрыва нет.
//   7. Сохранение: то же, что на экране, прореженное без потери формы.
import { buildInk, simplifyInk } from './ink.js';

export const TAP_SLOP = 3;    // экранные px: меньше — это точка
export const DOT_MIN_P = 0.55; // точка всегда заметная
export const PROFILES = {
  pen: { filter: true, step: 1.5, base: 3, spread: 0, max: 3 },
  mouse: { filter: false, step: 1.5, base: 10, spread: 2.2, max: 36 },
};

// «1€» (Casiez и др., 2012). zoom() — текущий масштаб, чтобы скорость считалась в экранных пикселях.
export function oneEuro(zoom, { minCutoff = 1, beta = 0.035, dCutoff = 3, pressureAware = true } = {}) {
  let x = null, y = null, dx = 0, dy = 0, t = 0, p = null;
  const alpha = (cut, dt) => 1 / (1 + 1 / (2 * Math.PI * cut * dt));
  return (rx, ry, rp, now) => {
    if (x === null) { x = rx; y = ry; p = rp; t = now; return [x, y, p]; }
    const dt = Math.max(1 / 480, Math.min(0.05, (now - t) / 1000 || 1 / 240)); t = now;
    const ad = alpha(dCutoff, dt);
    dx = ad * ((rx - x) / dt) + (1 - ad) * dx; dy = ad * ((ry - y) / dt) + (1 - ad) * dy;
    const speed = Math.hypot(dx, dy) * zoom();
    p = 0.2 * rp + 0.8 * p;
    const light = pressureAware ? 0.45 + 0.55 * Math.min(1, p / 0.35) : 1; // при еле заметном касании шум сильнее
    const a = alpha(minCutoff * light + beta * speed, dt);
    x = a * rx + (1 - a) * x; y = a * ry + (1 - a) * y;
    return [x, y, p];
  };
}

export class StrokeBuilder {
  // device: 'pen' | 'mouse'; steady: 0…1.2 (ползунок «Сглаживание линии»); zoom: () => число
  constructor({ x, y, p, t, device, steady = 0.85, zoom, continueKeys = null }) {
    this.device = device; this.prof = PROFILES[device] || PROFILES.mouse; this.zoom = zoom;
    this.body = this.prof.filter ? oneEuro(zoom, { minCutoff: 0.9 * (1.6 - steady) }) : null;
    this.tipF = this.prof.filter ? oneEuro(zoom, { minCutoff: 8, beta: 0.1, pressureAware: false }) : null;
    this.start = [x, y, p]; this.raw = [x, y, p]; this.tip = [x, y, p];
    this.straightLine = false; this.dirty = false; this.cache = null;
    if (continueKeys && continueKeys.length) {
      this.keys = continueKeys.map((q) => q.slice()); this.isDot = false; this.start = this.keys[0];
      const e = this.keys[this.keys.length - 1]; if (this.body) this.body(e[0], e[1], e[2], t - 16);
      this.dirty = true;
    } else {
      this.keys = [[x, y, Math.max(p, DOT_MIN_P)]]; this.isDot = true; this.peak = p;
    }
    if (this.body) this.body(x, y, p, t);
    if (this.tipF) this.tipF(x, y, p, t);
  }
  get opts() { const z = this.zoom(), P = this.prof; return { step: P.step / z, base: P.base / z, spread: P.spread, max: P.max / z, corner: 50 }; }
  // новая точка ввода (мировые координаты). Возвращает отфильтрованную точку, если она стала ключевой.
  add(x, y, p, t) {
    this.raw = [x, y, p]; this.lastT = t;
    const f = this.body ? this.body(x, y, p, t) : [x, y, p];
    if (this.tipF) { this.tip = this.tipF(x, y, p, t); this.tip[2] = f[2]; } else this.tip = f;
    if (this.isDot) {
      this.peak = Math.max(this.peak, f[2]);
      if (Math.hypot(x - this.start[0], y - this.start[1]) * this.zoom() < TAP_SLOP) { this.keys[0][2] = Math.max(this.peak, DOT_MIN_P); return null; }
      this.isDot = false; this.keys[0][2] = f[2];
    }
    const L = this.keys[this.keys.length - 1];
    if (Math.hypot(f[0] - L[0], f[1] - L[1]) * this.zoom() < 0.75) { L[2] = Math.max(L[2], f[2]); return null; }
    this.keys.push(f); this.dirty = true;
    return f;
  }
  // Shift — прямая от начала до пера
  straight(x, y) { this.straightLine = true; this.isDot = false; this.raw = [x, y, this.keys[0][2]]; this.straightKeys = [this.start.slice(0, 3), [x, y, this.keys[0][2]]]; }
  unstraight() { this.straightLine = false; }
  // последняя координата — из события отрыва пера
  end(x, y) {
    if (this.isDot || this.straightLine) return;
    this.raw = [x, y, this.raw[2]];
    if (this.tipF) { this.tip = this.tipF(x, y, this.tip[2], (this.lastT || 0) + 8); this.tip[2] = this.keys[this.keys.length - 1][2]; }
    else { const L = this.keys[this.keys.length - 1]; if (Math.hypot(x - L[0], y - L[1]) * this.zoom() >= 0.75) { this.keys.push([x, y, L[2]]); this.dirty = true; } }
  }
  geometry() {
    if (this.straightLine) return this.straightKeys;
    if (this.isDot || this.keys.length < 2) return this.keys;
    if (this.dirty || !this.cache) { this.cache = buildInk(this.keys, this.opts); this.dirty = false; }
    return this.cache;
  }
  // то, что рисуется во время письма: линия + кончик + до самого пера
  // withRaw=false — без последней «сырой» точки (для пунктира: его конец не дёргается от шума датчика)
  live(withRaw = true) {
    const g = this.geometry();
    if (this.isDot || this.straightLine || !this.tipF) return g;
    const z = this.zoom(), L = g[g.length - 1], out = g.slice();
    if (Math.hypot(this.tip[0] - L[0], this.tip[1] - L[1]) * z > 0.3) out.push([this.tip[0], this.tip[1], L[2]]);
    if (withRaw && Math.hypot(this.raw[0] - this.tip[0], this.raw[1] - this.tip[1]) * z > 0.3) out.push([this.raw[0], this.raw[1], L[2]]);
    return out;
  }
  // то, что сохраняется: как на экране (кончик включён), прорежено
  final() {
    if (this.isDot || this.straightLine) return this.geometry().map((q) => q.slice(0, 3));
    if (this.tipF) {
      const L = this.keys[this.keys.length - 1];
      if (Math.hypot(this.tip[0] - L[0], this.tip[1] - L[1]) * this.zoom() > 0.3) { this.keys.push([this.tip[0], this.tip[1], L[2]]); this.dirty = true; }
    }
    return simplifyInk(this.geometry(), 0.12 / this.zoom());
  }
  lastPressure() { return this.keys[this.keys.length - 1][2]; }
}
