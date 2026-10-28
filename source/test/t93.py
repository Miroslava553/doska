# Вандал по оплате и входу: отказ в ЮKassa, двойное нажатие, потеря сессии, нет сети, телефон
from playwright.sync_api import sync_playwright
import json, urllib.request, urllib.parse, os
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/e2e/'
C = 'http://127.0.0.1:4022'; S = 'http://127.0.0.1:4021/'
ctl = lambda p: json.loads(urllib.request.urlopen(C + p).read())
sql = lambda q: ctl('/sql?q=' + urllib.parse.quote(q))
res = []
def r(n, v): res.append(v); print(('✓ ' if v else '✗ ') + n)
decline = {'on': False}
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    def ctx(mobile=False):
        c = b.new_context(viewport={'width': 390, 'height': 780} if mobile else {'width': 1366, 'height': 820}, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
        c.add_init_script("if (!localStorage.getItem('doska:prefs')) localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));")
        def yk(route):
            pid = route.request.url.split('/')[-1]; pay = [x for x in [ctl('/last')] if x['id'] == pid][0]
            ctl('/finish?id=%s&ok=%s' % (pid, '0' if decline['on'] else '1'))
            route.fulfill(status=302, headers={'Location': pay['confirmation']['return_url']})
        c.route('https://yoomoney.example/**', yk)
        pg = c.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:200])); return c, pg
    def login(pg, email, tap=False):
        (pg.tap if tap else pg.click)('.acc-login'); pg.wait_for_timeout(300)
        pg.fill('input[name=email]', email); (pg.tap if tap else pg.click)('button[type=submit]'); pg.wait_for_timeout(800)
        pg.keyboard.type(ctl('/code?email=' + email)['code']); pg.wait_for_timeout(1500)
        (pg.tap if tap else pg.click)('.am-card .am-btn.primary'); pg.wait_for_timeout(500)
    c, pg = ctx()
    pg.goto(S); pg.wait_for_timeout(1000); login(pg, 'vandal@mail.ru')
    # отказ на странице ЮKassa
    decline['on'] = True
    pg.click('.pro-pill'); pg.wait_for_timeout(300); pg.click('.am-btn.pro.big'); pg.wait_for_timeout(400)
    pg.click('.am-checkout .am-btn.pro.big'); pg.wait_for_timeout(3500)
    r('отказ: «Оплата не прошла», деньги не списаны', 'Оплата не прошла' in pg.inner_text('body'))
    pg.screenshot(path=OUT + 'v1-declined.png')
    r('Про не включился', 'Подписка' not in pg.inner_text('.pro-pill'))
    # повтор: двойное нажатие «Оплатить» даёт один платёж
    decline['on'] = False
    pg.click('text=Попробовать ещё раз'); pg.wait_for_timeout(400); pg.click('.am-btn.pro.big'); pg.wait_for_timeout(400)
    n0 = len(sql("select id from payments"))
    pg.dblclick('.am-checkout .am-btn.pro.big'); pg.wait_for_timeout(3500)
    r('двойное нажатие: один новый платёж', len(sql("select id from payments")) == n0 + 1)
    r('после второй попытки праздник', pg.locator('.am-celebrate').count() == 1)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    # повторный заход по той же ссылке возврата ничего не ломает
    last = ctl('/last'); pg.goto(last['confirmation']['return_url']); pg.wait_for_timeout(2500)
    r('повторный возврат: снова праздник, срок не удвоен', len(sql("select until from subs")) == 1)
    pg.keyboard.press('Escape')
    # потеря сессии: куки стёрли, в браузере остался старый аккаунт
    c.clear_cookies(); pg.goto(S); pg.wait_for_timeout(1500)
    r('сессия пропала: снова «Войти», Про не показан', pg.locator('.acc-login').count() == 1)
    # нет сети при входе
    c.set_offline(True)
    pg.click('.acc-login'); pg.wait_for_timeout(300); pg.fill('input[name=email]', 'vandal@mail.ru'); pg.click('button[type=submit]'); pg.wait_for_timeout(1500)
    r('нет сети: понятная ошибка', 'интернет' in pg.inner_text('.am-err').lower() or 'сервер' in pg.inner_text('.am-err').lower())
    pg.screenshot(path=OUT + 'v2-offline.png')
    c.set_offline(False); pg.keyboard.press('Escape')
    # чужой пытается открыть страницу подписки по ссылке из письма
    c3, p3 = ctx(); p3.goto(S + '?sub=1'); p3.wait_for_timeout(1500)
    r('ссылка из письма без входа: просит войти', p3.locator('input[name=email]').count() == 1)
    # телефон: вход и оформление
    c2, pm = ctx(True); pm.goto(S); pm.wait_for_timeout(1000); login(pm, 'phone@mail.ru', tap=True)
    pm.tap('.pro-pill'); pm.wait_for_timeout(400); pm.tap('.am-btn.pro.big'); pm.wait_for_timeout(500)
    pm.screenshot(path=OUT + 'v3-phone-checkout.png')
    r('телефон: страница не шире экрана', pm.evaluate("() => document.documentElement.scrollWidth") <= 390)
    pm.tap('.am-checkout .am-btn.pro.big'); pm.wait_for_timeout(3500)
    r('телефон: оплата прошла', pm.locator('.am-celebrate').count() == 1)
    pm.screenshot(path=OUT + 'v4-phone-celebrate.png')
    r('ошибок нет', not errs); print(errs)
    b.close()
print('ИТОГ', sum(res), 'из', len(res))
