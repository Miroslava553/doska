import sys, random, math
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
tag = sys.argv[1]
URL = 'file:///home/claude/board/dist/doska.html?nopeer#r=jitt-test-' + ('aaa1' if tag == 'before' else 'bbb2')
random.seed(7)
# медленные штрихи: по 0.25–0.4 px за событие, дрожание руки/датчика ±1.2 px, шум нажима ±0.06
def slow(x0, y0, dx, dy, n, amp=1.2):
    pts = []; t = 0
    for i in range(n):
        x = x0 + dx * i + random.uniform(-amp, amp); y = y0 + dy * i + random.uniform(-amp, amp)
        p = min(1, max(0.05, 0.45 + 0.06 * math.sin(i / 7) + random.uniform(-0.06, 0.06)))
        pts.append([x, y, p, t]); t += 4
    return pts
strokes = [slow(120, 160, 0.35, 0.0, 900), slow(120, 260, 0.30, 0.12, 900), slow(450, 380, 0.0, 0.30, 700),
           [[200 + 90 * math.cos(a / 160 * 2 * math.pi) + random.uniform(-1, 1), 560 + 90 * math.sin(a / 160 * 2 * math.pi) + random.uniform(-1, 1), 0.5, a * 6] for a in range(170)]]
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 760, 'height': 700}, device_scale_factor=2)
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Мира', sizeIdx: {pen: 1, hl: 1, eraser: 1, text: 1}}))")
    pg.goto(URL); pg.wait_for_function('() => window.__doska'); pg.wait_for_timeout(200)
    pg.keyboard.press('KeyP'); pg.evaluate('() => window.__doska.S.view = {x: 0, y: 0, z: 1}')
    for s in strokes:
        pg.evaluate('''(pts) => { const c = document.getElementById('cv-over'); const t0 = performance.now();
          const mk = (t, [x, y, p, ts], b) => new PointerEvent(t, {bubbles: true, cancelable: true, pointerId: 5, pointerType: 'pen', clientX: x, clientY: y, pressure: p, buttons: b, button: t === 'pointermove' ? -1 : 0});
          c.dispatchEvent(mk('pointerdown', pts[0], 1)); for (const q of pts.slice(1)) c.dispatchEvent(mk('pointermove', q, 1)); c.dispatchEvent(mk('pointerup', pts[pts.length - 1], 0)); }''', s)
    pg.wait_for_timeout(200)
    pg.screenshot(path=OUT + f'jitter-{tag}.png', clip={'x': 100, 'y': 130, 'width': 640, 'height': 540})
    b.close()
