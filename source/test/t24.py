# v16: точный ластик режет фигуры и линии ровно по кругу; пунктир не меняется при отпускании; масштаб снизу; без автопрокрутки при рисовании
from playwright.sync_api import sync_playwright
import math
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1200, 'height': 760})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Мира', eraserPrecise: true}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v16t-ests-tst1'); pg.wait_for_function('() => window.__doska')
    D = '() => [...window.__doska.items.values()].map(i => i.type + (i.kind ? ":" + i.kind : ""))'
    def drag(pts, steps=6):
        pg.mouse.move(*pts[0]); pg.mouse.down()
        for q in pts[1:]: pg.mouse.move(*q, steps=steps)
        pg.mouse.up(); pg.wait_for_timeout(80)
    # фигуры
    pg.keyboard.press('KeyR'); drag([(200, 200), (400, 330)]); pg.mouse.click(1000, 700)
    pg.keyboard.press('KeyO'); drag([(500, 200), (700, 330)]); pg.mouse.click(1000, 700)
    pg.evaluate('() => window.__doska.setTool("fig:cube")'); drag([(800, 180), (980, 360)]); pg.mouse.click(1000, 700)
    pg.keyboard.press('KeyA'); drag([(200, 450), (500, 450)])
    pg.keyboard.press('KeyD'); drag([(600, 450), (700, 520), (800, 440), (900, 520)], steps=10)
    before = pg.evaluate(D); print('before', before)
    pg.screenshot(path=OUT + 'v16-before.png')
    pg.keyboard.press('KeyE')
    r = pg.evaluate('() => { const d = window.__doska; return 28; }')
    # стираем верхнюю сторону прямоугольника посередине, правую часть эллипса, ребро куба, середину стрелки и пунктира
    for path in [[(300, 200), (300, 205)], [(700, 265), (700, 268)], [(890, 180), (890, 200)], [(350, 450), (352, 450)], [(750, 480), (752, 482)]]:
        drag(path, steps=3)
    after = pg.evaluate(D); print('after', after)
    pg.screenshot(path=OUT + 'v16-after.png')
    # точность: у прямоугольника разрез точно по кругу (радиус ластика + полутолщина)
    info = pg.evaluate('''() => { const d = window.__doska; return [...d.items.values()].filter(i => i.type === 'poly').map(i => [i.x, i.y, i.size, JSON.stringify(i.pts.slice(0,1)), JSON.stringify(i.pts.slice(-1))]).slice(0, 2); }''')
    print('rect pieces', info)
    er = pg.evaluate("() => JSON.parse(localStorage.getItem('doska:prefs')).size.eraser")
    print('eraser size', er)
    pg.keyboard.press('Control+z'); print('undo restores', pg.evaluate(D) == before or len(pg.evaluate(D)))
    # пунктир: до и после отпускания совпадает
    pg.keyboard.press('KeyD')
    pts = [(200 + i * 6, 620 + 40 * math.sin(i / 6)) for i in range(70)]
    pg.mouse.move(*pts[0]); pg.mouse.down()
    for q in pts[1:]: pg.mouse.move(*q)
    pg.wait_for_timeout(60)
    clip = {'x': 150, 'y': 560, 'width': 520, 'height': 130}
    pg.screenshot(path=OUT + 'dash-live.png', clip=clip)
    pg.mouse.up(); pg.wait_for_timeout(120)
    pg.screenshot(path=OUT + 'dash-final.png', clip=clip)
    # без автопрокрутки при рисовании у края
    v0 = pg.evaluate('() => ({...window.__doska.S.view})')
    pg.keyboard.press('KeyP'); pg.mouse.move(600, 600); pg.mouse.down(); pg.mouse.move(1198, 600, steps=10); pg.wait_for_timeout(400); pg.mouse.up()
    v1 = pg.evaluate('() => ({...window.__doska.S.view})'); print('view moved while drawing at edge:', round(v1['x'] - v0['x']))
    # масштаб снизу
    pg.click('.zoombar .tbtn >> nth=1'); print('zoom +:', pg.text_content('.zoombar .zoom'))
    pg.click('.zoombar .tbtn >> nth=0'); pg.click('.zoombar .tbtn >> nth=0'); print('zoom −−:', pg.text_content('.zoombar .zoom'))
    pg.keyboard.press('Control+0'); print('ctrl+0:', pg.text_content('.zoombar .zoom'))
    pg.keyboard.press('Control+Equal'); print('ctrl+=:', pg.text_content('.zoombar .zoom'))
    pg.screenshot(path=OUT + 'v16-zoombar.png')
    print('errors', errs); b.close()
