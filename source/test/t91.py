# Настоящий сайт с сервером: вход по коду, Про закрыт, оплата через ЮKassa, облако, вторая машина, отмена
from playwright.sync_api import sync_playwright
import json, urllib.request, os
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/e2e/'
C = 'http://127.0.0.1:4022'; S = 'http://127.0.0.1:4021/'
ctl = lambda p: json.loads(urllib.request.urlopen(C + p).read())
res = []
def r(n, v): res.append((n, v)); print(('✓ ' if v else '✗ ') + n)
IMG = OUT + 'pic.png'
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    def ctx(email_role='tutor'):
        c = b.new_context(viewport={'width': 1366, 'height': 820})
        c.add_init_script("if (!localStorage.getItem('doska:prefs')) localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'%s', roleFirst: 1, roleAt: 0}));" % email_role)
        # страница ЮKassa: покупатель платит, ЮKassa возвращает на сайт
        def yk(route):
            pid = route.request.url.split('/')[-1]; last = ctl('/last')
            ctl('/finish?id=%s&ok=%s' % (pid, '0' if os.environ.get('DECLINE') else '1'))
            route.fulfill(status=302, headers={'Location': last['confirmation']['return_url']})
        c.route('https://yoomoney.example/**', yk)
        pg = c.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:200])); return c, pg
    def login(pg, email):
        pg.click('.acc-login'); pg.wait_for_timeout(300)
        pg.fill('input[name=email]', email); pg.click('button[type=submit]'); pg.wait_for_timeout(700)
        code = ctl('/code?email=' + email)['code']
        pg.keyboard.type(code); pg.wait_for_timeout(1500)
    c1, pg = ctx()
    pg.goto(S); pg.wait_for_timeout(1200)
    r('главная: Про и Войти', pg.locator('.pro-pill').count() == 1 and pg.locator('.acc-login').count() == 1)
    pg.click('.acc-login'); pg.wait_for_timeout(300); pg.fill('input[name=email]', 'mira@mail.ru'); pg.click('button[type=submit]'); pg.wait_for_timeout(700)
    r('экран кода, тестовой подсказки нет', pg.locator('.am-digit').count() == 6 and pg.locator('.am-code').count() == 0)
    pg.keyboard.type('123456'); pg.wait_for_timeout(800)
    r('неверный код: ошибка', 'Неверный код' in pg.inner_text('.am-err'))
    pg.screenshot(path=OUT + '1-wrong.png')
    code = ctl('/code?email=mira@mail.ru')['code']; pg.keyboard.type(code); pg.wait_for_timeout(1500)
    r('вошли', 'Вы вошли' in pg.inner_text('.am-card'))
    pg.click('.am-card .am-btn.primary'); pg.wait_for_timeout(400)
    r('аватар на месте', pg.locator('.acc-btn').count() == 1)
    # доска и закрытые функции
    pg.fill('input[placeholder="Название новой доски"]', 'Алгебра, Петя'); pg.click('text=Создать'); pg.wait_for_timeout(1800)
    pg.keyboard.press('p'); pg.mouse.move(300, 300); pg.mouse.down(); pg.mouse.move(500, 380, steps=10); pg.mouse.up(); pg.wait_for_timeout(300)
    room = pg.evaluate("() => location.hash.slice(3)")
    pg.click('[data-tip="Меню"]'); pg.wait_for_timeout(300)
    r('в меню История доски с меткой Про', pg.locator('.mi:has-text("История доски") .pro-tag').count() == 1)
    pg.click('text=История доски'); pg.wait_for_timeout(600)
    r('без Про история открывает окно Про', pg.locator('.am-pro').count() == 1)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.wait_for_timeout(3500)
    saved = ctl('/sql?q=' + urllib.parse.quote("select size from boards where room='%s'" % room)) if False else None
    import urllib.parse
    rows = ctl('/sql?q=' + urllib.parse.quote("select size from boards where room='%s'" % room))
    r('доска ушла на сервер', bool(rows) and rows[0]['size'] > 100)
    # оплата
    pg.goto(S); pg.wait_for_timeout(1200)
    pg.click('.pro-pill'); pg.wait_for_timeout(400); pg.click('.am-btn.pro.big'); pg.wait_for_timeout(500)
    r('оформление без выбора способа, с пояснением про ЮKassa', pg.locator('.co-methods').count() == 0 and 'ЮKassa' in pg.inner_text('.am-checkout'))
    pg.screenshot(path=OUT + '2-checkout.png')
    pg.click('.am-checkout .am-btn.pro.big'); pg.wait_for_timeout(3500)
    r('после оплаты праздник', pg.locator('.am-celebrate').count() == 1)
    r('адрес очищен от метки оплаты', '?pay=' not in pg.url)
    pg.screenshot(path=OUT + '3-celebrate.png')
    pg.click('.am-celebrate .am-btn'); pg.wait_for_timeout(500)
    r('кнопка стала «Подписка и оплата»', 'Подписка и оплата' in pg.inner_text('.pro-pill'))
    r('письмо об оплате', any('оформлена' in m for m in ctl('/mails')))
    # Материалы в облако
    open(IMG, 'wb').write(open('/home/claude/board/src/pages/logo.png', 'rb').read())
    pg.click('.brow .bopen'); pg.wait_for_timeout(1800)
    pg.click('[data-tip^="Материалы"]'); pg.wait_for_timeout(1200)
    with pg.expect_file_chooser() as fc: pg.click('.mat-ib[data-tip^="Загрузить"]')
    fc.value.set_files(IMG); pg.wait_for_timeout(2500)
    r('файл в облаке', len(ctl('/sql?q=' + urllib.parse.quote('select id from blobs'))) == 1 and pg.locator('.mat-tile:not(.folder)').count() == 1)
    pg.screenshot(path=OUT + '4-materials.png')
    n0 = pg.evaluate("() => window.__doska.items.size")
    pg.click('.mat-tile:not(.folder)'); pg.wait_for_timeout(1500)
    r('из облака вставилось на лист', pg.evaluate("() => window.__doska.items.size") == n0 + 1)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    # шаблон
    pg.click('[data-tip="Меню"]'); pg.wait_for_timeout(300); pg.click('text=Сохранить как шаблон'); pg.wait_for_timeout(500)
    pg.click('.modal .btn.primary'); pg.wait_for_timeout(1500)
    r('шаблон в облаке', len(ctl('/sql?q=' + urllib.parse.quote("select id from kv where coll='tpls'"))) == 1)
    pg.wait_for_timeout(3500)
    # второе устройство
    c2, pg2 = ctx()
    pg2.goto(S); pg2.wait_for_timeout(1000); login(pg2, 'mira@mail.ru'); pg2.click('.am-card .am-btn.primary'); pg2.wait_for_timeout(1500)
    r('на втором устройстве видна доска', 'Алгебра, Петя' in pg2.inner_text('.blist'))
    r('и кнопка подписки', 'Подписка' in pg2.inner_text('.pro-pill'))
    r('и кнопка шаблонов', pg2.locator('.tpl-btn:not([hidden])').count() == 1)
    pg2.click('.brow .bopen'); pg2.wait_for_timeout(3500)
    n2 = pg2.evaluate("() => window.__doska.items.size")
    r('содержимое доски пришло с сервера', n2 == n0 + 1)
    pg2.screenshot(path=OUT + '5-second.png')
    # рисуем на втором — видно на первом после перезагрузки (без P2P в тесте связь только через сервер)
    pg2.keyboard.press('p'); pg2.mouse.move(600, 500); pg2.mouse.down(); pg2.mouse.move(700, 560, steps=8); pg2.mouse.up(); pg2.wait_for_timeout(4000)
    pg.reload(); pg.wait_for_timeout(3500)
    r('штрих со второго устройства на первом', pg.evaluate("() => window.__doska.items.size") == n0 + 2)
    # управление подпиской и отмена
    pg.goto(S); pg.wait_for_timeout(1200); pg.click('.pro-pill'); pg.wait_for_timeout(800)
    pg.screenshot(path=OUT + '6-manage.png')
    pg.click('.am-manage .am-btn.danger-t'); pg.wait_for_timeout(300); pg.click('.am-confirm .am-btn.ghost'); pg.wait_for_timeout(800)
    r('отмена на сервере', ctl('/sql?q=' + urllib.parse.quote('select canceled from subs'))[0]['canceled'] == 1)
    r('в окне «Не продлевается»', 'Не продлевается' in pg.inner_text('.am-manage'))
    pg.click('.am-manage .am-btn.pro'); pg.wait_for_timeout(800)
    r('возобновили', ctl('/sql?q=' + urllib.parse.quote('select canceled from subs'))[0]['canceled'] == 0)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    # ученик без Про на той же доске
    c3, pg3 = ctx('student'); pg3.goto(S + '#r=' + room); pg3.wait_for_timeout(2000)
    pg3.click('[data-tip="Меню"]'); pg3.wait_for_timeout(300)
    r('ученик без входа: история с меткой Про', pg3.locator('.mi:has-text("История доски") .pro-tag').count() == 1)
    # выход
    pg.click('.acc-btn'); pg.wait_for_timeout(300); pg.click('.acc-mi:has-text("Выйти")'); pg.wait_for_timeout(800)
    r('после выхода снова «Войти»', pg.locator('.acc-login').count() == 1)
    r('ошибок в странице нет', not errs)
    print(errs)
    b.close()
print('ИТОГ', sum(1 for _, v in res if v), 'из', len(res))
