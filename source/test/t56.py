from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1200, 'height': 700})
    ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0, eraserPrecise: true}))")
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v29r-olee-0190'); pg.wait_for_timeout(2500)
    def drag(a, c, steps=15):
        pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move(*c, steps=steps); pg.mouse.up(); pg.wait_for_timeout(120)
    pg.keyboard.press('p'); drag((300, 300), (800, 300))
    pg.keyboard.press('m'); drag((300, 360), (800, 360))
    pg.keyboard.press('d'); drag((300, 420), (800, 420))
    pg.keyboard.press('e'); drag((550, 250), (550, 470), 20)
    st = pg.evaluate("() => [...window.__doska.items.values()].map(i => i.kind)")
    print('after precise erase:', st)
    pg.screenshot(path=OUT + 'erase.png', clip={'x': 250, 'y': 250, 'width': 600, 'height': 220})
    print(errs); ctx.close()
    # один, по ссылке, без собеседника: через 8 с появляется свой лист
    ctx = b.new_context(viewport={'width': 1200, 'height': 700}); ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}))")
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.goto('file:///home/claude/board/dist/doska.html#r=v29r-olee-0191'); pg.wait_for_timeout(3500)
    print('at 3.5s pages:', pg.evaluate("() => window.__doska.pages().map(p => p.name)"))
    pg.mouse.move(400, 400); pg.mouse.down(); pg.mouse.move(500, 450, steps=8); pg.mouse.up(); pg.wait_for_timeout(100)
    pg.wait_for_timeout(6500)
    print('at 10s pages:', pg.evaluate("() => window.__doska.pages().map(p => p.name)"), 'page', pg.evaluate("() => window.__doska.S.page"), 'items on it', pg.evaluate("() => window.__doska.pageItems().length"))
    print(errs); b.close()
