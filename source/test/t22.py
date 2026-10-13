# v14: выделение после фигуры → щелчок по пустому → ручка; толщина в панели; регулятор у своего инструмента
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1200, 'height': 760})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Мира'}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v14t-ests-tst1'); pg.wait_for_function('() => window.__doska')
    st = lambda: pg.evaluate('() => [window.__doska.S.tool, window.__doska.S.sel.size]')
    def drag(x0, y0, x1, y1):
        pg.mouse.move(x0, y0); pg.mouse.down(); pg.mouse.move((x0+x1)/2, (y0+y1)/2, steps=4); pg.mouse.move(x1, y1, steps=4); pg.mouse.up(); pg.wait_for_timeout(60)
    n = lambda: pg.evaluate('() => window.__doska.items.size')
    pg.keyboard.press('KeyD'); pg.keyboard.press('KeyR'); drag(300, 200, 500, 320); print('after rect', st())
    print('size row in panel:', pg.locator('.selbar .isize').count())
    pg.screenshot(path=OUT + 'v14-panel.png')
    # двигаем фигуру — выделение остаётся
    drag(400, 200, 420, 220); print('after move', st())
    # слайдер в панели
    rng = pg.locator('.selbar .isize input')
    bb = rng.bounding_box(); pg.mouse.move(bb['x'] + 5, bb['y'] + bb['height']/2); pg.mouse.down()
    for f in [0.3, 0.5, 0.7]: pg.mouse.move(bb['x'] + bb['width']*f, bb['y'] + bb['height']/2, steps=3)
    pg.mouse.up(); pg.wait_for_timeout(50)
    sz = pg.evaluate('() => [...window.__doska.items.values()][0].size'); print('rect size after slider', sz)
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(50)
    print('after one undo size', pg.evaluate('() => [...window.__doska.items.values()][0]?.size'), 'items', n())
    pg.keyboard.press('Control+y')
    k0 = n(); pg.mouse.click(800, 500); pg.wait_for_timeout(50); print('click empty ->', st(), 'items unchanged', n() == k0)
    drag(700, 500, 900, 520); print('drawing works', n() == k0 + 1, st())
    # выбранный вручную V: щелчок по пустому — остаётся выделение
    pg.keyboard.press('KeyV'); pg.mouse.click(800, 650); print('manual V click empty ->', st())
    # регулятор у пера: наведение
    pg.mouse.move(600, 600); pg.wait_for_timeout(500)
    pen = pg.locator('.toolbar .tbtn', has_text='P').first
    pen.hover(); pg.wait_for_timeout(450); print('pen pop open', pg.locator('.sz-pop').count())
    pg.screenshot(path=OUT + 'v14-penpop.png')
    print([t for t in pg.locator('.toolbar .tbtn').all_inner_texts()]); er = pg.locator('.toolbar .tbtn', has_text='E').first
    er.hover(); pg.wait_for_timeout(450); print('eraser pop open', pg.locator('.sz-pop').count(), pg.locator('.sz-pop .sz-modes').count(), er.get_attribute("data-tip"))
    pg.screenshot(path=OUT + 'v14-erpop.png')
    pg.locator('.sz-pop .sz-chip').nth(5).click(); print('eraser size', pg.evaluate("() => JSON.parse(localStorage.getItem('doska:prefs')).size.eraser"), st())
    pg.mouse.move(600, 600); pg.wait_for_timeout(700); print('closed after leave', pg.locator('.sz-pop').count())
    pg.keyboard.press('KeyR'); pg.locator('.tbtn.grp').first.hover(); pg.wait_for_timeout(450); pg.screenshot(path=OUT + 'v14-shapes.png')
    print('errors', errs); b.close()
