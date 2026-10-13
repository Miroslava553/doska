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
