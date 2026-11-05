# Страница учёта: закрыта без входа и для чужих, у владельца цифры сходятся с базой, поиск и отбор работают, телефон
from playwright.sync_api import sync_playwright
import json, urllib.request, urllib.parse
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/adm/'
C = 'http://127.0.0.1:4022'; S = 'http://127.0.0.1:4021/'
ctl = lambda p: json.loads(urllib.request.urlopen(C + p).read())
sql = lambda q: ctl('/sql?q=' + urllib.parse.quote(q))
res = []
def r(n, v): res.append((n, v)); print(('✓ ' if v else '✗ ') + n)
API = """async ([path, body]) => { const r = await fetch('/api' + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Lodl': '1' }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, d: await r.json().catch(() => null) }; }"""
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    def page(w=1366, h=860):
        c = b.new_context(viewport={'width': w, 'height': h}); pg = c.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:200])); return c, pg
    def login(pg, email):
        pg.goto(S); pg.wait_for_timeout(600)
        pg.evaluate(API, ['/login/start', {'email': email}]); code = ctl('/code?email=' + email)['code']
        return pg.evaluate(API, ['/login/verify', {'email': email, 'code': code}])
    # несколько людей: один включил две недели, один заплатил
    for i, e in enumerate(['a1@mail.ru', 'a2@mail.ru', 'a3@mail.ru']):
        c, pg = page(); login(pg, e)
        if i == 1: pg.evaluate(API, ['/gift', {}])
        if i == 2:
            j = pg.evaluate(API, ['/pay', {'period': 'year'}]); pid = j['d']['url'].split('/')[-1]; ctl('/finish?id=%s&ok=1' % pid)
            pg.evaluate("(id) => fetch('/api/yk/hook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ object: { id } }) })", pid)
        c.close()
    c, pg = page(); pg.goto(S + 'admin.html'); pg.wait_for_timeout(800)
    r('без входа: просит войти', 'Нужно войти' in pg.inner_text('body'))
    pg.screenshot(path=OUT + '0-gate.png'); c.close()
    c, pg = page(); login(pg, 'a1@mail.ru'); pg.goto(S + 'admin.html'); pg.wait_for_timeout(800)
    r('чужая почта: страница закрыта, данных нет', 'Страница закрыта' in pg.inner_text('body') and 'a2@mail.ru' not in pg.content())
    c.close()
    c, pg = page(); login(pg, 'owner@lodl.test'); pg.goto(S + 'admin.html'); pg.wait_for_timeout(1000)
    t = pg.inner_text('body')
    n_users = sql('SELECT COUNT(*) AS n FROM users')[0]['n']; money = sql("SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE status='succeeded'")[0]['s']
    r('владелец видит учёт: пользователей %d, выручка %d' % (n_users, money), 'Вошли по почте' in t and pg.locator('.card .v').first.inner_text() == str(n_users) and ('%s ₽' % format(money, ',').replace(',', ' ')) in t)
    r('в списке все почты', all(e in t for e in ['a1@mail.ru', 'a2@mail.ru', 'a3@mail.ru', 'owner@lodl.test']))
    r('тарифы в списке верные', 'Про, год' in pg.locator('tr:has-text("a3@mail.ru")').inner_text() and 'Две недели' in pg.locator('tr:has-text("a2@mail.ru")').inner_text() and 'Базовый' in pg.locator('tr:has-text("a1@mail.ru")').inner_text())
    pg.screenshot(path=OUT + '1-owner.png', full_page=True)
    pg.fill('#q', 'a2'); pg.wait_for_timeout(150)
    r('поиск по почте', pg.locator('#rows tr').count() == 1 and 'a2@mail.ru' in pg.inner_text('#rows'))
    pg.fill('#q', ''); pg.click('.chip[data-f="pro"]'); pg.wait_for_timeout(150)
    r('отбор «Платят»', pg.locator('#rows tr').count() == 1 and 'a3@mail.ru' in pg.inner_text('#rows'))
    pg.click('.chip[data-f="trial"]'); pg.wait_for_timeout(150)
    r('отбор «Две недели»', 'a2@mail.ru' in pg.inner_text('#rows') and 'a3@mail.ru' not in pg.inner_text('#rows'))
    pg.fill('#q', 'нет-такого'); pg.wait_for_timeout(150)
    r('ничего не нашлось: понятная строка', 'Никого не нашлось' in pg.inner_text('#rows'))
    pg.fill('#q', '<img src=x onerror=alert(1)>'); pg.wait_for_timeout(150)
    r('ввод с разметкой не ломает страницу', pg.locator('#rows img').count() == 0)
    pg.fill('#q', ''); pg.click('.chip[data-f="all"]'); pg.click('#reload'); pg.wait_for_timeout(800)
    r('кнопка «Обновить» работает', 'a1@mail.ru' in pg.inner_text('#rows'))
    c.close()
    # сообщение с разметкой в отзыве не выполняется на странице учёта
    c, pg = page(); pg.goto(S); pg.wait_for_timeout(500); pg.evaluate(API, ['/feedback', {'kind': 'bug', 'text': '<script>window.__x=1</script><b>жирный</b> текст', 'contact': ''}]); c.close()
    c, pg = page(390, 844); login(pg, 'owner@lodl.test'); pg.goto(S + 'admin.html'); pg.wait_for_timeout(1000)
    r('отзыв с разметкой показан текстом', '<b>жирный</b>' in pg.inner_text('body') and not pg.evaluate('window.__x'))
    r('телефон: страница без прокрутки вбок', pg.evaluate('document.documentElement.scrollWidth') <= 390)
    pg.screenshot(path=OUT + '2-phone.png', full_page=True); c.close()
    r('без ошибок', not errs)
    if errs: print(errs[:3])
    b.close()
print('ИТОГ', sum(1 for _, v in res if v), 'из', len(res))
