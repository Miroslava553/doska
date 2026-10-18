from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude-doska/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/show/'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1300, 'height': 850})
    ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}))")
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v29r-olee-0045'); pg.wait_for_timeout(2500)
    def drag(a, c, steps=10):
        pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move(*c, steps=steps); pg.mouse.up(); pg.wait_for_timeout(120)
    last = lambda: pg.evaluate("() => { const a = [...window.__doska.items.values()]; const it = a[a.length - 1]; return { id: it.id, type: it.type, kind: it.kind, s: it.s, size: it.size, w: it.w, h: it.h, flip: it.flip, x: it.x, y: it.y }; }")
    pg.evaluate('() => window.__doska.setTool("fig:parallelogram")'); drag((300, 300), (340, 330))
    a = last(); print('small:', a)
    # угол рамки выделения — нижний правый
    sel = pg.evaluate("() => [...window.__doska.S.sel]"); print('sel', sel)
    pg.screenshot(path=OUT + 'selbar.png', clip={'x': 0, 'y': 150, 'width': 1300, 'height': 250})
    drag((353, 343), (753, 643), 20)
    b2 = last(); print('enlarged:', b2)
    pg.screenshot(path=OUT + 'enlarged.png')
    # отражение
    btns = pg.evaluate("() => [...document.querySelectorAll('.selbar button')].map(b => b.getAttribute('aria-label') || b.dataset.tip || b.title || b.textContent)")
    print('selbar buttons:', btns)
    pg.click('.selbar button[title="Отразить"], .selbar button[data-tip="Отразить"]') if pg.query_selector('.selbar button[title="Отразить"], .selbar button[data-tip="Отразить"]') else pg.locator('.selbar button').nth(5).click()
    pg.wait_for_timeout(150); print('mirrored:', last()['flip'])
    pg.screenshot(path=OUT + 'mirrored.png')
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(100); print('undo mirror:', last()['flip'])
    # прямоугольный треугольник: значок прямого угла переходит вправо
    pg.keyboard.press('Escape')
    pg.evaluate('() => window.__doska.setTool("fig:rtriangle")'); drag((900, 150), (1100, 350))
    pg.locator('.selbar button').filter(has=pg.locator('svg')).count()
    btn = [i for i, t in enumerate(pg.evaluate("() => [...document.querySelectorAll('.selbar button')].map(b => b.title || b.dataset.tip || b.getAttribute('aria-label') || '')")) if 'Отразить' in t]
    pg.locator('.selbar button').nth(btn[0]).click(); pg.wait_for_timeout(150)
    pg.screenshot(path=OUT + 'rtri-mirror.png', clip={'x': 850, 'y': 100, 'width': 300, 'height': 300})
    print('errors', errs); b.close()
