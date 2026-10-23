from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1200, 'height': 760}, device_scale_factor=1.5)
    ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0, size: {pen: 3.5, hl: 20, eraser: 28, text: 28}}))")
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v29r-olee-0240'); pg.wait_for_timeout(2500)
    def drag(a, c, steps=10):
        pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move(*c, steps=steps); pg.mouse.up(); pg.wait_for_timeout(120)
    for i, t in enumerate(['arrow', 'darrow', 'arrow2', 'arrowin']):
        pg.evaluate(f"() => window.__doska.setTool('{t}')"); drag((250 + i * 160, 550), (250 + i * 160, 300)); pg.keyboard.press('Escape')
    print(pg.evaluate("() => [...window.__doska.items.values()].map(i => [i.type, i.heads || '', !!i.dash, i.size])"))
    # окно фигур
    shp = pg.query_selector('.toolbar [data-grp="shapes"]').bounding_box()
    pg.mouse.move(shp['x'] + 10, shp['y'] + 10); pg.mouse.move(shp['x'] + 20, shp['y'] + 20, steps=2); pg.wait_for_timeout(400)
    pg.screenshot(path=OUT + 'arrows.png')
    pg.keyboard.press('Escape'); pg.mouse.move(600, 700); pg.wait_for_timeout(500); pg.screenshot(path=OUT + 'arrows-canvas.png', clip={'x': 180, 'y': 260, 'width': 700, 'height': 320})
    # толщина фигур не следует за ручкой
    pg.evaluate("() => window.__doska.setTool('pen')"); pg.wait_for_timeout(100)
    before = pg.evaluate("() => JSON.parse(localStorage.getItem('doska:prefs')).shapeSize")
    pg.keyboard.press('Escape')
    pen = pg.query_selector('.toolbar [data-grp="size:pen"]'); pen.click(); pg.wait_for_timeout(200); pg.click('.sz-pop .sz-chip[data-v="10"]'); pg.wait_for_timeout(100)
    pg.evaluate("() => window.__doska.setTool('rect')"); drag((900, 200), (1000, 260)); pg.keyboard.press('Escape')
    last = pg.evaluate("() => { const a = [...window.__doska.items.values()]; return a[a.length - 1].size; }")
    print('shapeSize before', before, '| pen now', pg.evaluate("() => JSON.parse(localStorage.getItem('doska:prefs')).size.pen"), '| new rect size', last)
    print(errs); b.close()
