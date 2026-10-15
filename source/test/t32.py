# v23: один щелчок — рамка без точек; двойной — правка формы: точки, сторона тянется целиком
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude-doska/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/show/'
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1100, 'height': 760}, device_scale_factor=2)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Тест'}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v23t-ests-0001'); pg.wait_for_function('() => window.__doska')
    D = lambda: pg.evaluate('() => [...window.__doska.items.values()]')
    cur = lambda: pg.evaluate('() => document.getElementById("cv-over").style.cursor')
    TS = lambda x, y: pg.evaluate(f"() => window.__doska.toScreen({x}, {y})")
    def drag(a, bb, steps=6): pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move(*bb, steps=steps); pg.mouse.up(); pg.wait_for_timeout(80)
    pg.evaluate('() => window.__doska.setTool("fig:parallelogram")'); drag((250, 250), (550, 420))
    it = D()[-1]; print('created', it['type'], it.get('kind'), 'sel', pg.evaluate('() => [...window.__doska.S.sel]'))
    pg.mouse.move(950, 650); pg.wait_for_timeout(120)
    pg.screenshot(path=OUT + 's-frame.png', clip={'x': 170, 'y': 140, 'width': 480, 'height': 340})
    # двойной щелчок по верхней стороне
    x0, y0 = TS(it['x'], it['y']); x1, y1 = TS(it['x'] + it['w'], it['y'] + it['h'])
    top = (x0 + (x1 - x0) * 0.55, y0 + 1)
    pg.mouse.dblclick(*top); pg.wait_for_timeout(120)
    print('shape mode:', pg.evaluate('() => window.__doska.S.shapeEdit') == it['id'])
    pg.mouse.move(top[0], top[1] + 2); pg.wait_for_timeout(120); print('hover edge:', pg.evaluate('() => window.__doska.S.hoverShape'), 'svg' in cur())
    pg.screenshot(path=OUT + 's-edit-hover.png', clip={'x': 170, 'y': 140, 'width': 480, 'height': 340})
    before = D()[-1]
    pg.mouse.down(); pg.mouse.move(top[0] + 70, top[1] - 30, steps=6); pg.wait_for_timeout(60)
    pg.screenshot(path=OUT + 's-edit-drag.png', clip={'x': 170, 'y': 100, 'width': 520, 'height': 380}); pg.mouse.up(); pg.wait_for_timeout(100)
    a = D()[-1]
    W = lambda q: [[round(q['x'] + x * (q.get('s') or 1)), round(q['y'] + y * (q.get('s') or 1))] for x, y in q['pts']]
    print('after:', a['type'], a.get('fk'), W(a), 'still shape:', pg.evaluate('() => window.__doska.S.shapeEdit') == it['id'])
    pg.keyboard.press('Escape'); pg.wait_for_timeout(80)
    print('esc → frame, still selected:', pg.evaluate('() => [window.__doska.S.shapeEdit, window.__doska.S.sel.size]'))
    pg.mouse.move(950, 650); pg.wait_for_timeout(100)
    pg.screenshot(path=OUT + 's-after.png', clip={'x': 170, 'y': 100, 'width': 520, 'height': 380})
    # куб: двойной щелчок, ребро
    pg.mouse.click(950, 650); pg.evaluate('() => window.__doska.setTool("fig:cube")'); pg.mouse.click(820, 560); pg.wait_for_timeout(80)
    c = D()[-1]; cx0, cy0 = TS(c['x'], c['y']); cx1, cy1 = TS(c['x'] + c['w'], c['y'] + c['h'])
    pg.mouse.move(1000, 700); pg.wait_for_timeout(80)
    pg.screenshot(path=OUT + 's-cube-frame.png', clip={'x': cx0 - 60, 'y': cy0 - 60, 'width': cx1 - cx0 + 120, 'height': cy1 - cy0 + 130})
    pg.mouse.dblclick((cx0 + cx1) / 2, (cy0 + cy1) / 2); pg.wait_for_timeout(100)
    print('cube shape mode:', pg.evaluate('() => window.__doska.S.shapeEdit') == c['id'])
    pg.mouse.move(1000, 700); pg.wait_for_timeout(80)
    pg.screenshot(path=OUT + 's-cube-edit.png', clip={'x': cx0 - 60, 'y': cy0 - 60, 'width': cx1 - cx0 + 120, 'height': cy1 - cy0 + 130})
    print('errors', errs); b.close()
