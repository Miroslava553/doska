# Без Про: Материалы заперты; после входа все доски с облачком
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
TRI = OUT + 'tri.png'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1300, 'height': 850}, device_scale_factor=1.5)
    ctx.add_init_script("""localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));
      if (!localStorage.getItem('doska:recent')) { localStorage.setItem('doska:recent', JSON.stringify([{room:'aaaa-bcde-fghj',t:Date.now(),title:'Алгебра — Петя'},{room:'bbbb-bcde-fghj',t:Date.now(),title:'Физика (по ссылке)'}])); localStorage.setItem('doska:created:aaaa-bcde-fghj','1'); }""")
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/board/dist/doska.html'); pg.wait_for_timeout(800)
    print('подсказка входа', pg.locator('.login-hint:not([hidden])').inner_text()[:60])
    pg.click('.acc-login'); pg.fill('.am-inp', 'mira@example.com'); pg.click('text=Получить код'); pg.wait_for_timeout(300)
    code = pg.inner_text('.am-code').replace(' ', ''); pg.locator('.am-digit').first.click(); pg.keyboard.type(code); pg.wait_for_timeout(1000)
    print('после входа:', pg.locator('.am-sub').inner_text()); pg.click('.am-btn.primary'); pg.wait_for_timeout(300)
    print('облачков у досок', pg.locator('.bcloud.ok').count(), 'подсказка скрыта', pg.locator('.login-hint[hidden]').count())
    pg.screenshot(path=OUT + 'c1-home.png')
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=aaaa-bcde-fghj'); pg.wait_for_timeout(2000)
    print('замок на Материалах', pg.locator('.tbtn.pro-locked').count())
    pg.click('[data-tip^="Материалы"], [title^="Материалы"]'); pg.wait_for_timeout(500)
    pg.screenshot(path=OUT + 'c2-mat.png')
    pg.set_input_files('.mat input[type=file]', TRI); pg.wait_for_timeout(800)
    print('окно Про при загрузке', pg.locator('.am-pro').count(), pg.locator('.am-ask').inner_text() if pg.locator('.am-ask').count() else '')
    pg.screenshot(path=OUT + 'c3-pw.png')
    print(errs); b.close()
