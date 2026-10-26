# Телефон: панель выделения, меню размера, формула, график — всё на экране
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 360, 'height': 740}, has_touch=True, is_mobile=True, device_scale_factor=2)
    ctx.add_init_script("""localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));
      localStorage.setItem('doska:account', JSON.stringify({email:'m@e.ru', since:1, pro:{period:'month', started:Date.now(), until:Date.now()+30*864e5, canceled:false, method:'card'}}));""")
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=phon-aaaa-bbbb'); pg.wait_for_timeout(1500)
    pg.evaluate("() => window.__doska.setTool('fig:scalene')"); pg.mouse.move(80, 300); pg.mouse.down(); pg.mouse.move(280, 450, steps=6); pg.mouse.up(); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT + 'ph1.png')
    pg.evaluate("() => window.__doska.setTool('pen')"); pg.wait_for_timeout(100)
    pg.locator('.tbtn.on, .tool.on').first.click(); pg.wait_for_timeout(300); pg.screenshot(path=OUT + 'ph2.png')
    print(errs); b.close()
