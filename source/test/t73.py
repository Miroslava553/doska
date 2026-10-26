# Метки Д/З: настройки в списке, Enter для названия, прозрачность 0, сворачивание при письме, замок для ученика, Материалы закрываются кликом мимо
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1300, 'height': 850}, device_scale_factor=1.5)
    ctx.add_init_script("""if (!localStorage.getItem('doska:prefs')) localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));
      localStorage.setItem('doska:account', JSON.stringify({email:'mira@example.com', since:1, pro:{period:'month', started:Date.now(), until:Date.now()+30*864e5, canceled:false, method:'card'}}));""")
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    url = 'file:///home/claude/board/dist/doska.html?nopeer#r=hwst-aaaa-bbbb'
    pg.goto(url); pg.wait_for_timeout(2000)
    HW = '.toolbar [data-tip^="Метка"], .toolbar [title^="Метка"]'
    for k in range(7):
        pg.keyboard.press('p'); pg.click(HW); pg.mouse.click(300 + k * 90, 300 + (k % 3) * 80); pg.wait_for_timeout(150)
    pg.mouse.move(1100, 600)
    print('строк', pg.locator('.hw-row').count(), 'высота списка', pg.evaluate("() => document.querySelector('.hw-list').clientHeight"), 'прокрутка', pg.evaluate("() => document.querySelector('.hw-list').scrollHeight > document.querySelector('.hw-list').clientHeight"))
    pg.click('.hw-set >> nth=0'); pg.wait_for_timeout(200)
    pg.fill('.hwq .hwq-inp', 'Задача 12'); pg.click('.hwq-ok'); pg.wait_for_timeout(200)
    pg.evaluate("() => { const r = document.querySelectorAll('.hwq .sz-range'); r[0].value = 200; r[0].dispatchEvent(new Event('input')); }"); pg.wait_for_timeout(200)
    pg.screenshot(path=OUT + 'hw-ed.png')
    print('метка 1', pg.evaluate("() => { const m = [...window.__doska.items.values()].filter(i => i.type === 'hw').sort((a,b) => a.n - b.n)[0]; return [m.name, m.sz]; }"))
    # замок
    pg.click('.hwq-switch'); pg.wait_for_timeout(200)
    print('замок', pg.evaluate("() => [...window.__doska.items.values()].filter(i => i.type === 'hw').sort((a,b) => a.n - b.n)[0].lockEdit"))
    # прозрачность 0
    pg.click('.hw-set >> nth=1'); pg.wait_for_timeout(200)
    pg.evaluate("() => { const r = document.querySelectorAll('.hwq .sz-range'); r[1].value = 0; r[1].dispatchEvent(new Event('input')); }"); pg.wait_for_timeout(200)
    # переход с подсветкой
    pg.click('.hw-go >> nth=1'); pg.wait_for_timeout(500)
    pg.screenshot(path=OUT + 'hw-pulse.png')
    # письмо на доске сворачивает список
    pg.keyboard.press('p'); pg.mouse.move(600, 650); pg.mouse.down(); pg.mouse.move(700, 680, steps=5); pg.mouse.up(); pg.wait_for_timeout(200)
    print('свёрнут после письма', pg.locator('.hw-row').count() == 0)
    # Материалы закрываются кликом мимо
    pg.click('[data-tip^="Материалы"], [title^="Материалы"]'); pg.wait_for_timeout(300)
    pg.keyboard.press('v'); pg.mouse.click(500, 700); pg.wait_for_timeout(200)
    print('Материалы закрыты', not pg.evaluate("() => window.__doska.mat().isOpen()"))
    # панель над выделенной меткой: Enter сохраняет, уход мыши — нет
    pg.click('.hw-head'); pg.wait_for_timeout(200); pg.click('.hw-go >> nth=2'); pg.wait_for_timeout(700)
    pg.keyboard.press('v'); pg.mouse.click(650, 418); pg.wait_for_timeout(300)
    if pg.locator('.selbar:not([hidden]) .hwp-name').count():
        pg.screenshot(path=OUT + 'hw-selbar.png')
        pg.fill('.selbar .hwp-name', 'Не сохранять'); pg.mouse.click(1000, 640); pg.wait_for_timeout(200)
        print('без Enter название', pg.evaluate("() => [...window.__doska.items.values()].filter(i => i.type === 'hw').sort((a,b) => a.n - b.n)[2].name"))
        pg.screenshot(path=OUT + 'hw-dbg.png')
        pg.mouse.click(650, 418); pg.wait_for_timeout(400)
        print('выделено', pg.evaluate("() => window.__doska.S.sel.size"), pg.evaluate("() => window.__doska.S.tool"), pg.evaluate("() => document.querySelector('.selbar').className + ' ' + document.querySelector('.selbar').hidden"))
        pg.fill('.selbar .hwp-name', 'Сохранить'); pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
        print('с Enter название', pg.evaluate("() => [...window.__doska.items.values()].filter(i => i.type === 'hw').sort((a,b) => a.n - b.n)[2].name"))
    else: print('панель не открылась')
    pg.close()
    ctx.add_init_script("{ const p = JSON.parse(localStorage.getItem('doska:prefs')); p.role = 'student'; localStorage.setItem('doska:prefs', JSON.stringify(p)); }")
    pg = ctx.new_page(); pg.goto(url); pg.wait_for_timeout(2000)
    if pg.locator('.hw-row').count() == 0: pg.click('.hw-head')
    print('ученик: кнопок настроек', pg.locator('.hw-set').count(), 'из', pg.locator('.hw-row').count(), 'замков', pg.locator('.hw-lk').count())
    print(errs); b.close()
