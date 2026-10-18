from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude-doska/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/show/'
URL = 'file:///home/claude/board/dist/doska.html#r=v29r-olee-0001'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1100, 'height': 700}, device_scale_factor=1.5)
    ctx.add_init_script("if (!localStorage.getItem('doska:prefs')) localStorage.setItem('doska:prefs', JSON.stringify({name: 'Тест'}))")
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('.role-dialog', timeout=10000); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT + 'role.png')
    pg.click('.role-btn:has-text("Ученик")'); pg.wait_for_timeout(200)
    print('saved role:', pg.evaluate("() => JSON.parse(localStorage.getItem('doska:prefs')).role"), '| dialog gone:', pg.query_selector('.role-dialog') is None)
    pg.reload(); pg.wait_for_timeout(3500)
    print('asked again after reload:', pg.query_selector('.role-dialog') is not None)
    pg.mouse.click(31, 31); pg.wait_for_timeout(300)
    print('menu role chips:', pg.evaluate("() => [...document.querySelectorAll('.chip')].filter(c => /Репетитор|Ученик/.test(c.textContent)).map(c => c.textContent + (c.classList.contains('on') ? '*' : ''))"))
    print('errors', errs); b.close()
