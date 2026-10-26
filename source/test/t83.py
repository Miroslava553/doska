# Скорость на большой доске: 4000 линий по 60 точек и 8 больших картинок. Перемещение, масштаб, письмо, выделение всего.
from playwright.sync_api import sync_playwright
import time, json
with sync_playwright() as p:
    b = p.chromium.launch(args=['--enable-gpu-rasterization']); ctx = b.new_context(viewport={'width': 1366, 'height': 820})
    ctx.add_init_script("""localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));""")
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=perf-aaaa-bbbb'); pg.wait_for_timeout(1500)
    t = time.time()
    pg.evaluate("""() => { const D = window.__doska; const pid = D.S.page;
      const c = document.createElement('canvas'); c.width = 1600; c.height = 1000; const x = c.getContext('2d');
      for (let i = 0; i < 3000; i++) { x.fillStyle = `hsl(${i * 13 % 360},60%,60%)`; x.fillRect(Math.random() * 1600, Math.random() * 1000, 30, 30); }
      const src = c.toDataURL('image/jpeg', 0.85);
      D.act(() => {
        for (let k = 0; k < 8; k++) D.addItem({ id: 'img' + k, type: 'image', page: pid, z: k + 1, x: (k % 4) * 900, y: 2600 + Math.floor(k / 4) * 700, s: 1, w: 800, h: 500, src });
        for (let i = 0; i < 4000; i++) { const ox = (i % 80) * 45, oy = Math.floor(i / 80) * 50; const pts = [];
          for (let j = 0; j < 60; j++) pts.push(Math.round((ox + j * 0.6) * 10), Math.round((oy + Math.sin(j / 5 + i) * 12) * 10), 50);
          D.addItem({ id: 's' + i, type: 'stroke', page: pid, z: 100 + i, x: 0, y: 0, s: 1, color: '#1f2328', size: 3, kind: 'pen', v: 2, thin: 0, pts }); }
      }); }""")
    print('наполнение', round(time.time() - t, 1), 'с, объектов', pg.evaluate("() => window.__doska.items.size"))
    pg.keyboard.press('Shift+1'); pg.wait_for_timeout(1500)
    def fps(fn, n=60):
        return pg.evaluate("""async (n) => { const D = window.__doska; const ts = []; let last = performance.now();
          for (let i = 0; i < n; i++) { %s; await new Promise(r => requestAnimationFrame(r)); const now = performance.now(); ts.push(now - last); last = now; }
          ts.sort((a, b) => a - b); return { сред: +(ts.reduce((a, b) => a + b) / n).toFixed(1), медиана: +ts[n >> 1].toFixed(1), худший: +ts[n - 1].toFixed(1) }; }""" % fn, n)
    print('прокрутка (мс на кадр)', fps("D.S.view.x -= 7; D.S.view.y -= 3; window.dispatchEvent(new Event('doska:view'))"))
    # реальная прокрутка колесом
    pg.mouse.move(600, 400); t = time.time()
    for i in range(40): pg.mouse.wheel(0, 40)
    pg.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
    print('40 прокруток колесом', round((time.time() - t) * 1000), 'мс')
    t = time.time()
    for i in range(10): pg.keyboard.down('Control'); pg.mouse.wheel(0, -100); pg.keyboard.up('Control')
    pg.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
    print('10 шагов масштаба', round((time.time() - t) * 1000), 'мс', 'перерисовок', pg.evaluate("() => JSON.stringify(window.__doska.STATS)"))
    # письмо пером: время от движения до кадра
    pg.keyboard.press('p'); pg.mouse.move(300, 300); pg.mouse.down(); t = time.time()
    for i in range(120): pg.mouse.move(300 + i * 4, 300 + (i % 10) * 3)
    pg.mouse.up(); pg.evaluate("() => new Promise(r => requestAnimationFrame(r))")
    print('120 движений пера', round((time.time() - t) * 1000), 'мс')
    t = time.time(); pg.keyboard.press('Control+a'); pg.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
    print('выделить всё', round((time.time() - t) * 1000), 'мс', pg.evaluate("() => window.__doska.S.sel.size"))
    pg.keyboard.press('v'); t = time.time(); pg.mouse.move(683, 410); pg.mouse.down()
    for i in range(30): pg.mouse.move(683 + i * 5, 410)
    pg.mouse.up(); pg.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
    print('перенос всего (30 шагов)', round((time.time() - t) * 1000), 'мс')
    t = time.time(); pg.keyboard.press('Control+z'); pg.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))"); print('отмена переноса', round((time.time() - t) * 1000), 'мс')
    t = time.time(); pg.keyboard.press('Delete'); pg.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))"); print('удалить всё', round((time.time() - t) * 1000), 'мс')
    t = time.time(); pg.keyboard.press('Control+z'); pg.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))"); print('вернуть всё', round((time.time() - t) * 1000), 'мс', pg.evaluate("() => window.__doska.items.size"))
    t = time.time(); pg.reload(); pg.wait_for_function("() => window.__doska && window.__doska.items.size > 4000", timeout=60000); print('перезагрузка до готовности', round(time.time() - t, 1), 'с')
    t = time.time(); pg.evaluate("() => window.__doska.hist().open()"); pg.wait_for_selector('.hp-note', state='hidden', timeout=60000); print('история открылась', round(time.time() - t, 1), 'с')
    print(errs); b.close()
