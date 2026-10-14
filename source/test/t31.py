# v22: линия — рамка и залитые палочки без квадратиков; сторону можно тянуть по всей длине; точка вершины ровно на вершине
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude-doska/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/show/'
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1100, 'height': 760}, device_scale_factor=2)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Тест'}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v22t-ests-0001'); pg.wait_for_function('() => window.__doska')
    pg.evaluate("() => { const st = document.createElement('style'); st.textContent = '.selbar{display:none!important}'; document.head.append(st); }")
    D = lambda: pg.evaluate('() => [...window.__doska.items.values()]')
    cur = lambda: pg.evaluate('() => document.getElementById("cv-over").style.cursor')
    def drag(a, bb, steps=6): pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move(*bb, steps=steps); pg.mouse.up(); pg.wait_for_timeout(80)
    # линия
    pg.keyboard.press('KeyL'); drag((150, 150), (650, 152)); pg.keyboard.press('KeyV')
    ln = D()[-1]; pg.evaluate(f'() => {{ window.__doska.S.sel = new Set(["{ln["id"]}"]); }}'); pg.mouse.move(900, 600); pg.wait_for_timeout(100)
    pg.screenshot(path=OUT + 'n-line.png', clip={'x': 110, 'y': 100, 'width': 590, 'height': 110})
    # конец линии: курсор скрыт, на конце — точка
    e = pg.evaluate(f"() => window.__doska.toScreen({ln['x']} + {ln['x2']}, {ln['y']} + {ln['y2']})")
    pg.mouse.move(e[0] - 4, e[1] + 3); pg.wait_for_timeout(100); print('cursor over line end:', cur())
    pg.screenshot(path=OUT + 'n-line-end.png', clip={'x': 520, 'y': 100, 'width': 180, 'height': 110})
    # растянуть линию за правую палочку — не за саму палочку, а за сторону рамки
    x1 = e[0] + 2 + 14
    print('cursor on right side:', 'svg' in cur() or cur())
    drag((x1, e[1] - 1), (x1 + 80, e[1]))
    ln2 = D()[-1]; print('line stretched:', round(ln['x2']), '→', round(ln2['x2']))
    # прямоугольник: сторона по всей длине
    pg.mouse.click(900, 600); pg.keyboard.press('KeyR'); drag((200, 300), (500, 480))
    r = D()[-1]; print('view', pg.evaluate('() => window.__doska.S.view'), r['w'], r['h'])
    rx0, ry0 = pg.evaluate(f"() => window.__doska.toScreen({r['x']}, {r['y']})"); rx1, ry1 = pg.evaluate(f"() => window.__doska.toScreen({r['x'] + r['w']}, {r['y'] + r['h']})")
    P = 2 + 14
    pg.mouse.move(rx0 + 40, ry0 - P); pg.wait_for_timeout(60); c1 = cur()
    drag((rx0 + 40, ry0 - P), (rx0 + 40, ry0 - P - 40))
    r2 = D()[-1]; print('top edge grabbed far from pill:', 'svg' in c1, '| h', round(r['h']), '→', round(r2['h']))
    pg.mouse.move(900, 600); pg.wait_for_timeout(80)
    pg.screenshot(path=OUT + 'n-rect.png', clip={'x': 150, 'y': 200, 'width': 400, 'height': 330})
    v = pg.evaluate(f"() => window.__doska.toScreen({r2['x']}, {r2['y']} + 0)")
    pg.mouse.move(v[0] + 4, v[1] + 4); pg.wait_for_timeout(100); print('cursor over vertex:', cur())
    pg.screenshot(path=OUT + 'n-rect-vertex.png', clip={'x': 150, 'y': 200, 'width': 400, 'height': 330})
    pg.mouse.down(); pg.mouse.move(v[0] - 30, v[1] - 20, steps=5); pg.wait_for_timeout(60)
    pg.screenshot(path=OUT + 'n-rect-drag.png', clip={'x': 120, 'y': 170, 'width': 430, 'height': 360}); pg.mouse.up()
    # треугольник и куб
    pg.mouse.click(900, 600); pg.evaluate('() => window.__doska.setTool("fig:triangle")'); pg.mouse.click(750, 400); pg.mouse.move(900, 600); pg.wait_for_timeout(80)
    pg.screenshot(path=OUT + 'n-tri.png', clip={'x': 630, 'y': 280, 'width': 240, 'height': 240})
    pg.mouse.click(900, 600); pg.evaluate('() => window.__doska.setTool("fig:cube")'); pg.mouse.click(780, 620); pg.mouse.move(900, 600); pg.wait_for_timeout(80)
    pg.screenshot(path=OUT + 'n-cube.png', clip={'x': 660, 'y': 490, 'width': 240, 'height': 265})
    print('errors', errs); b.close()
