# Шаблоны уроков: сохранить доску как шаблон и создать из него новую
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1300, 'height': 850}, device_scale_factor=1.5)
    ctx.add_init_script("""localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));
      if (!localStorage.getItem('doska:account')) localStorage.setItem('doska:account', JSON.stringify({email:'mira@example.com', since:1, pro:{period:'month', started:Date.now(), until:Date.now()+30*864e5, canceled:false, method:'card'}}));""")
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=tttt-uuuu-vvvv'); pg.wait_for_timeout(2000)
    def drag(a, c, steps=12):
        pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move(*c, steps=steps); pg.mouse.up(); pg.wait_for_timeout(100)
    pg.evaluate("() => window.__doska.setTool('fig:scalene')"); drag((400, 250), (700, 500)); pg.keyboard.press('Escape')
    pg.keyboard.press('t'); pg.mouse.click(450, 550); pg.wait_for_timeout(150); pg.keyboard.type('Теорема Пифагора'); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.click('[data-tip="Меню"], [title="Меню"]'); pg.wait_for_timeout(200); pg.click('text=Сохранить как шаблон'); pg.wait_for_timeout(300)
    pg.keyboard.press('Control+a'); pg.keyboard.type('Пифагор, 8 класс'); pg.keyboard.press('Enter'); pg.wait_for_timeout(800)
    pg.goto('file:///home/claude/board/dist/doska.html'); pg.wait_for_timeout(1200)
    print('кнопка шаблонов', pg.locator('.tpl-btn:not([hidden])').count())
    pg.fill('input[placeholder="Название новой доски"]', 'Пифагор — Петя')
    pg.click('.tpl-btn'); pg.wait_for_timeout(400); pg.screenshot(path=OUT + 'tpl1.png')
    pg.click('.tpl-open'); pg.wait_for_timeout(2500)
    print('объекты в новой доске', pg.evaluate("() => [...window.__doska.items.values()].map(i => i.type).sort().join(',')"), 'листы', pg.evaluate("() => window.__doska.pages().map(p => p.name).join(',')"))
    print('название', pg.inner_text('.btitle'))
    pg.screenshot(path=OUT + 'tpl2.png')
    print(errs); b.close()
