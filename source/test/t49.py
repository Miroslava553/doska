from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude-doska/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/show/'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1300, 'height': 850})
    ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0, barPos: 'left'}))")
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v29r-olee-0070'); pg.wait_for_timeout(2500)
    def drag(a, c, steps=12):
        pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move(*c, steps=steps); pg.mouse.up(); pg.wait_for_timeout(150)
    pg.keyboard.press('d')
    drag((450, 380), (650, 280)); drag((470, 430), (900, 330)); drag((700, 250), (920, 460))
    pg.keyboard.press('v')
    drag((400, 200), (1000, 520))
    print('sel', pg.evaluate("() => window.__doska.S.sel.size"), 'bar hidden:', pg.evaluate("() => document.querySelector('.selbar').hidden"), 'cls', pg.evaluate("() => document.querySelector('.selbar').className"))
    pg.screenshot(path=OUT + 'strk-1.png')
    pg.mouse.move(640, 700); pg.mouse.wheel(0, 250); pg.wait_for_timeout(250)
    pg.screenshot(path=OUT + 'strk-2.png')
    print('after pan bar:', pg.evaluate("() => { const s = document.querySelector('.selbar'); return [s.hidden, s.className, s.style.left, s.style.top]; }"))
    print(errs); b.close()
