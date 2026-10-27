# Без Про: замки ведут в тарифы; сборка для сайта: без входа, всё открыто
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, url in [('test', 'file:///home/claude/board/dist/doska.html'), ('site', 'file:///home/claude/board/dist/site/index.html')]:
        ctx = b.new_context(viewport={'width': 1300, 'height': 850}, device_scale_factor=1)
        ctx.add_init_script("""localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));
          if (!localStorage.getItem('doska:recent')) { localStorage.setItem('doska:recent', JSON.stringify([{room:'aaaa-bcde-fghj',t:Date.now(),title:'Алгебра'},{room:'bbbb-bcde-fghj',t:Date.now(),title:'Физика'}])); localStorage.setItem('doska:created:aaaa-bcde-fghj','1'); localStorage.setItem('doska:created:bbbb-bcde-fghj','2'); }""")
        pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(url); pg.wait_for_timeout(800)
        print(name, 'header', pg.locator('.home-top').count(), 'hint', pg.locator('.login-hint:not([hidden])').count(), 'foldbtn', pg.locator('.bf-add:not([hidden])').count())
        pg.screenshot(path=OUT + f'f-{name}-home.png')
        if name == 'test':
            pg.click('.bf-add'); pg.wait_for_timeout(400)
            print('папки бесплатно: окно новой папки', pg.locator('.dialog').count())
            pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
            pg.click('.pro-pill'); pg.wait_for_timeout(500); pg.screenshot(path=OUT + 'pw-new.png', full_page=True)
            pg.click('.pw-price .am-btn.pro'); pg.wait_for_timeout(400)
            print('login opened', pg.locator('.am-login').count(), pg.locator('.am-sub').inner_text()[:40])
            pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        pg.goto(url.split('#')[0] + '?nopeer#r=aaaa-bcde-fghj'); pg.wait_for_timeout(2000)
        pg.keyboard.press('p'); pg.mouse.move(400, 400); pg.mouse.down(); pg.mouse.move(600, 500, steps=10); pg.mouse.up(); pg.wait_for_timeout(200)
        pg.click('[data-tip="Меню"], [title="Меню"]'); pg.wait_for_timeout(300)
        pg.screenshot(path=OUT + f'f-{name}-menu.png')
        has = pg.locator('.pop >> text=История доски').count()
        if has: pg.click('.pop >> text=История доски'); pg.wait_for_timeout(800)
        print(name, 'история в меню', has, 'окно Про', pg.locator('.am-pro').count())
        print(name, errs); ctx.close()
    b.close()
