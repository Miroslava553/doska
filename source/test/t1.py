import sys, json, time
from playwright.sync_api import sync_playwright

URL = 'file:///home/claude/board/dist/doska.html?nopeer#r=test-aaaa-bbbb'
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
errors = []

def pen(page, pts, ptype='pen', shift=False):
    page.evaluate('''([pts, ptype, shift]) => {
      const c = document.getElementById('cv-over');
      const mk = (t, [x, y, p], buttons) => new PointerEvent(t, {bubbles: true, cancelable: true, pointerId: 7, pointerType: ptype,
        clientX: x, clientY: y, pressure: p, buttons, button: t === 'pointermove' ? -1 : 0, isPrimary: true, shiftKey: shift});
      c.dispatchEvent(mk('pointerdown', pts[0], 1));
      for (const p of pts.slice(1)) c.dispatchEvent(mk('pointermove', p, 1));
      c.dispatchEvent(mk('pointerup', pts[pts.length - 1], 0));
    }''', [pts, ptype, shift])

def count(page):
    return page.evaluate('() => window.__doska.items.size')

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1400, 'height': 860})
    ctx.add_init_script("if (!localStorage.getItem('doska:prefs')) localStorage.setItem('doska:prefs', JSON.stringify({name: 'Мира'}))")
    page = ctx.new_page()
    page.on('console', lambda m: m.type in ('error', 'warning') and errors.append(('A', m.type, m.text)))
    page.on('pageerror', lambda e: errors.append(('A', 'pageerror', str(e))))
    page.on('dialog', lambda d: d.accept('Мира'))
    page.goto(URL)
    page.wait_for_function('() => window.__doska', timeout=10000)
    page.wait_for_timeout(500)
    print('MathJax ok:', page.evaluate('() => !!(window.MathJax && MathJax.tex2svg)'))

    # перо: лёгкое касание-точка и линия с нажимом
    pen(page, [[300, 300, 0.02]])
    pts = [[200 + i * 8, 400 + 30 * __import__('math').sin(i / 5), 0.1 + i / 80] for i in range(60)]
    pen(page, pts)
    print('after pen:', count(page))
    # мышь
    page.keyboard.press('KeyR'); page.mouse.move(700, 250); page.mouse.down(); page.mouse.move(900, 380, steps=5); page.mouse.up()
    page.keyboard.press('KeyC'); page.mouse.move(1050, 330); page.mouse.down(); page.mouse.move(1110, 330, steps=4); page.mouse.up()
    page.keyboard.press('KeyA'); page.mouse.move(700, 500); page.mouse.down(); page.mouse.move(900, 450, steps=4); page.mouse.up()
    print('after shapes:', count(page))
    # текст
    page.keyboard.press('KeyT'); page.mouse.click(200, 560); page.keyboard.type('Задача 1. Найти корни'); page.keyboard.press('Escape')
    # формула
    page.keyboard.press('KeyF'); page.mouse.click(200, 640)
    page.keyboard.type('x_{1,2} = \\frac{-b \\pm \\sqrt{D}}{2a}'); page.keyboard.press('Enter')
    # график
    page.keyboard.press('KeyG'); page.mouse.click(700, 560)
    page.keyboard.press('Control+a'); page.keyboard.type('x^2 - 2x - 3; sin(x)'); page.keyboard.press('Enter')
    page.wait_for_timeout(600)
    print('after text/tex/graph:', count(page))
    types = page.evaluate('() => [...window.__doska.items.values()].map(i => i.type)')
    print(types)
    page.screenshot(path=OUT + 's1.png')

    # отмена/возврат
    page.keyboard.press('Escape'); page.keyboard.press('KeyP')
    n0 = count(page)
    page.keyboard.press('Control+z'); n1 = count(page)
    page.keyboard.press('Control+z'); n2 = count(page)
    page.keyboard.press('Control+Shift+z'); n3 = count(page)
    page.keyboard.press('Control+y'); n4 = count(page)
    print('undo/redo counts', n0, n1, n2, n3, n4)

    # вторая вкладка (BroadcastChannel)
    page2 = ctx.new_page()
    page2.on('console', lambda m: m.type in ('error',) and errors.append(('B', m.type, m.text)))
    page2.on('pageerror', lambda e: errors.append(('B', 'pageerror', str(e))))
    page2.on('dialog', lambda d: d.accept('Учитель'))
    page2.goto(URL)
    page2.wait_for_function('() => window.__doska', timeout=10000)
    page2.wait_for_timeout(800)
    print('tab2 sees', count(page2), 'tab1 has', count(page))
    # учитель рисует, ученица жмёт отмену — рисунок учителя должен остаться
    pen(page2, [[400 + i * 5, 200 + i * 2, 0.5] for i in range(30)])
    page.wait_for_timeout(300)
    c_before = count(page)
    page.keyboard.press('Control+z'); page.wait_for_timeout(300)
    teacher_ok = page.evaluate("() => [...window.__doska.items.values()].filter(i => i.type===\"stroke\").length")
    print('tab1 before/after own undo', c_before, count(page), 'teacher stroke still there:', teacher_ok, 'tab2:', count(page2))
    page.keyboard.press('Control+y'); page.wait_for_timeout(200)

    # ластик целиком
    n = count(page)
    page.keyboard.press('KeyE'); pen(page, [[290, 300, .5], [310, 300, .5]], ptype='mouse')
    print('object eraser removed dot:', n, '->', count(page))
    # точный ластик разрезает волну пополам
    page.keyboard.press('KeyE')  # переключить в точный
    print('precise:', page.evaluate('() => JSON.parse(localStorage.getItem("doska:prefs")).eraserPrecise'))
    n = count(page)
    pen(page, [[440, 330, .5], [440, 470, .5]], ptype='mouse')
    print('precise eraser split:', n, '->', count(page))
    page.keyboard.press('Control+z'); print('undo erase ->', count(page))
    page.keyboard.press('Control+y')

    # выделение рамкой и перенос
    page.keyboard.press('KeyV')
    page.mouse.move(680, 230); page.mouse.down(); page.mouse.move(930, 400, steps=5); page.mouse.up()
    sel = page.evaluate('() => window.__doska.S.sel.size'); print('selected', sel)
    x0 = page.evaluate('() => [...window.__doska.S.sel].map(id => window.__doska.items.get(id).x)')
    page.mouse.move(800, 300); page.mouse.down(); page.mouse.move(850, 330, steps=5); page.mouse.up()
    x1 = page.evaluate('() => [...window.__doska.S.sel].map(id => window.__doska.items.get(id).x)')
    print('moved', x0, '->', x1)
    page.wait_for_timeout(200)
    page.screenshot(path=OUT + 's2.png')
    print('tab2 count', count(page2))
    page2.screenshot(path=OUT + 's2b.png')

    # перезагрузка — ничего не теряется
    before = count(page)
    page.reload(); page.wait_for_function('() => window.__doska', timeout=10000); page.wait_for_timeout(800)
    print('after reload', before, '->', count(page))
    # закрыть вторую вкладку и перезагрузить первую ещё раз (данные только из IndexedDB)
    page2.close(); page.reload(); page.wait_for_function('() => window.__doska'); page.wait_for_timeout(800)
    print('after reload alone', count(page))
    page.screenshot(path=OUT + 's3.png')
    b.close()

print('ERRORS:')
for e in errors: print(e)
