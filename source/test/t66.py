# История доски: запись как видео, воспроизведение, перемотка, лист из прошлого добавляется отдельным листом
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1300, 'height': 850}, device_scale_factor=1.5)
    ctx.add_init_script("""localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));
      if (!localStorage.getItem('doska:account')) localStorage.setItem('doska:account', JSON.stringify({email:'mira@example.com', since:1, pro:{period:'month', started:Date.now(), until:Date.now()+30*864e5, canceled:false, method:'card'}}));""")
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=hhhh-iiii-mmmm'); pg.wait_for_timeout(2000)
    def drag(a, c, steps=12):
        pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move(*c, steps=steps); pg.mouse.up(); pg.wait_for_timeout(100)
    pg.evaluate("() => window.__doska.setTool('fig:scalene')"); drag((400, 250), (700, 500)); pg.keyboard.press('Escape'); pg.wait_for_timeout(1300)
    pg.keyboard.press('p')
    for k in range(4):
        drag((420 + k * 70, 560), (470 + k * 70, 640), 8); pg.wait_for_timeout(1300)
    pg.keyboard.press('t'); pg.mouse.click(450, 700); pg.wait_for_timeout(150); pg.keyboard.type('Ответ: x = 5'); pg.keyboard.press('Escape'); pg.wait_for_timeout(1300)
    pg.keyboard.press('Control+a'); pg.keyboard.press('Delete'); pg.wait_for_timeout(1300)   # «ученик стёр всё»
    pg.keyboard.press('p'); drag((500, 300), (800, 420)); pg.wait_for_timeout(1300)
    pg.reload(); pg.wait_for_timeout(2000)
    pg.click('[data-tip="Меню"]'); pg.wait_for_timeout(200); pg.click('text=История доски'); pg.wait_for_timeout(1500)
    pg.screenshot(path=OUT + 'hp0.png')
    # перематываем на момент перед удалением
    found = None
    for k in range(60):
        pg.keyboard.press('ArrowLeft'); pg.wait_for_timeout(80)
        if not pg.locator('.hp-add').is_disabled():
            n = pg.evaluate("() => 1")
        # смотрим, сколько объектов видно: по картинке не проверить, поэтому проверяем через добавление ниже
    pg.screenshot(path=OUT + 'hp1.png')
    pg.click('.hp-play'); pg.wait_for_timeout(2500); pg.screenshot(path=OUT + 'hp2.png')
    pg.click('.hp-play'); pg.wait_for_timeout(200)
    # ставим на середину и добавляем лист
    box = pg.locator('.hp-range').bounding_box(); pg.mouse.click(box['x'] + box['width'] * 0.82, box['y'] + box['height'] / 2); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT + 'hp3.png')
    print('время', pg.inner_text('.hp-time'))
    pg.click('.hp-add'); pg.wait_for_timeout(800)
    pages = pg.evaluate("() => window.__doska.pages().map(p => p.name)")
    n = pg.evaluate("() => [...window.__doska.items.values()].filter(i => i.page === window.__doska.S.page).map(i => i.type).sort().join(',')")
    print('листы', pages, 'на новом листе', n)
    print(errs); b.close()
