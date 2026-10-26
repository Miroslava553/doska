# Вход: подстановка почты как при автозаполнении, опечатка в домене, лимит попыток, удаление аккаунта
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1300, 'height': 850}, device_scale_factor=1.5)
    ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}))")
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/board/dist/doska.html'); pg.wait_for_timeout(800)
    pg.click('.acc-login'); pg.wait_for_timeout(300)
    # автозаполнение: браузер ставит значение и шлёт input/change без нажатий клавиш
    pg.evaluate("() => { const i = document.getElementById('doska-email'); i.value = 'mira@gmial.com'; i.dispatchEvent(new Event('input', {bubbles:true})); i.dispatchEvent(new Event('change', {bubbles:true})); }")
    pg.wait_for_timeout(200)
    print('подсказка', pg.locator('.am-fix:not([hidden])').inner_text())
    pg.screenshot(path=OUT + 'l1.png')
    pg.click('.am-fix'); print('после исправления', pg.input_value('#doska-email'))
    pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
    print('шаг кода', pg.locator('.am-digit').count())
    for k in range(5):
        pg.locator('.am-digit').first.click(); pg.keyboard.type('000000' if k % 2 == 0 else '111111'); pg.wait_for_timeout(450)
    print('после 5 ошибок', pg.locator('.am-err').inner_text())
    pg.click('text=Отправить новый код'); pg.wait_for_timeout(300)
    code = pg.inner_text('.am-code').replace(' ', ''); pg.locator('.am-digit').first.click(); pg.keyboard.type(code); pg.wait_for_timeout(1000)
    pg.click('.am-btn.primary'); pg.wait_for_timeout(300)
    pg.click('.acc-btn'); pg.wait_for_timeout(200); pg.click('text=Удалить аккаунт'); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT + 'l2.png')
    pg.click('.am-confirm .danger-t'); pg.wait_for_timeout(300)
    print('аккаунт удалён', pg.evaluate("() => localStorage.getItem('doska:account')"), 'кнопка Войти', pg.locator('.acc-login').count())
    print(errs); b.close()
