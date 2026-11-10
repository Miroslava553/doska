# Кнопка «Аналитика» в меню аккаунта: видна только владельцу, открывает страницу учёта; чужим ни кнопки, ни данных
from playwright.sync_api import sync_playwright
import json, urllib.request
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/e2e/'
C = 'http://127.0.0.1:4022'; S = 'http://127.0.0.1:4021/'
ctl = lambda p: json.loads(urllib.request.urlopen(C + p).read())
res = []
def r(n, v): res.append((n, v)); print(('✓ ' if v else '✗ ') + n)
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    def ctx():
        c = b.new_context(viewport={'width': 1366, 'height': 820})
        c.add_init_script("if (!localStorage.getItem('doska:prefs')) localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));")
        pg = c.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:200])); return c, pg
    def login(pg, email):
        pg.goto(S); pg.wait_for_timeout(1000)
        pg.click('.acc-login'); pg.wait_for_timeout(300); pg.fill('input[name=email]', email); pg.click('button[type=submit]'); pg.wait_for_timeout(700)
        pg.keyboard.type(ctl('/code?email=' + email)['code']); pg.wait_for_timeout(1500)
        pg.click('.am-card .am-btn.primary'); pg.wait_for_timeout(400)
    # чужой человек
    c1, pg = ctx(); login(pg, 'petya@mail.ru')
    pg.click('.acc-btn'); pg.wait_for_timeout(300)
    r('у обычного человека «Аналитики» нет', pg.locator('.acc-mi:has-text("Аналитика")').count() == 0)
    r('и в данных аккаунта нет пометки владельца', not pg.evaluate("() => JSON.parse(localStorage.getItem('doska:account')||'{}').owner"))
    pg.keyboard.press('Escape')
    st = pg.evaluate("() => fetch('/api/admin', {credentials:'include'}).then(r => r.status)")
    r('его запрос сводки отклонён (%s)' % st, st == 404)
    pg.goto(S + 'admin.html'); pg.wait_for_timeout(1500)
    txt = pg.inner_text('body')
    r('страница учёта ему ничего не показывает', 'petya@mail.ru' not in txt and 'Выручка' not in txt)
    pg.screenshot(path=OUT + 'a1-stranger.png')
    # владелец
    c2, pg2 = ctx(); login(pg2, 'owner@lodl.test')
    pg2.click('.acc-btn'); pg2.wait_for_timeout(300)
    item = pg2.locator('.acc-mi:has-text("Аналитика")')
    r('у владельца «Аналитика» в меню', item.count() == 1)
    pg2.screenshot(path=OUT + 'a2-menu.png')
    with c2.expect_page() as np: item.click()
    ap = np.value; ap.wait_for_load_state(); ap.wait_for_timeout(1500)
    r('открылась в новой вкладке страница учёта', ap.url.endswith('/admin.html'))
    t2 = ap.inner_text('body')
    r('в сводке видны оба человека', 'petya@mail.ru' in t2 and 'owner@lodl.test' in t2)
    ap.screenshot(path=OUT + 'a3-admin.png', full_page=False)
    r('доска во вкладке осталась на месте', pg2.url.startswith(S) and 'admin' not in pg2.url)
    # после выхода кнопки нет
    pg2.click('.acc-btn'); pg2.wait_for_timeout(300); pg2.click('.acc-mi:has-text("Выйти")'); pg2.wait_for_timeout(800)
    r('после выхода снова «Войти»', pg2.locator('.acc-login').count() == 1)
    # телефон: меню не вылезает за экран
    c3 = b.new_context(viewport={'width': 390, 'height': 760}, is_mobile=True, has_touch=True); pg3 = c3.new_page(); pg3.on('pageerror', lambda e: errs.append(str(e)[:200]))
    login(pg3, 'owner@lodl.test'); pg3.click('.acc-btn'); pg3.wait_for_timeout(300)
    bb = pg3.locator('.acc-menu').bounding_box()
    r('телефон: меню с «Аналитикой» в пределах экрана', bb and bb['x'] >= 0 and bb['x'] + bb['width'] <= 390 and pg3.locator('.acc-mi:has-text("Аналитика")').count() == 1)
    pg3.screenshot(path=OUT + 'a4-phone.png')
    r('ошибок в странице нет', not errs); print(errs)
    b.close()
print('ИТОГ', sum(1 for _, v in res if v), 'из', len(res))
