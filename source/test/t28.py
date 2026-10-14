# v20: окна у кнопок не закрываются щелчком; толщина фигур в меню фигур; ластик рядом с ручкой; панель слева; без «позвать»
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude-doska/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1200, 'height': 760})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Тест'}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v20t-ests-0001'); pg.wait_for_function('() => window.__doska')
    pops = lambda: pg.locator('.pop').count()
    print('order:', [x for x in pg.locator('.toolbar > .tbtn').evaluate_all('els => els.map(e => e.dataset.tip)')][:6])
    print('summon button present:', pg.locator('[data-tip^="Позвать"]').count())
    # фигуры: навели — открылось; щёлкнули — осталось открытым; ещё щелчок — открыто; увели — закрылось; снова навели — открылось
    g = pg.locator('.toolbar .tbtn.grp').first; bb = g.bounding_box(); cx, cy = bb['x'] + 18, bb['y'] + 18
    pg.mouse.move(cx, cy); pg.wait_for_timeout(200); o1 = pops()
    pg.mouse.click(cx, cy); pg.wait_for_timeout(100); o2 = pops(); tool = pg.evaluate('() => window.__doska.S.tool')
    pg.mouse.click(cx, cy); pg.wait_for_timeout(100); o3 = pops()
    pg.mouse.move(cx, 600, steps=1); pg.wait_for_timeout(60); o4 = pops()
    pg.mouse.move(cx, cy); pg.wait_for_timeout(200); o5 = pops()
    print('shapes pop: hover', o1, '| click', o2, tool, '| click again', o3, '| leave', o4, '| hover again', o5)
    # толщина фигур
    pg.evaluate('() => { const r = document.querySelector(".shape-size .sz-range"); r.value = 10; r.dispatchEvent(new Event("input")); r.dispatchEvent(new Event("change")); }'); pg.wait_for_timeout(50)
    print('tool after slider:', pg.evaluate('() => window.__doska.S.tool'))
    pg.mouse.move(600, 600); pg.mouse.move(300, 300); pg.mouse.down(); pg.mouse.move(500, 420, steps=5); pg.mouse.up()
    it = pg.evaluate('() => [...window.__doska.items.values()].pop()'); print('rect size', it['size'], '| pen size unchanged', pg.evaluate("() => JSON.parse(localStorage.getItem('doska:prefs')).size.pen"))
    pg.mouse.click(900, 650); pg.wait_for_timeout(60)
    pg.keyboard.press('KeyR'); pg.mouse.move(600, 300); pg.mouse.down(); pg.mouse.move(800, 420, steps=5); pg.mouse.up()
    it = pg.evaluate('() => [...window.__doska.items.values()].pop()'); print('next time rect chosen → size back to pen:', it['size'])
    # перо: навели — открылось; щелчок — инструмент выбран, окно открыто
    pen = pg.locator('.toolbar .tbtn[data-tip^="Перо"]').bounding_box(); px, py = pen['x'] + 18, pen['y'] + 18
    pg.mouse.move(900, 650); pg.mouse.click(900, 650); pg.mouse.move(px, py); pg.wait_for_timeout(200); a1 = pops()
    pg.mouse.click(px, py); pg.wait_for_timeout(100); print('pen pop: hover', a1, '| after click', pops(), pg.evaluate('() => window.__doska.S.tool'))
    pg.mouse.move(600, 600); pg.wait_for_timeout(60)
    # панель слева
    pg.click('.tl .tbtn >> nth=0'); pg.wait_for_timeout(150); pg.click('text=Слева'); pg.wait_for_timeout(200)
    tb = pg.locator('.toolbar').bounding_box(); g = pg.locator('.toolbar .tbtn.grp').first; g.hover(); pg.wait_for_timeout(250)
    pb = pg.locator('.pop').bounding_box(); gb = g.bounding_box()
    print('left bar', round(tb['x']), round(tb['y']), round(tb['width']), round(tb['height']), '| menu right of button:', pb['x'] >= gb['x'] + gb['width'])
    pg.screenshot(path=OUT + 'bar-left.png')
    zb = pg.locator('.zoombar').bounding_box(); print('zoom bottom gap:', round(760 - zb['y'] - zb['height']))
    print('errors', errs); b.close()
