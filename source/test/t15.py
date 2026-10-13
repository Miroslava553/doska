# Реальное время между событиями (5 мс ≈ 200 Гц, как у планшета), замер разрыва «перо — конец линии» каждый кадр
import math, random, statistics
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
random.seed(5)
def path(kind):
    pts = []
    if kind == 'loop':   # быстрые петли, как на видео (~600–900 px/с)
        for i in range(260):
            a = i / 260 * 2 * math.pi * 1.6
            pts.append([350 + 150 * math.sin(a) + random.uniform(-0.6, 0.6), 300 + 110 * math.sin(2 * a) * 0.9 + i * 0.4 + random.uniform(-0.6, 0.6), 0.35 + 0.1 * math.sin(i / 9)])
    else:                 # медленная линия с дрожанием
        for i in range(400):
            pts.append([120 + i * 0.6 + random.uniform(-1, 1), 520 + random.uniform(-1, 1), 0.3 + random.uniform(-0.05, 0.05)])
    return pts
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 800, 'height': 700}, device_scale_factor=2)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Мира'}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=gapt-test-fff6'); pg.wait_for_function('() => window.__doska'); pg.wait_for_timeout(200)
    pg.keyboard.press('KeyP'); pg.keyboard.press('Digit3')
    for name in ('loop', 'slow'):
        res = pg.evaluate('''async (pts) => {
          const c = document.getElementById('cv-over'); const d = window.__doska; const z = d.S.view.z;
          const mk = (t, [x, y, p], b) => new PointerEvent(t, {bubbles: true, cancelable: true, pointerId: 5, pointerType: 'pen', clientX: x, clientY: y, pressure: p, buttons: b, button: t === 'pointermove' ? -1 : 0});
          const gapTip = [], gapBody = []; let shot = null;
          c.dispatchEvent(mk('pointerdown', pts[0], 1));
          let i = 1; let stopped = false;
          const meas = () => { const g = d.dbg(); if (g && !g.inSlop) { const [rx, ry] = d.toScreen(g.raw[0], g.raw[1]); const [tx, ty] = d.toScreen(g.tip[0], g.tip[1]); const [bx, by] = d.toScreen(g.body[0], g.body[1]);
              gapTip.push(Math.hypot(tx - rx, ty - ry)); gapBody.push(Math.hypot(bx - rx, by - ry)); } if (!stopped) requestAnimationFrame(meas); };
          requestAnimationFrame(meas);
          await new Promise((res) => { const tick = () => { if (i >= pts.length) return res(); c.dispatchEvent(mk('pointermove', pts[i++], 1)); setTimeout(tick, 5); }; tick(); });
          stopped = true;
          c.dispatchEvent(mk('pointerup', pts[pts.length - 1], 0));
          const q = (a, k) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * k)] || 0;
          return { n: gapTip.length, tipMed: q(gapTip, 0.5), tipP95: q(gapTip, 0.95), bodyMed: q(gapBody, 0.5), bodyP95: q(gapBody, 0.95) };
        }''', path(name))
        print(name, {k: (round(v, 2) if isinstance(v, float) else v) for k, v in res.items()})
    # кадр посреди быстрого штриха — линия должна упираться в кончик ручки
    pg.evaluate('''async () => { const c = document.getElementById('cv-over');
      const mk = (t, x, y, b) => new PointerEvent(t, {bubbles: true, cancelable: true, pointerId: 6, pointerType: 'pen', clientX: x, clientY: y, pressure: 0.4, buttons: b, button: t === 'pointermove' ? -1 : 0});
      c.dispatchEvent(mk('pointerdown', 120, 120, 1));
      for (let i = 0; i < 80; i++) { c.dispatchEvent(mk('pointermove', 120 + i * 6, 120 + 40 * Math.sin(i / 10), 1)); await new Promise(r => setTimeout(r, 5)); } }''')
    pg.wait_for_timeout(30)
    pg.screenshot(path=OUT + 'gap-live.png', clip={'x': 520, 'y': 90, 'width': 140, 'height': 100})
    print('errors', errs)
    b.close()
