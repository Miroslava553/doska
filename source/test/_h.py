from playwright.sync_api import sync_playwright
import time
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1300, 'height': 800})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'student', roleFirst: 1, roleAt: 0, eraserPrecise: true}));")
    pg.goto('file:///home/claude/board/dist/site/index.html#r=hang-aaaa-bbbb'); pg.wait_for_timeout(2500)
    pg.keyboard.press('p')
    for k in range(15):
        pg.mouse.move(200, 150 + k * 30); pg.mouse.down()
        for i in range(40): pg.mouse.move(200 + i * 20, 150 + k * 30 + (i % 5) * 4)
        pg.mouse.up()
    print('линий', pg.evaluate("() => window.__doska.items.size"), pg.evaluate("() => document.querySelector('.tr')?.innerText.replace(/\\n/g,' | ')"))
    pg.keyboard.press('e')
    for rnd in range(6):
        t = time.time(); pg.mouse.move(150, 120); pg.mouse.down()
        for i in range(60): pg.mouse.move(150 + i * 15, 120 + (i * 7) % 450)
        pg.mouse.up()
        lag = pg.evaluate("() => new Promise(r => { const t = performance.now(); setTimeout(() => r(performance.now() - t), 0); })")
        print(rnd, 'проход', round(time.time() - t, 2), 'с; задержка', round(lag), 'мс; объектов', pg.evaluate("() => window.__doska.items.size"), errs[:2])
    b.close()
