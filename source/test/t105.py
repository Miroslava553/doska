# Масштаб 2%…1200%, «Показать всё» при любом размере листа, толщина до новых пределов, большой ластик
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/zm/'
res = []
def r(n, v): res.append((n, v)); print(('✓ ' if v else '✗ ') + n)
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    pg = b.new_page(viewport={'width': 1366, 'height': 820}); pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=zm01-aaaa-bbbb'); pg.wait_for_timeout(1500)
    D = lambda js, *a: pg.evaluate(js, *a)
    zt = lambda: pg.inner_text('.zoom')
    zbtns = pg.locator('.zoombar button, .zoom-wrap button, [aria-label="Отдалить"], [title^="Отдалить"]')
    minus = pg.locator('[data-tip^="Отдалить"], [title^="Отдалить"], [aria-label^="Отдалить"]').first
    plus = pg.locator('[data-tip^="Приблизить"], [title^="Приблизить"], [aria-label^="Приблизить"]').first
    seq = []
    for i in range(40):
        minus.click(); pg.wait_for_timeout(40); seq.append(zt())
    print('вниз:', ' '.join(seq[:32]))
    r('кнопкой «−» доходим до 2%', seq[-1] == '2%')
    r('внизу шаги мельче: 10 → 8 → 6 → 5 → 4 → 3 → 2', ' '.join(seq).find('10% 8% 6% 5% 4% 3% 2%') >= 0)
    r('от 100 до 50 шаги по 10%', seq[:5] == ['90%', '80%', '70%', '60%', '50%'])
    minus.click(); pg.wait_for_timeout(50); r('ниже 2% кнопкой не уходит', zt() == '2%')
    plus.click(); pg.wait_for_timeout(50); r('вверх с 2% на 3%', zt() == '3%')
    # Ctrl + колесо мыши: тоже по шагам
    D("() => { const D = window.__doska; D.S.view.z = 1; }")
    pg.mouse.move(683, 410); pg.keyboard.down('Control'); pg.mouse.wheel(0, 100); pg.wait_for_timeout(80); pg.keyboard.up('Control')
    r('Ctrl+колесо: 100% → 90%', zt() == '90%')
    # огромный лист: «Показать всё» вписывает всё, даже ниже 2%
    D("""() => { const D = window.__doska; D.doc.transact(() => { for (const [i, [x, y]] of [[0, 0], [200000, 0], [0, 120000], [200000, 120000]].entries()) D.addItem({ id: 'big' + i, type: 'rect', page: D.S.page, z: i + 1, x, y, s: 1, w: 300, h: 300, color: '#1e1e1e', size: 3 }); }, 'noundo'); }""")
    pg.keyboard.press('Shift+Digit1'); pg.wait_for_timeout(300)
    vis = D("""() => { const D = window.__doska; return ['big0', 'big1', 'big2', 'big3'].every((id) => { const it = D.items.get(id); const a = D.toScreen(it.x, it.y), b = D.toScreen(it.x + it.w, it.y + it.h); return a[0] >= 0 && a[1] >= 0 && b[0] <= innerWidth && b[1] <= innerHeight; }); }""")
    r('«Показать всё» на огромном листе: видны все углы (масштаб %s)' % zt(), vis and ',' in zt())
    pg.screenshot(path=OUT + '1-fit-huge.png')
    z0 = D("() => window.__doska.S.view.z")
    minus.click(); pg.wait_for_timeout(60)
    r('после «Показать всё» дальше не отдаляется', abs(D("() => window.__doska.S.view.z") - z0) < 1e-9)
    pg.keyboard.down('Control'); pg.mouse.wheel(0, 300); pg.wait_for_timeout(80); pg.keyboard.up('Control')
    r('колесом тоже не отдаляется', abs(D("() => window.__doska.S.view.z") - z0) < 1e-9)
    plus.click(); pg.wait_for_timeout(60); r('«+» после этого — сразу 2%', zt() == '2%')
    D("() => { const D = window.__doska; D.doc.transact(() => { for (let i = 0; i < 4; i++) D.doc.getMap('items').delete('big' + i); }, 'noundo'); D.S.view = { x: 0, y: 0, z: 1 }; }"); pg.mouse.move(683, 600); pg.wait_for_timeout(100)
    # обычный лист — «Показать всё» как раньше (не больше 200%)
    D("""() => { const D = window.__doska; D.doc.transact(() => D.addItem({ id: 'sm', type: 'rect', page: D.S.page, z: 9, x: 100, y: 100, s: 1, w: 40, h: 30, color: '#1e1e1e', size: 3 }), 'noundo'); }""")
    pg.keyboard.press('Shift+Digit1'); pg.wait_for_timeout(200); r('маленький рисунок: «Показать всё» не больше 200%', zt() == '200%')
    D("() => { const D = window.__doska; D.doc.transact(() => D.doc.getMap('items').delete('sm'), 'noundo'); D.S.view = { x: 0, y: 0, z: 1 }; }")
    # толщина ручки: ползунок до конца — 60, в начало — 0,5
    pg.keyboard.press('p'); pg.wait_for_timeout(100); pg.locator('.tbtn[data-grp="size:pen"]').click(); pg.wait_for_timeout(300)
    rg = pg.locator('.pop .sz-range').first
    rg.fill('1000'); pg.wait_for_timeout(80); rg.dispatch_event('change'); pg.wait_for_timeout(80)
    r('ручка: наибольшая толщина 60', pg.locator('.pop .sz-val').first.inner_text() == '60' and D("() => JSON.parse(localStorage.getItem('doska:prefs')).size.pen") == 60)
    pg.screenshot(path=OUT + '2-pen-pop.png')
    rg.fill('0'); rg.dispatch_event('change'); pg.wait_for_timeout(80)
    r('ручка: наименьшая 0,5', D("() => JSON.parse(localStorage.getItem('doska:prefs')).size.pen") == 0.5)
    rg.fill('500'); rg.dispatch_event('change'); pg.wait_for_timeout(80)
    mid = D("() => JSON.parse(localStorage.getItem('doska:prefs')).size.pen")
    r('середина ползунка — около 5 (тонкие подбираются точно), сейчас %s' % mid, 4 <= mid <= 7)
    pg.keyboard.press('Escape'); pg.locator('.pop .sz-chip[data-v="30"]').count()
    pg.locator('.tbtn[data-grp="size:pen"]').click(); pg.wait_for_timeout(300); pg.click('.pop .sz-chip[data-v="30"]'); pg.wait_for_timeout(100); pg.keyboard.press('Escape')
    pg.mouse.move(300, 400); pg.mouse.down(); pg.mouse.move(600, 420, steps=8); pg.mouse.up(); pg.wait_for_timeout(150)
    r('штрих толщиной 30', D("() => [...window.__doska.items.values()].pop().size") == 30)
    # ластик 300: свой круг, курсор браузера спрятан, стирает по краю круга
    pg.keyboard.press('e'); pg.wait_for_timeout(100); pg.locator('.tbtn[data-grp="size:eraser"]').click(); pg.wait_for_timeout(300)
    rg = pg.locator('.pop .sz-range').first; rg.fill('1000'); rg.dispatch_event('change'); pg.wait_for_timeout(80); pg.keyboard.press('Escape')
    r('ластик до 300', D("() => JSON.parse(localStorage.getItem('doska:prefs')).size.eraser") == 300)
    pg.mouse.move(700, 600); pg.wait_for_timeout(150)
    r('большой ластик: курсор браузера спрятан, круг рисуется сам', D("() => document.querySelector('#over, canvas.over, canvas:last-of-type') && getComputedStyle([...document.querySelectorAll('canvas')].find((c) => c.style.cursor) || document.body).cursor") == 'none')
    pg.screenshot(path=OUT + '3-big-eraser.png')
    r('без ошибок', not errs)
    if errs: print(errs[:3])
    b.close()
print('ИТОГ', sum(1 for _, v in res if v), 'из', len(res))
