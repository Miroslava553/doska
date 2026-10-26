# Шаблоны: 20 штук помещаются в окно с прокруткой, кнопка «?» объясняет, зачем они
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1300, 'height': 760}, device_scale_factor=1.5)
    ctx.add_init_script("""localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));
      localStorage.setItem('doska:account', JSON.stringify({email:'m@e.ru', since:1, pro:{period:'month', started:Date.now(), until:Date.now()+30*864e5, canceled:false, method:'card'}}));""")
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=tplx-aaaa-bbbb'); pg.wait_for_timeout(1800)
    pg.keyboard.press('p'); pg.mouse.move(300, 300); pg.mouse.down(); pg.mouse.move(500, 400, steps=6); pg.mouse.up(); pg.wait_for_timeout(200)
    pg.click('[data-tip="Меню"]'); pg.wait_for_timeout(200); pg.click('text=Сохранить как шаблон'); pg.wait_for_timeout(300)
    pg.click('.why-link'); pg.wait_for_timeout(300); pg.screenshot(path=OUT + 'why1.png')
    print('текст в диалоге', pg.locator('.why-inline:not([hidden])').count())
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    for k in range(20):
        pg.click('[data-tip="Меню"]'); pg.wait_for_timeout(120); pg.click('text=Сохранить как шаблон'); pg.wait_for_timeout(150)
        pg.keyboard.press('Control+a'); pg.keyboard.type(f'Урок {k+1}'); pg.keyboard.press('Enter'); pg.wait_for_timeout(250)
    pg.goto('file:///home/claude/board/dist/doska.html'); pg.wait_for_timeout(1200)
    pg.click('.tpl-btn'); pg.wait_for_timeout(400)
    r = pg.evaluate("() => { const m = document.querySelector('.tpl-menu').getBoundingClientRect(); return [Math.round(m.bottom), innerHeight, document.querySelectorAll('.tpl-row').length] }")
    print('низ окна, высота экрана, строк', r)
    pg.screenshot(path=OUT + 'tpl20.png')
    pg.click('.why-q'); pg.wait_for_timeout(300); pg.screenshot(path=OUT + 'why2.png')
    print('окошко', pg.locator('.why-pop').count(), 'меню открыто', pg.locator('.tpl-menu').count())
    pg.mouse.click(60, 700); pg.wait_for_timeout(200)
    print('после клика мимо: окошко', pg.locator('.why-pop').count(), 'меню', pg.locator('.tpl-menu').count())
    print(errs); b.close()
