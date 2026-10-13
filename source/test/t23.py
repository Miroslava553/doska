# v15: панель над фигурой, «по умолчанию», цепочка фигура→выделение→фигура→ручка, без мигания заготовки, подсказки
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1200, 'height': 760})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Мира'}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v15t-ests-tst1'); pg.wait_for_function('() => window.__doska')
    st = lambda: pg.evaluate('() => window.__doska.S.tool')
    n = lambda: pg.evaluate('() => window.__doska.items.size')
    def drag(x0, y0, x1, y1):
        pg.mouse.move(x0, y0); pg.mouse.down(); pg.mouse.move(x1, y1, steps=8); pg.mouse.up(); pg.wait_for_timeout(80)
    pg.keyboard.press('KeyR'); drag(400, 300, 600, 420)
    bar = pg.locator('.selbar'); bb = bar.bounding_box()
    print('chain: after rect', st(), '| bar above rect:', bb['y'] + bb['height'] < 300, round(bb['x']), round(bb['y']), round(bb['width']))
    pg.screenshot(path=OUT + 'v15-bar.png')
    # слайдер, потом «по умолчанию»
    pg.evaluate('() => { const r = document.querySelector(".selbar .sz-range"); r.value = 12; r.dispatchEvent(new Event("input")); r.dispatchEvent(new Event("change")); }')
    sizeF = lambda: pg.evaluate('() => [...window.__doska.items.values()][0].size')
    print('size after slider', sizeF(), '| default btn disabled', pg.locator('.selbar .ibtn').first.is_disabled())
    pg.locator('.selbar .ibtn').first.click(); print('size after default', sizeF())
    # перетаскивание — панель прячется
    pg.mouse.move(500, 360); pg.mouse.down(); pg.mouse.move(540, 380, steps=4)
    print('bar hidden while moving', 'away' in bar.get_attribute('class'))
    pg.mouse.up(); pg.wait_for_timeout(80); print('bar back', 'away' not in bar.get_attribute('class'))
    k = n()
    pg.mouse.click(900, 600); pg.wait_for_timeout(50); print('click empty →', st())
    pg.mouse.click(900, 600); pg.wait_for_timeout(50); print('click empty again →', st(), '| nothing added', n() == k)
    # фигура из списка: при нажатии без движения — нет заготовки
    pg.evaluate('() => window.__doska.setTool("fig:eqtriangle")')
    pg.mouse.move(300, 600); pg.mouse.down(); pg.wait_for_timeout(100)
    px = pg.evaluate('''() => { const c = document.getElementById('cv-over'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let m = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) m++; return m; }''')
    print('overlay pixels on press (0 = no regular preview):', px)
    pg.mouse.move(380, 680, steps=6); pg.mouse.up(); pg.wait_for_timeout(50)
    it = pg.evaluate('() => [...window.__doska.items.values()].pop()'); print('custom fig', it['kind'], round(it['w']), round(it['h']))
    pg.mouse.click(900, 650); print('fig: click empty →', st())
    pg.evaluate('() => window.__doska.setTool("fig:square")'); pg.mouse.click(700, 600); pg.wait_for_timeout(50)
    it = pg.evaluate('() => [...window.__doska.items.values()].pop()'); print('click-placed', it['kind'], round(it['w']), round(it['h']))
    # подсказка
    pg.mouse.move(600, 650); pg.wait_for_timeout(200)
    pg.locator('.toolbar .tbtn').nth(1).hover(); pg.wait_for_timeout(700)
    tip = pg.locator('.tip.on'); print('tip:', tip.count(), tip.text_content() if tip.count() else '', '| native titles left in toolbar:', pg.locator('.toolbar [title]').count())
    pg.screenshot(path=OUT + 'v15-tip.png', clip={'x': 150, 'y': 0, 'width': 700, 'height': 200})
    # Space + движение без нажатия
    v0 = pg.evaluate('() => ({...window.__doska.S.view})')
    pg.mouse.move(600, 500); pg.keyboard.down('Space'); pg.mouse.move(650, 540, steps=5); pg.keyboard.up('Space')
    v1 = pg.evaluate('() => ({...window.__doska.S.view})'); print('space-move pan', round(v1['x'] - v0['x']), round(v1['y'] - v0['y']))
    # пере-выделение: панель над треугольником
    pg.keyboard.press('KeyV'); pg.mouse.click(340, 660); pg.wait_for_timeout(80); pg.screenshot(path=OUT + 'v15-bar2.png')
    print('errors', errs); b.close()
