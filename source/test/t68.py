# Скрытый ответ: репетитор закрывает решение, ученик его не видит и не может выделить
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1300, 'height': 850}, device_scale_factor=1.5)
    ctx.add_init_script("""if (!localStorage.getItem('doska:prefs')) localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));
      if (!localStorage.getItem('doska:account')) localStorage.setItem('doska:account', JSON.stringify({email:'mira@example.com', since:1, pro:{period:'month', started:Date.now(), until:Date.now()+30*864e5, canceled:false, method:'card'}}));""")
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    url = 'file:///home/claude/board/dist/doska.html?nopeer#r=shsh-aaaa-bbbb'
    pg.goto(url); pg.wait_for_timeout(2000)
    def drag(a, c, steps=12):
        pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move(*c, steps=steps); pg.mouse.up(); pg.wait_for_timeout(100)
    pg.keyboard.press('t'); pg.mouse.click(400, 300); pg.wait_for_timeout(150); pg.keyboard.type('Задача: 2x + 4 = 10'); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.keyboard.press('t'); pg.mouse.click(400, 420); pg.wait_for_timeout(150); pg.keyboard.type('Ответ: x = 3'); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.keyboard.press('v'); drag((380, 400), (700, 470)); pg.wait_for_timeout(300)
    pg.click('.selbar [data-tip^="Скрыть ответ"], .selbar [title^="Скрыть ответ"]'); pg.wait_for_timeout(500)
    pg.mouse.move(1000, 700); pg.wait_for_timeout(200)
    pg.screenshot(path=OUT + 'sh1-tutor.png')
    # ученик
    pg.close()
    ctx.add_init_script("{ const p = JSON.parse(localStorage.getItem('doska:prefs')); p.role = 'student'; localStorage.setItem('doska:prefs', JSON.stringify(p)); }")
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.goto(url); pg.wait_for_timeout(2000)
    pg.keyboard.press('v'); drag((380, 400), (700, 470)); pg.wait_for_timeout(300)
    print('ученик выделил', pg.evaluate("() => window.__doska.S.sel.size"), 'кнопок на шторке', pg.locator('.shadebar').count())
    pg.keyboard.press('Escape'); pg.mouse.move(1000, 700); pg.wait_for_timeout(200)
    pg.screenshot(path=OUT + 'sh2-student.png')
    # репетитор открывает
    pg.close()
    ctx.add_init_script("{ const p = JSON.parse(localStorage.getItem('doska:prefs')); p.role = 'tutor'; localStorage.setItem('doska:prefs', JSON.stringify(p)); }")
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.goto(url); pg.wait_for_timeout(2000)
    pg.click('.shadebar .shb'); pg.wait_for_timeout(400); pg.mouse.move(1000, 700); pg.wait_for_timeout(200)
    pg.screenshot(path=OUT + 'sh3-open.png')
    print('открыта', pg.evaluate("() => [...window.__doska.items.values()].find(i => i.type === 'shade').open"))
    print(errs); b.close()
