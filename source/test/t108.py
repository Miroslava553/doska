# Синусоида и косинусоида в фигурах; правая кнопка двигает доску сразу, даже если перо не прислало «отпустили»
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/gr/'
res = []
def r(n, v): res.append((n, v)); print(('✓ ' if v else '✗ ') + n)
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    pg = b.new_page(viewport={'width': 1300, 'height': 850}); pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=wv01-aaaa-bbbb'); pg.wait_for_timeout(1500)
    D = lambda js, *a: pg.evaluate(js, *a)
    figs = lambda k: D("(k) => [...window.__doska.items.values()].filter((i) => i.type === 'fig' && i.kind === k).map((i) => JSON.parse(JSON.stringify(i)))", k)
    # 1. в меню фигур есть раздел с синусоидой и косинусоидой
    pg.locator('[data-tip^="Фигуры"]').first.click(); pg.wait_for_timeout(300)
    pop = pg.locator('.pop:visible').last
    r('в окне фигур есть раздел «Тригонометрия»', pop.get_by_text('Тригонометрия').count() == 1)
    r('в нём синусоида и косинусоида', pop.locator('[data-tip^="Синусоида"]').count() == 1 and pop.locator('[data-tip^="Косинусоида"]').count() == 1)
    pg.screenshot(path=OUT + 'w1-menu.png')
    pop.locator('[data-tip^="Синусоида"]').click(); pg.wait_for_timeout(150)
    pg.mouse.move(200, 200); pg.mouse.down(); pg.mouse.move(600, 320, steps=8); pg.mouse.up(); pg.wait_for_timeout(200)
    s = figs('sine'); r('синусоида нарисована рамкой', len(s) == 1 and abs(s[0]['w'] - 400) < 3 and abs(s[0]['h'] - 120) < 3)
    D("(k) => window.__doska.setTool(k)", 'fig:cosine'); pg.wait_for_timeout(100)
    pg.mouse.click(400, 560); pg.wait_for_timeout(200)
    c = figs('cosine'); r('щелчок ставит косинусоиду вытянутой, а не квадратной', len(c) == 1 and c[0]['w'] > c[0]['h'] * 2)
    pg.screenshot(path=OUT + 'w2-board.png')
    # 2. полволны: длина волны та же
    D("(id) => { const D = window.__doska; D.setTool('select'); D.S.sel = new Set([id]); }", s[0]['id']); pg.wait_for_timeout(100)
    sx, sy = D("(id) => { const D = window.__doska, it = D.items.get(id); return D.toScreen(it.x + it.w / 2, it.y + it.h / 2); }", s[0]['id'])
    pg.mouse.click(sx, sy - 0); pg.wait_for_timeout(250)
    D("(id) => { window.__doska.S.sel = new Set([id]); }", s[0]['id']); pg.wait_for_timeout(250)
    plus = pg.locator('[data-tip*="Ещё полволны"], [aria-label*="Ещё полволны"]')
    if plus.count() == 0: plus = pg.get_by_text('Ещё полволны')
    r('у выделенной синусоиды есть «Ещё полволны»', plus.count() >= 1)
    if plus.count():
        plus.first.click(); pg.wait_for_timeout(150)
        s2 = figs('sine')[0]; r('стало 2,5 волны, рамка длиннее на четверть (%d → %d)' % (s[0]['w'], s2['w']), s2.get('per') == 2.5 and abs(s2['w'] - s[0]['w'] * 1.25) < 1)
    # стирание и попадание курсором по волне
    hit = D("(id) => { const D = window.__doska, it = D.items.get(id); const [x, y] = [it.x + it.w * 0.1, it.y + it.h * 0.5 - it.h * 0.5 * Math.sin(2 * Math.PI * (it.per || 2) * 0.1)]; return D.topHit ? (D.topHit(x, y) || {}).id === id : null; }", s[0]['id'])
    r('по линии волны попадает курсор', hit is not False)
    # 3. правая кнопка после штриха пера, если перо не прислало «отпустили»
    D("() => { window.__doska.S.sel = new Set(); window.__doska.setTool('pen'); }")
    c2 = pg.context.new_cdp_session(pg)
    M = lambda typ, x, y, btn='none', buttons=0, pt='pen': c2.send('Input.dispatchMouseEvent', {'type': typ, 'x': x, 'y': y, 'button': btn, 'buttons': buttons, 'pointerType': pt, 'force': 0.5, 'clickCount': 1 if typ != 'mouseMoved' else 0})
    nst = lambda: D("() => [...window.__doska.items.values()].filter((i) => i.type === 'stroke').length")
    n0 = nst()
    M('mouseMoved', 300, 650); M('mousePressed', 300, 650, 'left', 1, 'pen')
    for i in range(1, 9): M('mouseMoved', 300 + i * 20, 650 + i * 5, 'left', 1, 'pen')
    # «отпустили» не пришло — сразу правая кнопка мыши
    v0 = D("() => ({...window.__doska.S.view})")
    M('mousePressed', 800, 500, 'right', 2, 'mouse')
    for i in range(1, 7): M('mouseMoved', 800 + i * 15, 500 + i * 8, 'right', 2, 'mouse')
    M('mouseReleased', 890, 548, 'right', 0, 'mouse'); pg.wait_for_timeout(150)
    r('правая кнопка сразу двигает доску', v0 != D("() => ({...window.__doska.S.view})"))
    r('недописанный штрих сохранился', nst() == n0 + 1)
    # обычный случай: штрих мышью и сразу правая кнопка
    D("() => window.__doska.setTool('pen')")
    pg.mouse.move(300, 700); pg.mouse.down(); pg.mouse.move(450, 740, steps=6); pg.mouse.up()
    v0 = D("() => ({...window.__doska.S.view})")
    pg.mouse.move(800, 500); pg.mouse.down(button='right'); pg.mouse.move(880, 540, steps=5); pg.mouse.up(button='right'); pg.wait_for_timeout(100)
    r('штрих мышью и сразу правая кнопка: доска двигается', v0 != D("() => ({...window.__doska.S.view})"))
    r('нет ошибок страницы', not errs)
    if errs: print(errs[:3])
    b.close()
print(f"{sum(1 for _, v in res if v)}/{len(res)}")
