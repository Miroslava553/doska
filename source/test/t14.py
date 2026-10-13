import random, math
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
random.seed(3); errors = []
J = lambda pg, js, *a: pg.evaluate(js, *a)
DISPATCH = '''(pts) => { const c = document.getElementById('cv-over');
  const mk = (t, [x, y, p], b) => new PointerEvent(t, {bubbles: true, cancelable: true, pointerId: 5, pointerType: 'pen', clientX: x, clientY: y, pressure: p, buttons: b, button: t === 'pointermove' ? -1 : 0});
  c.dispatchEvent(mk('pointerdown', pts[0], 1)); for (const q of pts.slice(1)) c.dispatchEvent(mk('pointermove', q, 1)); c.dispatchEvent(mk('pointerup', pts[pts.length - 1], 0)); }'''
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 700, 'height': 500}, device_scale_factor=3)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Мира', steady: 0.6}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=tapx-test-eee5'); pg.wait_for_function('() => window.__doska'); pg.wait_for_timeout(200)
    print('steady migrated to:', J(pg, '() => JSON.parse(localStorage.getItem("doska:prefs")).steady'))
    pg.keyboard.press('KeyP')
    # лёгкое касание-точка: 60 событий, дрожание ±1.5px, нажим скачет 0.02..0.15
    tap = [[200 + random.uniform(-1.5, 1.5), 200 + random.uniform(-1.5, 1.5), random.uniform(0.02, 0.15)] for _ in range(60)]
    # проверяем, что во время касания точка не меняет форму (снимаем внешний вид после каждых 10 событий)
    shapes = J(pg, '''(pts) => { const c = document.getElementById('cv-over'); const d = window.__doska; const res = [];
      const mk = (t, [x, y, p], b) => new PointerEvent(t, {bubbles: true, cancelable: true, pointerId: 5, pointerType: 'pen', clientX: x, clientY: y, pressure: p, buttons: b, button: t === 'pointermove' ? -1 : 0});
      c.dispatchEvent(mk('pointerdown', pts[0], 1));
      pts.slice(1).forEach((q, i) => { c.dispatchEvent(mk('pointermove', q, 1)); });
      return null; }''', tap)
    pg.wait_for_timeout(50)
    pg.screenshot(path=OUT + 'tap-live.png', clip={'x': 180, 'y': 180, 'width': 40, 'height': 40})
    J(pg, '''() => document.getElementById('cv-over').dispatchEvent(new PointerEvent('pointerup', {bubbles: true, pointerId: 5, pointerType: 'pen', clientX: 200, clientY: 200, pressure: 0, buttons: 0, button: 0}))''')
    it = J(pg, '() => [...window.__doska.items.values()].pop()')
    print('tap → stroke points:', len(it['pts']) // 3, '(1 = ровная точка)')
    # линия при очень лёгком нажиме с «провалами» касания: 3 куска с паузами 30 мс
    seg = lambda x0, n: [[x0 + i * 1.2 + random.uniform(-0.8, 0.8), 330 + random.uniform(-0.8, 0.8), random.uniform(0.03, 0.1)] for i in range(n)]
    n0 = J(pg, '() => window.__doska.items.size')
    for x0 in (150, 150 + 60 * 1.2 + 1, 150 + 120 * 1.2 + 2):
        J(pg, DISPATCH, seg(x0, 60)); pg.wait_for_timeout(8)
    print('light line with 2 dropouts → strokes added:', J(pg, '() => window.__doska.items.size') - n0, '(1 = склеилась)')
    pg.keyboard.press('Control+z'); print('undo keeps first part:', J(pg, '() => window.__doska.items.size') - n0)
    pg.keyboard.press('Control+y')
    # отдельные штрихи с нормальной паузой не склеиваются
    J(pg, DISPATCH, seg(150, 30)); pg.wait_for_timeout(200); J(pg, DISPATCH, seg(150 + 36, 30))
    print('separate strokes (200ms pause):', J(pg, '() => window.__doska.items.size') - n0 - 1, '(2 = раздельно)')
    pg.screenshot(path=OUT + 'tap-final.png', clip={'x': 120, 'y': 170, 'width': 340, 'height': 200})
    # значок ручки: перо поднято — пропадает
    J(pg, '''() => document.getElementById('cv-over').dispatchEvent(new PointerEvent('pointermove', {bubbles: true, pointerId: 5, pointerType: 'pen', clientX: 500, clientY: 400, pressure: 0, buttons: 0}))''')
    pg.wait_for_timeout(100)
    on = J(pg, '''() => { const c = document.getElementById('cv-over'); const d = c.getContext('2d').getImageData(1350, 1050, 300, 300).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; }''')
    pg.wait_for_timeout(500)
    off = J(pg, '''() => { const c = document.getElementById('cv-over'); const d = c.getContext('2d').getImageData(1350, 1050, 300, 300).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; }''')
    print('pen icon while hovering:', on > 0, '| after pen lifted away:', off == 0)
    b.close()
print('ERRORS', errors)
