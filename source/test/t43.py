from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude-doska/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/show/'
URL = 'file:///home/claude/board/dist/doska.html'
prefs = lambda pg: pg.evaluate("() => JSON.parse(localStorage.getItem('doska:prefs'))")
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1100, 'height': 700}, device_scale_factor=1.5)
    ctx.add_init_script("if (!localStorage.getItem('doska:prefs')) localStorage.setItem('doska:prefs', JSON.stringify({name: 'Тест'}))")
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(400)
    pg.click('.role-choose .chip:has-text("Ученик")'); pg.wait_for_timeout(150)
    print('picked:', prefs(pg)['role'])
    # в первые 2 минуты — можно исправить
    pg.click('.role-pill.click'); pg.wait_for_timeout(150)
    pg.click('.role-btn:has-text("Репетитор")'); pg.wait_for_timeout(150)
    print('fixed in grace:', prefs(pg)['role'], '| pill:', pg.inner_text('.role-pill'))
    # прошло 10 минут: одна смена разрешена, потом сутки нельзя
    pg.evaluate("() => { const p = JSON.parse(localStorage.getItem('doska:prefs')); p.roleFirst -= 600000; localStorage.setItem('doska:prefs', JSON.stringify(p)); }")
    pg.reload(); pg.wait_for_timeout(400)
    pg.click('.role-pill.click'); pg.wait_for_timeout(150)
    pg.click('.role-btn:has-text("Ученик")'); pg.wait_for_timeout(150)
    print('change after grace:', prefs(pg)['role'])
    pg.click('.role-pill.click'); pg.wait_for_timeout(150)
    print('second change: disabled =', pg.evaluate("() => document.querySelector('.role-btn:not(.on)').disabled"), '| note:', pg.inner_text('.role-note'))
    pg.screenshot(path=OUT + 'change-locked.png')
    pg.click('.role-foot .btn'); pg.wait_for_timeout(100)
    # доска: статус виден, меню без смены
    pg.goto(URL + '#r=v29r-olee-0002'); pg.reload(); pg.wait_for_timeout(3000)
    print('board pill:', pg.inner_text('.role-pill.top'), '| dialog:', pg.query_selector('.role-dialog') is not None)
    pg.mouse.click(31, 31); pg.wait_for_timeout(300)
    print('menu has role chips:', pg.evaluate("() => [...document.querySelectorAll('.chip')].some(c => /Репетитор|Ученик/.test(c.textContent))"))
    # свежий пользователь заходит сразу по ссылке на доску — спрашиваем
    c2 = b.new_context(viewport={'width': 1100, 'height': 700}); p2 = c2.new_page()
    p2.goto(URL + '#r=v29r-olee-0002'); p2.wait_for_timeout(2500)
    print('fresh asks:', p2.query_selector('.role-dialog') is not None, '| closable by bg:', end=' ')
    p2.mouse.click(20, 650); p2.wait_for_timeout(100); print(p2.query_selector('.role-dialog') is None)
    p2.click('.role-btn:has-text("Ученик")'); p2.wait_for_timeout(150)
    print('fresh pill:', p2.inner_text('.role-pill.top'))
    print('errors', errs); b.close()
