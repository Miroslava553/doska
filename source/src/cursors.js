// Курсоры инструментов — системные (их рисует ОС, а не страница): не отстают, не «телепортируются»,
// даже когда доска занята. Картинка курсора меняется только при смене инструмента, цвета или размера.
const cache = new Map();
const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

// Ручка 32×32, кончик в точке (3, 29) — это «горячая точка» курсора
export function penCursor(kind, color) {
  const key = 'pen|' + kind + '|' + color; if (cache.has(key)) return cache.get(key);
  const c = color === '#ffffff' ? '#ffffff' : color;
  const hl = kind === 'hl';
  const tip = hl ? 'M0 -2.4 L5.5 -4.4 L5.5 4.4 L0 2.4 Z' : 'M0 0 L6.5 -3.2 L6.5 3.2 Z';
  const body = hl ? 'M5.5 -4.4 H21 V4.4 H5.5 Z' : 'M6.5 -3.2 H22 V3.2 H6.5 Z';
  const dash = kind === 'dash' ? `<rect x="10" y="-1" width="2.6" height="2" fill="${c}"/><rect x="14.6" y="-1" width="2.6" height="2" fill="${c}"/>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="translate(3 29) rotate(-45)" stroke-linejoin="round">` +
    `<path d="${tip} ${body}" fill="none" stroke="#fff" stroke-width="3"/>` +
    `<path d="${body}" fill="#fff"/><path d="${tip}" fill="${c}" ${hl ? 'fill-opacity=".85"' : ''}/>${dash}` +
    `<path d="${tip} ${body}" fill="none" stroke="#1f2328" stroke-width="1.1"/></g></svg>`;
  const v = `${svgUrl(svg)} 3 29, crosshair`; cache.set(key, v); return v;
}

// Ластик — круг размером с ластик (до 120 px), точный режим — с точкой в центре
export function eraserCursor(diameter, precise) {
  const d = Math.max(6, Math.min(120, Math.round(diameter)));
  const key = 'er|' + d + '|' + precise; if (cache.has(key)) return cache.get(key);
  const s = d + 4, r = d / 2, c = s / 2;
  const dot = precise ? `<circle cx="${c}" cy="${c}" r="1.5" fill="#495057"/>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}"><circle cx="${c}" cy="${c}" r="${r}" fill="rgba(255,255,255,.55)" stroke="#fff" stroke-width="3"/><circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#495057" stroke-width="1.2"/>${dot}</svg>`;
  const v = `${svgUrl(svg)} ${Math.round(c)} ${Math.round(c)}, crosshair`; cache.set(key, v); return v;
}

// Поворот — небольшая изогнутая двойная стрелка; k — угол рамки (0 ↖, 1 ↗, 2 ↘, 3 ↙), дуга смотрит наружу от угла
export function rotateCursor(k = 1) {
  const key = 'rot' + k; if (cache.has(key)) return cache.get(key);
  // дуга в четверть круга, середина дуги — в точке курсора; центр дуги — со стороны фигуры
  const mid = [-135, -45, 45, 135][k] * Math.PI / 180, R = 12, a0 = mid - 0.85, a1 = mid + 0.85;
  const cx = 16 - R * Math.cos(mid), cy = 16 - R * Math.sin(mid);
  const P = (a) => [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  const f = (v) => v.toFixed(2);
  const head = (a, dir) => { const [ex, ey] = P(a), tx = -Math.sin(a) * dir, ty = Math.cos(a) * dir, nx = Math.cos(a), ny = Math.sin(a);
    return `M${f(ex - tx * 5 + nx * 3.6)} ${f(ey - ty * 5 + ny * 3.6)} L${f(ex + tx * 0.5)} ${f(ey + ty * 0.5)} L${f(ex - tx * 5 - nx * 3.6)} ${f(ey - ty * 5 - ny * 3.6)}`; };
  const [sx, sy] = P(a0), [ex, ey] = P(a1);
  const d = `M${f(sx)} ${f(sy)} A${R} ${R} 0 0 1 ${f(ex)} ${f(ey)} ${head(a1, 1)} ${head(a0, -1)}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${d}" stroke="#fff" stroke-width="4.2"/><path d="${d}" stroke="#1f2328" stroke-width="1.8"/></g></svg>`;
  const v = `${svgUrl(svg)} 16 16, grab`; cache.set(key, v); return v;
}

// ---- курсоры выделения: свои, в одном стиле (тёмный контур, белая обводка) ----
const halo = (d, w = 2) => `<path d="${d}" fill="none" stroke="#fff" stroke-width="${w + 3}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#1f2328" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const make = (key, body, hx, hy, fallback) => { if (cache.has(key)) return cache.get(key); const v = `${svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${body}</svg>`)} ${hx} ${hy}, ${fallback}`; cache.set(key, v); return v; };
// Выделение — стрелка с синей точкой (видно, что включено выделение, а не перо)
export const selectCursor = () => make('sel', '<path d="M7 4 L7 24 L12 19.5 L15.5 27 L19 25.5 L15.5 18 L22 18 Z" fill="#1f2328" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><circle cx="24" cy="25" r="3" fill="#4c6ef5" stroke="#fff" stroke-width="1.4"/>', 7, 4, 'default');
// Растянуть — двойная стрелка под углом ручки
export function resizeCursor(deg) {
  const d = 'M6 16 H26 M10 12 L6 16 L10 20 M22 12 L26 16 L22 20';
  return make('rs' + deg, `<g transform="rotate(${deg} 16 16)">${halo(d)}</g>`, 16, 16, deg % 180 === 0 ? 'ew-resize' : deg % 180 === 90 ? 'ns-resize' : deg % 180 === 45 ? 'nwse-resize' : 'nesw-resize');
}
// Переместить — четыре стрелки
export const moveCursor = () => make('mv', halo('M16 5 V27 M5 16 H27 M12.5 8.5 L16 5 L19.5 8.5 M12.5 23.5 L16 27 L19.5 23.5 M8.5 12.5 L5 16 L8.5 19.5 M23.5 12.5 L27 16 L23.5 19.5', 1.8), 16, 16, 'move');
// Вершина — кружок с перекрестьем
// Вершина — просто точка: видно, куда именно встанет вершина
export const vertexCursor = () => make('vx', '<circle cx="16" cy="16" r="3.4" fill="#4c6ef5" stroke="#fff" stroke-width="1.6"/>', 16, 16, 'crosshair');
