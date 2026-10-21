from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1300, 'height': 850}, device_scale_factor=1.5)
    ctx.add_init_script("if (!localStorage.getItem('doska:prefs')) localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}))")
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v29r-olee-0130'); pg.wait_for_timeout(2500)
    order = lambda: pg.evaluate("() => [...document.querySelectorAll('.toolbar > .tbtn, .toolbar > .sep')].map(b => b.classList.contains('sep') ? '|' : (b.dataset.grp || '').replace('size:', '') || (b.dataset.tip || '').split(' (')[0])")
    print('default:', order())
    pg.screenshot(path=OUT + 'bar-default.png', clip={'x': 0, 'y': 0, 'width': 1300, 'height': 130})
    pg.mouse.click(31, 31); pg.wait_for_timeout(300)
    pg.click('text=Кнопки на панели…'); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT + 'bar-dialog.png')
    rows = pg.query_selector_all('.bs-row')
    names = [r.inner_text().replace('⋮⋮', '').strip() for r in rows]; print('rows:', names)
    # перетащить «Ластик» (5) на место 0
    r = rows[5].bounding_box(); t = rows[0].bounding_box()
    pg.mouse.move(r['x'] + 60, r['y'] + r['height'] / 2); pg.mouse.down(); pg.mouse.move(t['x'] + 60, t['y'] + t['height'] / 2, steps=10); pg.mouse.up(); pg.wait_for_timeout(200)
    # спрятать «Картинка или PDF»
    pg.locator('.bs-row', has_text='Картинка').locator('.bs-eye').click(); pg.wait_for_timeout(150)
    pg.screenshot(path=OUT + 'bar-dialog2.png')
    print('custom:', order())
    pg.click('.bs-foot .btn.primary'); pg.reload(); pg.wait_for_timeout(2500)
    print('after reload:', order())
    pg.mouse.click(31, 31); pg.wait_for_timeout(300); pg.click('text=Кнопки на панели…'); pg.wait_for_timeout(200); pg.click('text=Как было'); pg.wait_for_timeout(150)
    print('reset:', order())
    print(errs); b.close()
