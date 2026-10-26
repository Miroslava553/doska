from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 390, 'height': 800}, device_scale_factor=2, has_touch=True, is_mobile=True)
    ctx.add_init_script("""localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));
      localStorage.setItem('doska:recent', JSON.stringify([{room:'aaaa-bcde-fghj',t:Date.now(),title:'Алгебра — Петя'},{room:'bbbb-bcde-fghj',t:Date.now(),title:'Физика — Олег'}])); localStorage.setItem('doska:created:aaaa-bcde-fghj','1'); localStorage.setItem('doska:created:bbbb-bcde-fghj','2');""")
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/board/dist/doska.html'); pg.wait_for_timeout(800)
    pg.screenshot(path=OUT + 'mob-home.png')
    pg.click('.pro-pill'); pg.wait_for_timeout(500); pg.screenshot(path=OUT + 'mob-pro.png')
    print(errs); b.close()
