# Скорость: замер внутри страницы (без накладных расходов Playwright) — колесо, масштаб, перо — на пустой и на большой доске
from playwright.sync_api import sync_playwright
FILL = """() => { const D = window.__doska; const pid = D.S.page;
  const c = document.createElement('canvas'); c.width = 1600; c.height = 1000; const x = c.getContext('2d');
  for (let i = 0; i < 3000; i++) { x.fillStyle = `hsl(${i * 13 % 360},60%,60%)`; x.fillRect(Math.random() * 1600, Math.random() * 1000, 30, 30); }
  const src = c.toDataURL('image/jpeg', 0.85);
  D.doc.transact(() => {
    for (let k = 0; k < 8; k++) D.addItem({ id: 'img' + k, type: 'image', page: pid, z: k + 1, x: (k % 4) * 900, y: 2600 + Math.floor(k / 4) * 700, s: 1, w: 800, h: 500, src });
    for (let i = 0; i < 4000; i++) { const ox = (i % 80) * 45, oy = Math.floor(i / 80) * 50; const pts = [];
      for (let j = 0; j < 60; j++) pts.push(Math.round((ox + j * 0.6) * 10), Math.round((oy + Math.sin(j / 5 + i) * 12) * 10), 50);
      D.addItem({ id: 's' + i, type: 'stroke', page: pid, z: 100 + i, x: 0, y: 0, s: 1, color: '#1f2328', size: 3, kind: 'pen', v: 2, thin: 0, pts }); }
  }, 'noundo'); }"""
MEAS = """async ([kind, n]) => { const cv = document.querySelector('canvas'); const ts = [];
  for (let i = 0; i < n; i++) { const t0 = performance.now();
    const ev = new WheelEvent('wheel', { deltaY: kind === 'zoom' ? (i % 2 ? 60 : -60) : 40, deltaX: 0, ctrlKey: kind === 'zoom', clientX: 600, clientY: 400, bubbles: true, cancelable: true });
    cv.dispatchEvent(ev); await new Promise(r => requestAnimationFrame(() => r())); ts.push(performance.now() - t0); }
  ts.sort((a, b) => a - b); return { медиана: +ts[n >> 1].toFixed(1), п90: +ts[Math.floor(n * 0.9)].toFixed(1), худший: +ts[n - 1].toFixed(1) }; }"""
with sync_playwright() as p:
    b = p.chromium.launch()
    for big in (False, True):
        ctx = b.new_context(viewport={'width': 1366, 'height': 820})
        ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));")
        pg = ctx.new_page(); pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=perf-' + ('bbbb' if big else 'eeee') + '-cccc'); pg.wait_for_timeout(1500)
        if big: pg.evaluate(FILL); pg.keyboard.press('Shift+1'); pg.wait_for_timeout(1500)
        name = 'большая' if big else 'пустая'
        print(name, 'прокрутка колесом', pg.evaluate(MEAS, ['pan', 40]))
        print(name, 'масштаб колесом', pg.evaluate(MEAS, ['zoom', 30]))
        print(name, 'перерисовки', pg.evaluate("() => JSON.stringify(window.__doska.STATS)"))
        ctx.close()
    b.close()
