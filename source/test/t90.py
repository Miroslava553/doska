# Сайт: кнопка Про → окно с ценами → оформление → уведомление; окно фигур у кнопки; растяжение линии с сохранением наклона
from playwright.sync_api import sync_playwright
import math
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/yk/'
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    pg = b.new_page(viewport={'width': 1366, 'height': 820}, device_scale_factor=2); pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));")
    pg.goto('file:///home/claude/board/dist/site/index.html'); pg.wait_for_timeout(1200)
    pg.screenshot(path=OUT + '1-glavnaya.png')
    pg.click('.pro-pill'); pg.wait_for_timeout(500); pg.screenshot(path=OUT + '2-pro-mesyac.png')
    pg.click('.am-seg-b:has-text("Год")'); pg.wait_for_timeout(300); pg.screenshot(path=OUT + '3-pro-god.png')
    pg.click('.am-seg-b:has-text("Месяц")'); pg.click('.am-btn.pro.big'); pg.wait_for_timeout(500)
    pg.click('.am-btn.pro.big'); pg.wait_for_timeout(300); print('пустая почта: ошибка', pg.inner_text('.am-err'))
    pg.fill('.am-checkout .am-inp', 'ivan@mail.ru'); pg.click('.co-m:has-text("СБП")'); pg.wait_for_timeout(200)
    print('почта сохранилась после выбора СБП', pg.input_value('.am-checkout .am-inp'))
    pg.screenshot(path=OUT + '4-oformlenie.png')
    pg.click('.am-btn.pro.big'); pg.wait_for_timeout(500); pg.screenshot(path=OUT + '5-uvedomlenie.png')
    print('уведомление', pg.inner_text('.am-card')[:80].replace('\n', ' '))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300); print('окон открыто', pg.locator('.am-back:not(.out)').count())
    # доска: окно фигур
    pg.fill('input[placeholder="Название новой доски"]', 'Тест'); pg.click('text=Создать'); pg.wait_for_timeout(1500)
    btn = pg.locator('.tbtn[data-grp="shapes"]')
    for k in range(3):
        btn.click(); pg.wait_for_timeout(400)
        br = pg.locator('.tbtn[data-grp="shapes"]').bounding_box(); r = pg.evaluate("() => { const r = document.querySelector('.pop').getBoundingClientRect(); return [r.left, r.right, r.top]; }")
        mid = br['x'] + br['width'] / 2
        print('окно фигур под кнопкой', r[0] < mid < r[1] and r[2] > br['y'] + br['height'])
        pg.keyboard.press('Escape'); pg.mouse.move(700, 600); pg.wait_for_timeout(300)
        pg.keyboard.press('p')
    # линия под наклоном, тянем конец почти вдоль неё
    pg.keyboard.press('Escape'); pg.keyboard.press('l'); pg.mouse.move(400, 500); pg.mouse.down(); pg.mouse.move(600, 400, steps=8); pg.mouse.up(); pg.wait_for_timeout(200)
    ln = pg.evaluate("() => [...window.__doska.items.values()].find(i => i.type === 'line')")
    a0 = math.atan2(ln['y2'] - ln['y1'], ln['x2'] - ln['x1'])
    pg.keyboard.press('v'); pg.mouse.click(500, 450); pg.wait_for_timeout(200)
    pg.mouse.move(600, 400); pg.wait_for_timeout(150); pg.mouse.down(); pg.mouse.move(700, 352, steps=10); pg.wait_for_timeout(100)
    pg.screenshot(path=OUT + 'line-drag.png'); pg.mouse.up(); pg.wait_for_timeout(200)
    ln = pg.evaluate("() => [...window.__doska.items.values()].find(i => i.type === 'line')")
    a1 = math.atan2(ln['y2'] - ln['y1'], ln['x2'] - ln['x1']); L = math.hypot(ln['x2'] - ln['x1'], ln['y2'] - ln['y1'])
    print('удлинение вдоль: угол тот же', abs(a1 - a0) < 1e-6, 'длина', round(L))
    # тянем в сторону — свободно
    pg.mouse.move(*[ln['x'] + ln['x2'], ln['y'] + ln['y2']]) if False else None
    pg.evaluate("() => { const v = window.__doska.S.view; return v; }")
    end = pg.evaluate("() => { const it = [...window.__doska.items.values()].find(i => i.type === 'line'); const v = window.__doska.S.view; return [(it.x + it.x2) * v.z + v.x, (it.y + it.y2) * v.z + v.y]; }")
    print('конец на экране', [round(e) for e in end])
    pg.mouse.move(*end); pg.wait_for_timeout(150); pg.mouse.down(); pg.mouse.move(end[0] + 10, end[1] + 120, steps=10); pg.mouse.up(); pg.wait_for_timeout(200)
    ln = pg.evaluate("() => [...window.__doska.items.values()].find(i => i.type === 'line')")
    a2 = math.atan2(ln['y2'] - ln['y1'], ln['x2'] - ln['x1']); print('вбок: наклон изменился', abs(a2 - a0) > 0.1)
    # Shift: почти вдоль — свой наклон
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(200)
    end = pg.evaluate("() => { const it = [...window.__doska.items.values()].find(i => i.type === 'line'); const v = window.__doska.S.view; return [(it.x + it.x2) * v.z + v.x, (it.y + it.y2) * v.z + v.y]; }")
    pg.mouse.move(*end); pg.wait_for_timeout(150); pg.keyboard.down('Shift'); pg.mouse.down(); pg.mouse.move(end[0] + 80, end[1] - 25, steps=10); pg.mouse.up(); pg.keyboard.up('Shift'); pg.wait_for_timeout(200)
    ln = pg.evaluate("() => [...window.__doska.items.values()].find(i => i.type === 'line')")
    a3 = math.atan2(ln['y2'] - ln['y1'], ln['x2'] - ln['x1']); print('Shift почти вдоль: наклон тот же', abs(a3 - a0) < 1e-6)
    print('ошибки', errs); b.close()
