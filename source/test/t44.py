from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude-doska/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/show/'
URL = 'file:///home/claude/board/dist/doska.html#r=v29r-olee-0003'
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for pos, vp in [('top', (1600, 900)), ('bottom', (1600, 900)), ('left', (1300, 900)), ('top', (1024, 768))]:
        ctx = b.new_context(viewport={'width': vp[0], 'height': vp[1]}, device_scale_factor=1)
        ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0, barPos: '%s'}))" % pos)
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(URL); pg.wait_for_timeout(2500)
        pg.screenshot(path=OUT + f'bar-{pos}-{vp[0]}.png')
        # пересечения панели и масштаба
        r = pg.evaluate("() => { const a = document.querySelector('.toolbar').getBoundingClientRect(), z = document.querySelector('.zoombar').getBoundingClientRect(); return {tb: [a.left, a.top, a.right, a.bottom].map(Math.round), zoom: [z.left, z.top, z.right, z.bottom].map(Math.round), overlap: !(a.right < z.left || z.right < a.left || a.bottom < z.top || z.bottom < a.top)}; }")
        print(pos, vp, r)
        ctx.close()
    # цвета в окне толщины + undo из нижнего угла
    ctx = b.new_context(viewport={'width': 1600, 'height': 900})
    ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}))")
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.goto(URL); pg.wait_for_timeout(2500)
    pg.mouse.move(800, 500); pg.mouse.down(); pg.mouse.move(900, 560, steps=8); pg.mouse.up(); pg.wait_for_timeout(100)
    n = lambda: pg.evaluate("() => [...window.__doska.items.values()].filter(i => i.type === 'stroke').length") if pg.evaluate("() => !!(window.__doska && window.__doska.items)") else None
    print('strokes after draw:', n())
    pg.click('.urbar > .tbtn:nth-child(1)'); pg.wait_for_timeout(100); print('after undo:', n())
    pg.click('.urbar > .tbtn:nth-child(2)'); pg.wait_for_timeout(100); print('after redo:', n())
    pen = pg.query_selector('.toolbar .tbtn[data-grp="size:pen"]'); pen.click(); pg.wait_for_timeout(200)
    pg.screenshot(path=OUT + 'pen-pop.png', clip={'x': 300, 'y': 0, 'width': 1100, 'height': 330})
    pg.click('.sz-colors .cbtn[data-c="#e03131"]'); pg.wait_for_timeout(150)
    print('pop still open:', pg.query_selector('.sz-colors') is not None, '| on:', pg.evaluate("() => document.querySelector('.sz-colors .cbtn.on')?.dataset.c"), '| pen color:', pg.evaluate("() => JSON.parse(localStorage.getItem('doska:prefs')).penColor"))
    print('errors', errs); b.close()
