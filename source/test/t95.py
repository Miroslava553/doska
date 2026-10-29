# Карточка предложений: перетаскивание, наклон, не залезает на окно и панель, запоминает место, сворачивается
from playwright.sync_api import sync_playwright
res = []
def r(n, v): res.append(bool(v)); print(('✓ ' if v else '✗ ') + n)
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in ((1440, 860), (1000, 700), (820, 640)):
        c = b.new_context(viewport={'width': W, 'height': H})
        c.add_init_script("if (!localStorage.getItem('doska:prefs')) localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'student', roleFirst: 1, roleAt: 0}));")
        pg = c.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        pg.goto('file:///home/claude/board/dist/lodl/index.html'); pg.wait_for_timeout(1800)
        f = lambda: pg.locator('.fbk').bounding_box(); s = pg.locator('.start-col').bounding_box()
        inter = lambda a, q, m=0: a['x'] < q['x'] + q['width'] + m and a['x'] + a['width'] > q['x'] - m and a['y'] < q['y'] + q['height'] + m and a['y'] + a['height'] > q['y'] - m
        r(f'{W}: главное окно по центру', abs(s['x'] + s['width'] / 2 - W / 2) < 2)
        r(f'{W}: карточка не на окне и не на панели', not inter(f(), s, 10) and f()['y'] >= 66)
        mini = pg.evaluate("() => document.querySelector('.fbk').classList.contains('mini')")
        print('   свёрнута сама' if mini else '   развёрнута', [round(v) for v in f().values()])
        pg.screenshot(path=OUT + f'fb{W}.png')
        if W == 1440:
            a = f(); pg.mouse.move(a['x'] + a['width'] / 2, a['y'] + 12); pg.mouse.down()
            for k in range(1, 15): pg.mouse.move(a['x'] + a['width'] / 2 + k * 40, a['y'] + 12 + k * 6); pg.wait_for_timeout(16)
            tilt = pg.evaluate("() => getComputedStyle(document.querySelector('.fbk')).getPropertyValue('--tilt')")
            pg.screenshot(path=OUT + 'fbdrag.png')
            pg.mouse.up(); pg.wait_for_timeout(700)
            r('на ходу наклоняется: ' + tilt, tilt.strip() not in ('', '0deg', '0.00deg'))
            r('отпущенная поверх окна — отъехала в сторону', not inter(f(), s, 10))
            a = f(); pg.mouse.move(a['x'] + 30, a['y'] + 12); pg.mouse.down(); pg.mouse.move(W - 200, H - 150, steps=12); pg.mouse.up(); pg.wait_for_timeout(700)
            L = lambda: pg.evaluate("() => [parseFloat(document.querySelector('.fbk').style.left), parseFloat(document.querySelector('.fbk').style.top)]")
            pos = L(); pg.reload(); pg.wait_for_timeout(1600)
            r('место запомнилось', abs(L()[0] - pos[0]) < 2 and abs(L()[1] - pos[1]) < 2)
            a = f(); pg.mouse.move(a['x'] + 30, a['y'] + 12); pg.mouse.down(); pg.mouse.move(W + 300, -200, steps=8); pg.mouse.up(); pg.wait_for_timeout(700)
            q = f(); r('за край экрана и на панель не уходит', q['x'] + q['width'] <= W and q['y'] >= 66)
            pg.click('.fbk-min', force=True); pg.wait_for_timeout(700)
            r('свернулась в лампочку', f()['width'] < 80)
            pg.screenshot(path=OUT + 'fbmini.png')
            a = f(); pg.mouse.click(a['x'] + 30, a['y'] + 30); pg.wait_for_timeout(700)
            r('щелчок по лампочке — развернулась', f()['width'] > 200)
            pg.click('.fbk-opt >> nth=0', force=True); pg.wait_for_timeout(400)
            r('кнопка внутри карточки открывает форму, а не тащит', pg.locator('.fb-dialog').count() == 1)
        c.close()
    c = b.new_context(viewport={'width': 390, 'height': 780}, is_mobile=True, has_touch=True)
    pg = c.new_page(); pg.goto('file:///home/claude/board/dist/lodl/index.html'); pg.wait_for_timeout(1500)
    r('телефон: карточка под окном, на своём месте', pg.locator('.fbk').bounding_box()['y'] > pg.locator('.start-card').bounding_box()['y'] and not pg.evaluate("() => document.querySelector('.fbk').classList.contains('floating-fbk')"))
    r('ошибок нет', not errs); print(errs)
    b.close()
print('ИТОГ', sum(res), 'из', len(res))
