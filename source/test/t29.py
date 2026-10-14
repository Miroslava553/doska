# v20: стереометрия — 3D-модели: вид, поворот на доске, поворот в пространстве, вершины, отмена, ластик
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude-doska/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1300, 'height': 800})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Тест'}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=sol3-dtes-0001'); pg.wait_for_function('() => window.__doska')
    kinds = ['cube', 'tetra', 'pyramid', 'rpyramid', 'prism', 'cylinder', 'cone', 'sphere']
    for k, kind in enumerate(kinds):
        pg.evaluate(f'() => window.__doska.setTool("fig:{kind}")')
        x, y = 170 + (k % 4) * 300, 230 + (k // 4) * 300
        pg.mouse.click(x, y); pg.wait_for_timeout(60); pg.keyboard.press('Escape')
    pg.mouse.move(1290, 790); pg.wait_for_timeout(150); pg.screenshot(path=OUT + 'solids-all.png')
    item = lambda kind: pg.evaluate(f'() => [...window.__doska.items.values()].find(i => i.kind === "{kind}")')
    def select(kind):
        it = item(kind); pg.keyboard.press('KeyV')
        pg.evaluate(f'() => {{ const d = window.__doska; d.S.sel = new Set(["{it["id"]}"]); d.setTool("select", {{noToggle: true}}); }}')
        pg.evaluate(f'() => {{ const d = window.__doska; d.S.sel = new Set(["{it["id"]}"]); }}')
        pg.mouse.move(650, 770); pg.wait_for_timeout(80)  # не у края экрана — иначе доска поедет
        return it
    def scr(wx, wy): return pg.evaluate(f'() => window.__doska.toScreen({wx}, {wy})')
    # пирамида: поворот на доске за стрелку у правого верхнего угла
    it = select('pyramid'); s = it.get('s', 1)
    x0, y0 = scr(it['x'], it['y']); x1, y1 = scr(it['x'] + it['w'] * s, it['y'] + it['h'] * s)
    pg.screenshot(path=OUT + 'solid-handles.png', clip={'x': x0 - 70, 'y': y0 - 70, 'width': x1 - x0 + 140, 'height': y1 - y0 + 150})
    rx, ry = x1 + 3 + 22, y0 - 3 - 22
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    pg.mouse.move(rx, ry); pg.mouse.down(); pg.mouse.move(rx + 60, ry + 80, steps=8); pg.mouse.up(); pg.wait_for_timeout(80)
    it2 = item('pyramid'); print('roll after drag:', it2.get('roll'), '| w×h', round(it['w']), round(it['h']), '→', round(it2['w']), round(it2['h']))
    # поворот в пространстве — ручка снизу
    it = item('cube'); select('cube'); s = it.get('s', 1)
    x0, y0 = scr(it['x'], it['y']); x1, y1 = scr(it['x'] + it['w'] * s, it['y'] + it['h'] * s)
    ox, oy = (x0 + x1) / 2, y1 + 3 + 40
    pg.mouse.move(ox, oy); pg.mouse.down(); pg.mouse.move(ox + 70, oy + 30, steps=8); pg.mouse.up(); pg.wait_for_timeout(80)
    it2 = item('cube'); print('cube yaw/pitch:', it2.get('yaw'), it2.get('pitch'))
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(80); it3 = item('cube'); print('undo → yaw', it3.get('yaw'))
    pg.keyboard.press('Control+y'); pg.wait_for_timeout(80)
    # вершина: вершина пирамиды (S) тянется вправо
    it = item('tetra'); select('tetra')
    hv = pg.evaluate(f'''() => {{ const d = window.__doska; const it = d.items.get("{it['id']}"); return null; }}''')
    s = it.get('s', 1); x0, y0 = scr(it['x'], it['y']); x1, y1 = scr(it['x'] + it['w'] * s, it['y'] + it['h'] * s)
    # вершина S — самая верхняя точка рамки; ищем точку ручки около верхнего края
    apex_x = pg.evaluate(f'''() => {{ const c = document.getElementById('cv-over'); const ctx = c.getContext('2d'); const y = Math.round({y0} + 1) * devicePixelRatio; let best = null;
      for (let x = Math.round({x0}); x < {x1}; x++) {{ const px = ctx.getImageData(x * devicePixelRatio, y, 1, 1).data; if (px[2] > 200 && px[0] < 120) {{ best = x; break; }} }} return best; }}''')
    print('apex handle near x:', apex_x)
    if apex_x:
        pg.mouse.move(apex_x + 4, y0 + 1); pg.mouse.down(); pg.mouse.move(apex_x + 90, y0 + 40, steps=8); pg.mouse.up(); pg.wait_for_timeout(80)
        it2 = item('tetra'); print('tetra has m:', bool(it2.get('m')), '| w', round(it['w']), '→', round(it2['w']))
    pg.mouse.move(1290, 790); pg.keyboard.press('Escape'); pg.wait_for_timeout(100); pg.screenshot(path=OUT + 'solids-edited.png')
    # правильная форма у искажённой
    select('tetra'); pg.wait_for_timeout(100)
    if pg.locator('.selbar [data-tip^="Правильная форма"]').count():
        pg.click('.selbar [data-tip^="Правильная форма"]'); pg.wait_for_timeout(80); print('regular → m:', item('tetra').get('m'))
    # ластик по кубу
    pg.keyboard.press('Escape'); pg.evaluate("() => { localStorage.setItem('doska:prefs', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('doska:prefs')), {eraserPrecise: true}))); }")
    print('errors', errs); b.close()
