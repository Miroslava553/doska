# Ученик без Про на доске репетитора с Про — повтор открыт
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1300, 'height': 850})
    ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Петя', role:'student', roleFirst: 1, roleAt: 0}))")
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=qqqq-rrrr-ssss'); pg.wait_for_timeout(2000)
    pg.keyboard.press('p'); pg.mouse.move(400, 400); pg.mouse.down(); pg.mouse.move(600, 500, steps=10); pg.mouse.up(); pg.wait_for_timeout(200)
    pg.click('[data-tip="Меню"], [title="Меню"]'); pg.wait_for_timeout(200); pg.click('text=Повтор урока'); pg.wait_for_timeout(400)
    print('без отметки: paywall', pg.locator('.am-pro').count(), 'replay', pg.locator('.rp').count())
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.evaluate("() => window.__doska.doc.getMap('meta').set('proUntil', Date.now() + 864e5)")
    pg.click('[data-tip="Меню"], [title="Меню"]'); pg.wait_for_timeout(200)
    print('тег Про в меню', pg.locator('.pop .pro-tag').count())
    pg.click('text=Повтор урока'); pg.wait_for_timeout(400)
    print('с отметкой: paywall', pg.locator('.am-pro').count(), 'replay', pg.locator('.rp').count())
    print(errs); b.close()
