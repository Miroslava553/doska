# v17: окна закрываются сразу; подсказка внизу справа; ластик по пунктиру не сдвигает штрихи
from playwright.sync_api import sync_playwright
import math
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
from PIL import Image, ImageChops
import numpy as np
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1200, 'height': 760})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Мира', eraserPrecise: true}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v17t-ests-tst1'); pg.wait_for_function('() => window.__doska')
    pops = lambda: pg.locator('.pop').count()
    btn = pg.locator('.toolbar .tbtn.grp').first.bounding_box()
    cx, cy = btn['x'] + btn['width'] / 2, btn['y'] + btn['height'] / 2
    pg.mouse.move(cx, cy); pg.wait_for_timeout(200); print('open on hover:', pops())
    pg.mouse.move(cx, cy + 200, steps=12); pg.wait_for_timeout(30); print('moved down into menu, still open:', pops())
    pg.mouse.move(cx, 700, steps=6); pg.wait_for_timeout(20); print('left menu → closed at once:', pops() == 0)
    pg.mouse.move(cx, cy, steps=5); pg.wait_for_timeout(200); pg.mouse.move(cx + 300, cy + 300, steps=3); pg.wait_for_timeout(20); print('left button sideways → closed:', pops() == 0)
    pen = pg.locator('.toolbar .tbtn[data-tip^="Перо"]').bounding_box()
    pg.mouse.move(pen['x'] + 10, pen['y'] + 10); pg.wait_for_timeout(200); print('pen size pop:', pops())
    pg.mouse.move(pen['x'] + 10, pen['y'] + 60, steps=8); pg.wait_for_timeout(30); print('into size pop, open:', pops())
    pg.mouse.move(600, 600, steps=4); pg.wait_for_timeout(20); print('closed:', pops() == 0)
    # подсказка
    pg.mouse.move(pen['x'] + 10, pen['y'] + 10); pg.wait_for_timeout(500)
    tb = pg.locator('.tip.on').bounding_box(); zb = pg.locator('.zoombar').bounding_box()
    print('tip bottom-right:', pg.locator('.tip.on').text_content(), round(tb['x'] + tb['width']), round(zb['x']), round(tb['y']), round(zb['y']))
    pg.screenshot(path=OUT + 'v17-tip.png')
    pg.mouse.move(600, 600); pg.wait_for_timeout(300)
    # пунктир + пунктирный прямоугольник: стереть середину, остальное не сдвигается
    pg.keyboard.press('KeyD'); pts = [(150 + i * 5, 450 + 50 * math.sin(i / 12)) for i in range(140)]
    pg.mouse.move(*pts[0]); pg.mouse.down()
    for q in pts[1:]: pg.mouse.move(*q)
    pg.mouse.up(); pg.wait_for_timeout(100)
    pg.keyboard.press('KeyR'); pg.mouse.move(250, 560); pg.mouse.down(); pg.mouse.move(700, 700, steps=6); pg.mouse.up(); pg.wait_for_timeout(80)
    pg.evaluate('() => { const d = window.__doska; for (const it of d.items.values()) if (it.type === "rect") d.act(() => d.doc.getMap("items").get(it.id).set("dash", true)); d.S.sel.clear(); }')
    pg.keyboard.press('Escape'); pg.mouse.move(1100, 300); pg.wait_for_timeout(200)
    clip = {'x': 100, 'y': 380, 'width': 750, 'height': 340}
    pg.screenshot(path=OUT + 'v17-dash-before.png', clip=clip)
    pg.keyboard.press('KeyE')
    E = [(420, 401), (520, 444), (300, 560), (560, 700)]
    for (x, y) in E: pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 2, y + 1, steps=2); pg.mouse.up(); pg.wait_for_timeout(60)
    pg.mouse.move(1100, 300); pg.wait_for_timeout(200)
    pg.screenshot(path=OUT + 'v17-dash-after.png', clip=clip)
    r = pg.evaluate("() => JSON.parse(localStorage.getItem('doska:prefs')).size.eraser") / 2
    a = np.asarray(Image.open(OUT + 'v17-dash-before.png').convert('L')).astype(int); c = np.asarray(Image.open(OUT + 'v17-dash-after.png').convert('L')).astype(int)
    H, W = a.shape; yy, xx = np.mgrid[0:H, 0:W]; mask = np.ones_like(a, bool)
    for (x, y) in E:
        for dx in (0, 2): mask &= np.hypot(xx + clip['x'] - (x + dx), yy + clip['y'] - y) > r + 6
    diff = (np.abs(a - c) > 40) & mask
    print('changed pixels outside eraser circles (0 = nothing moved):', int(diff.sum()), '| erased inside:', int(((np.abs(a - c) > 40) & ~mask).sum()))
    print(pg.evaluate('() => [...window.__doska.items.values()].map(i => i.type + (i.doff ? "@" + i.doff.toFixed(1) : ""))'))
    print('errors', errs); b.close()
