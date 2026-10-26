# Материалы и повтор урока на доске (тестовая сборка, Про оформлен)
from playwright.sync_api import sync_playwright
import time
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
TRI = OUT + 'tri.png'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1300, 'height': 850}, device_scale_factor=1.5)
    ctx.add_init_script("""localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));
      if (!localStorage.getItem('doska:account')) localStorage.setItem('doska:account', JSON.stringify({email:'mira@example.com', since:1, pro:{period:'month', started:Date.now(), trialEnds:Date.now()+30*864e5, until:Date.now()+30*864e5, canceled:false, method:'card'}}));""")
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type=='error' and errs.append(m.text))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=mmmm-nnnn-pppp'); pg.wait_for_timeout(2500)
    def drag(a, c, steps=12):
        pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move(*c, steps=steps); pg.mouse.up(); pg.wait_for_timeout(100)
    pg.keyboard.press('p')
    # «решение»: оси, кривая, подпись
    drag((300, 600), (800, 600)); drag((340, 640), (340, 250))
    pts = [(360 + i * 12, 580 - (i - 18) ** 2 * 0.9 + 300) for i in range(36)]
    pts = [(x, min(590, y)) for x, y in pts]
    pg.mouse.move(*pts[0]); pg.mouse.down()
    for q in pts[1:]: pg.mouse.move(*q, steps=2)
    pg.mouse.up()
    pg.keyboard.press('t'); pg.mouse.click(620, 300); pg.wait_for_timeout(150); pg.keyboard.type('y = x^2'); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.evaluate("() => window.__doska.setTool('rect')"); drag((850, 300), (1000, 420)); pg.keyboard.press('Escape')
    pg.click('[title^="Материалы"], [data-tip^="Материалы"]'); pg.wait_for_timeout(500)
    pg.screenshot(path=OUT + 'm1-empty.png')
    pg.set_input_files('.mat input[type=file]', TRI); pg.wait_for_timeout(1200)
    pg.click('.mat [title="Новая папка"], .mat [data-tip="Новая папка"]'); pg.wait_for_timeout(200); pg.keyboard.type('Геометрия'); pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
    # выделяем рисунок и сохраняем как заготовку
    pg.click('.mat [title="Закрыть"], .mat [data-tip="Закрыть"]'); pg.wait_for_timeout(200)
    pg.keyboard.press('v'); drag((250, 230), (820, 660))
    pg.wait_for_timeout(300)
    pg.click('[title^="Материалы"], [data-tip^="Материалы"]'); pg.wait_for_timeout(400)
    pg.click('.mat-save'); pg.wait_for_timeout(300); pg.keyboard.press('Control+a'); pg.keyboard.type('Парабола'); pg.keyboard.press('Enter'); pg.wait_for_timeout(600)
    pg.screenshot(path=OUT + 'm2-items.png')
    # перетаскиваем картинку на лист
    tile = pg.locator('.mat-tile:not(.folder)').last.bounding_box()
    sx, sy = tile['x'] + tile['width'] / 2, tile['y'] + tile['height'] / 2
    pg.mouse.move(sx, sy); pg.mouse.down(); pg.mouse.move(sx - 40, sy + 10, steps=4); pg.mouse.move(600, 420, steps=10)
    pg.wait_for_timeout(100); pg.screenshot(path=OUT + 'm3-drag.png'); pg.mouse.up(); pg.wait_for_timeout(800)
    pg.screenshot(path=OUT + 'm4-dropped.png')
    print('items', pg.evaluate("() => [...window.__doska.items.values()].map(i => i.type).join(',')"))
    # повтор урока
    pg.click('[title="Меню"], [data-tip="Меню"]'); pg.wait_for_timeout(300); pg.click('text=Повтор урока'); pg.wait_for_timeout(1800)
    pg.screenshot(path=OUT + 'm5-replay.png')
    pg.wait_for_timeout(2500); pg.screenshot(path=OUT + 'm6-replay2.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    print('replay closed', pg.evaluate("() => !document.querySelector('.rp')"))
    print(errs); b.close()
