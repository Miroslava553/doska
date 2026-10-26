# Все окна на телефоне помещаются по ширине
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 360, 'height': 740}, has_touch=True, is_mobile=True, device_scale_factor=2)
    ctx.add_init_script("""localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));
      localStorage.setItem('doska:account', JSON.stringify({email:'m@e.ru', since:1, pro:{period:'month', started:Date.now(), until:Date.now()+30*864e5, canceled:false, method:'card'}}));""")
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=phdl-aaaa-bbbb'); pg.wait_for_timeout(1500)
    wide = "() => [...document.querySelectorAll('.modal .panel, .modal .dialog, .am-card')].map(e => { const r = e.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth ? e.className + ' ' + Math.round(r.left) + '..' + Math.round(r.right) : ''; }).filter(Boolean)"
    pg.locator('.status').first.click(); pg.wait_for_timeout(500); print('подключение', pg.evaluate(wide)); pg.screenshot(path=OUT + 'ph-conn.png')
    pg.click('text=Копировать код'); pg.wait_for_timeout(400); print('копирование', pg.evaluate(wide)); pg.screenshot(path=OUT + 'ph-copy.png')
    pg.keyboard.press('Escape'); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.keyboard.press('Shift+/'); pg.wait_for_timeout(400); print('горячие клавиши', pg.evaluate(wide)); pg.screenshot(path=OUT + 'ph-keys.png'); pg.keyboard.press('Escape')
    pg.evaluate("() => window.__doska.hist().open()"); pg.wait_for_timeout(800); pg.screenshot(path=OUT + 'ph-hist.png'); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    print(errs); b.close()
