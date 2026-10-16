# v25: глаз — к собеседнику без смены масштаба; отдаляет, только если его линия не помещается. Лассо нет.
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1200, 'height': 760})
    ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Тест'}))")
    A = ctx.new_page(); B = ctx.new_page(); errs = []
    for pg in (A, B):
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v25t-ests-0001'); pg.wait_for_function('() => window.__doska')
    A.wait_for_timeout(800)
    # лассо: V дважды — всё ещё рамка
    A.keyboard.press('KeyV'); A.keyboard.press('KeyV'); A.wait_for_timeout(100)
    print('lasso pref:', A.evaluate("() => JSON.parse(localStorage.getItem('doska:prefs')).lasso"))
    A.evaluate("() => { const S = window.__doska.S; S.view = { z: 3, x: -1000, y: -600 }; }")
    # B пишет в другом месте маленькую линию
    B.evaluate("() => { const S = window.__doska.S; S.view = { z: 1, x: -1500, y: 0 }; }")
    B.keyboard.press('KeyP')
    def stroke(pg, x0, y0, dx, n=10):
        pg.mouse.move(x0, y0); pg.mouse.down()
        for i in range(1, n + 1): pg.mouse.move(x0 + dx * i / n, y0 + 10 * (i % 2)); pg.wait_for_timeout(20)
    stroke(B, 500, 300, 60)
    A.wait_for_timeout(300)
    pid = A.evaluate("() => [...window.__doska.peerAct.keys()][0]"); print('peer id', pid)
    A.evaluate("(id) => { const d = window.__doska; d.S.follow = id; d.goToPeer(d.peersById.get(id)?.view || { id, page: d.S.page, x0: 0, y0: 0, x1: 1, y1: 1 }); }", pid); A.wait_for_timeout(300)
    v = A.evaluate("() => window.__doska.S.view"); c = A.evaluate("() => window.__doska.toWorld(600, 380)")
    print('follow small: z', round(v['z'], 2), 'center world', [round(x) for x in c])
    B.mouse.up(); B.wait_for_timeout(200)
    # большая линия — не помещается при z=3
    stroke(B, 200, 400, 700, 20); B.wait_for_timeout(400)
    v = A.evaluate("() => window.__doska.S.view"); print('follow big: z', round(v['z'], 2))
    B.mouse.up()
    print('errors', errs); b.close()
