import math
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1300, 'height': 850}, device_scale_factor=1.5)
    ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}))")
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v29r-olee-0310'); pg.wait_for_timeout(2500)
    def drag(a, c, steps=10):
        pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move(*c, steps=steps); pg.mouse.up(); pg.wait_for_timeout(120)
    pg.evaluate("() => window.__doska.setTool('fig:scalene')"); drag((450, 250), (750, 500)); pg.keyboard.press('Escape')
    pg.keyboard.press('p'); drag((540, 420), (620, 380)); drag((600, 440), (660, 460))
    pg.keyboard.press('t'); pg.mouse.click(560, 470); pg.wait_for_timeout(150); pg.keyboard.type('ABC'); pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    pg.evaluate("() => window.__doska.setTool('rect')"); drag((800, 300), (900, 360)); pg.keyboard.press('Escape')
    pg.keyboard.press('v'); drag((400, 200), (950, 560))
    print('selected', pg.evaluate("() => window.__doska.S.sel.size"))
    pg.mouse.move(1200, 800); pg.wait_for_timeout(200)
    pg.screenshot(path=OUT + 'rot-before.png')
    # ручка поворота: под рамкой по центру
    bb = pg.evaluate("() => { const d = window.__doska; const b = d.selectionBox(); const a = d.toScreen(b[0], b[1]), c = d.toScreen(b[2], b[3]); return [a[0], a[1], c[0], c[1]]; }")
    cx, cy = (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2
    hx, hy = bb[2] + 5 + 14, bb[3] + 5 + 14
    # поворот на 90° по часовой: с низа центра — влево
    pg.mouse.move(hx, hy); pg.mouse.down()
    R = math.hypot(hx - cx, hy - cy); a0 = math.atan2(hy - cy, hx - cx)
    for k in range(1, 21):
        a = a0 + (math.pi / 2) * k / 20
        pg.mouse.move(cx + R * math.cos(a), cy + R * math.sin(a))
    pg.wait_for_timeout(100); pg.screenshot(path=OUT + 'rot-during.png'); pg.mouse.up(); pg.wait_for_timeout(200)
    print(pg.evaluate("() => [...window.__doska.items.values()].map(i => [i.type, i.kind || '', i.rot ?? '', i.fk || ''])"))
    pg.mouse.move(1200, 800); pg.wait_for_timeout(200)
    pg.screenshot(path=OUT + 'rot-after.png')
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(200)
    print('after undo', pg.evaluate("() => [...window.__doska.items.values()].map(i => [i.type, i.rot ?? ''])"))
    print(errs); b.close()
