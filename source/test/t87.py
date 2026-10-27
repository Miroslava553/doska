# Сайт без оплаты: возможностей Про нет ни у репетитора, ни у ученика; бесплатные на месте
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
for role in ('tutor', 'student'):
  with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1300, 'height': 800})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'%s', roleFirst: 1, roleAt: 0}));" % role)
    pg.goto('file:///home/claude/board/dist/site/index.html?nopeer#r=site-%s-bbbb' % role[:4]); pg.wait_for_timeout(1500)
    pg.keyboard.press('p'); pg.mouse.move(400, 300); pg.mouse.down(); pg.mouse.move(600, 400, steps=5); pg.mouse.up()
    pg.keyboard.press('v'); pg.mouse.move(380, 280); pg.mouse.down(); pg.mouse.move(620, 420, steps=5); pg.mouse.up(); pg.wait_for_timeout(300)
    sel = pg.evaluate("() => [...document.querySelectorAll('.selbar [data-tip]')].map(b => b.getAttribute('data-tip')).join(' | ')")
    pg.mouse.click(500, 350, button='right'); pg.wait_for_timeout(300)
    ctxm = pg.evaluate("() => document.querySelector('.pop')?.innerText.replace(/\\n/g, ' | ') || ''"); pg.keyboard.press('Escape'); pg.mouse.click(900, 650); pg.wait_for_timeout(200)
    pg.click('[data-tip="Меню"]'); pg.wait_for_timeout(300)
    menu = pg.evaluate("() => document.querySelector('.pop')?.innerText.replace(/\\n/g, ' | ')"); pg.keyboard.press('Escape')
    top = pg.evaluate("() => [...document.querySelectorAll('.tr [data-tip], .tr button')].map(b => b.getAttribute('data-tip') || '').filter(Boolean).join(' | ')")
    pg.screenshot(path=OUT + f'site-{role}.png')
    pro_words = [w for w in ['Скрыть ответ', 'История доски', 'шаблон', 'Материал'] if w in sel + ctxm + menu + top]
    print(role, 'Про на виду:', pro_words or 'нет', '| Повтор урока в меню:', 'Повтор урока' in menu)
    pg.goto('file:///home/claude/board/dist/site/index.html'); pg.wait_for_timeout(1000)
    print(role, 'главная: кнопка шаблонов', pg.locator('.tpl-btn:not([hidden])').count(), 'Про/Войти', pg.locator('button:has-text("Войти"), button:has-text("Про")').count(), errs)
    b.close()
