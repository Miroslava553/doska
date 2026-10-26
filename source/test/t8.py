from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
URL = 'file:///home/claude/board/dist/doska.html?nopeer#r=v4te-stbo-ard1'
errors, dialogs = [], []
J = lambda pg, js: pg.evaluate(js)
def pen(pg, pts):
    pg.evaluate('''(pts) => { const c = document.getElementById('cv-over');
      const mk = (t, [x, y, p], b) => new PointerEvent(t, {bubbles: true, cancelable: true, pointerId: 9, pointerType: 'pen', clientX: x, clientY: y, pressure: p, buttons: b, button: t === 'pointermove' ? -1 : 0});
      c.dispatchEvent(mk('pointerdown', pts[0], 1)); for (const p of pts.slice(1)) c.dispatchEvent(mk('pointermove', p, 1)); c.dispatchEvent(mk('pointerup', pts[pts.length-1], 0)); }''', pts)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1440, 'height': 860})
    pg.on('pageerror', lambda e: errors.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    pg.on('dialog', lambda d: (dialogs.append(d.message), d.accept()))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Мира'}))")
    pg.goto(URL); pg.wait_for_function('() => window.__doska'); pg.wait_for_timeout(300)

    # пунктирная ручка
    pg.keyboard.press('KeyD'); print('tool D:', J(pg, '() => window.__doska.S.tool'))
    pen(pg, [[200 + i * 6, 200 + 40 * __import__('math').sin(i / 8), 0.5] for i in range(80)])
    print('dash stroke:', J(pg, '() => [...window.__doska.items.values()].map(i => [i.type, i.kind, i.size])'))

    # фигура пером и мышью → сразу выделение
    for how in ('mouse', 'pen'):
        J(pg, '() => window.__doska.setTool("fig:square")')
        if how == 'mouse': pg.mouse.click(700, 250)
        else: pen(pg, [[950, 250, .5]])
        print(how, 'after square → tool', J(pg, '() => window.__doska.S.tool'), '| figures', J(pg, '() => [...window.__doska.items.values()].filter(i => i.type === "fig").length'))
    pg.mouse.click(1100, 650); print('click on empty after figure → tool', J(pg, '() => window.__doska.S.tool'), '| creates nothing:', J(pg, '() => [...window.__doska.items.values()].filter(i => i.type === "fig").length'))

    # правильная форма: растянуть квадрат, вернуть
    pg.keyboard.press('KeyV'); pg.mouse.click(620, 250)
    f0 = J(pg, '() => { const d = window.__doska; return {...d.items.get([...d.S.sel][0])}; }')
    rx, ry = J(pg, f'() => window.__doska.toScreen({f0["x"]} + {f0["w"]}, {f0["y"]} + {f0["h"]} / 2)')
    pg.mouse.move(rx + 5, ry); pg.mouse.down(); pg.mouse.move(rx + 125, ry, steps=4); pg.mouse.up()
    f1 = J(pg, '() => { const d = window.__doska; return {...d.items.get([...d.S.sel][0])}; }')
    pg.click('.selbar [data-tip^="Выровнять"]')
    f2 = J(pg, '() => { const d = window.__doska; return {...d.items.get([...d.S.sel][0])}; }')
    print('square w×h:', round(f0['w']), round(f0['h']), '→ stretched', round(f1['w']), round(f1['h']), '→ regular', round(f2['w']), round(f2['h']))
    # прямоугольник и треугольник по Shift+R
    pg.keyboard.press('KeyR'); pg.mouse.move(300, 500); pg.mouse.down(); pg.mouse.move(520, 600, steps=3); pg.mouse.up()
    pg.keyboard.press('Shift+KeyR'); r = J(pg, '() => { const d = window.__doska; return {...d.items.get([...d.S.sel][0])}; }')
    print('rect → square by Shift+R:', round(r['w']), round(r['h']))
    J(pg, '() => window.__doska.setTool("fig:triangle")'); pg.mouse.move(700, 500); pg.mouse.down(); pg.mouse.move(900, 540, steps=3); pg.mouse.up()
    pg.keyboard.press('Shift+KeyR'); t = J(pg, '() => { const d = window.__doska; return {...d.items.get([...d.S.sel][0])}; }')
    print('triangle → kind', t['kind'], 'h/w', round(t['h'] / t['w'], 4))
    pg.keyboard.press('KeyY')
    for x, y in [(300, 700), (420, 660), (520, 720), (450, 800), (330, 790)]: pg.mouse.click(x, y); pg.wait_for_timeout(400)
    pg.mouse.click(301, 701); pg.keyboard.press('Shift+KeyR')
    P = J(pg, '() => { const d = window.__doska; return d.items.get([...d.S.sel][0]).pts; }')
    import math; sides = [round(math.dist(P[i], P[(i+1) % 5]), 2) for i in range(5)]
    print('pentagon sides after regular:', sides)
    pg.keyboard.press('Shift+KeyR'); print('toasts:', pg.locator('.toast').count())

    # Alt + перетаскивание
    n0 = J(pg, '() => window.__doska.items.size')
    pg.keyboard.press('Escape')
    sq = J(pg, '() => { const d = window.__doska; const it = [...d.items.values()].find(i => i.type === "rect"); return [...d.toScreen(it.x + 2, it.y + it.h / 2), it.x]; }')
    pg.keyboard.press('KeyV'); pg.keyboard.down('Alt'); pg.mouse.move(sq[0], sq[1]); pg.mouse.down(); pg.mouse.move(sq[0] + 60, sq[1] + 200, steps=6)
    pg.screenshot(path=OUT + 'v4-altdrag.png'); pg.mouse.up(); pg.keyboard.up('Alt')
    rects = J(pg, '() => [...window.__doska.items.values()].filter(i => i.type === "rect").map(i => Math.round(i.x))')
    print('alt-drag: items', n0, '→', J(pg, '() => window.__doska.items.size'), '| rect xs', rects)

    # Del без выделения — окно, Enter — удалить
    pg.keyboard.press('Shift+KeyN'); pg.wait_for_timeout(100); pg.keyboard.press('KeyP'); pen(pg, [[400, 400, .5], [450, 420, .5]])
    pg.keyboard.press('Escape'); pg.keyboard.press('Delete'); pg.wait_for_timeout(150)
    pg.screenshot(path=OUT + 'v4-delpage.png')
    print('dialog:', pg.locator('.dialog').text_content())
    pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
    print('pages after Enter:', pg.locator('.page:not(.add)').all_text_contents())
    pg.keyboard.press('Delete'); pg.wait_for_timeout(100); pg.click('.dialog >> text=Нет')
    print('pages after «Нет»:', pg.locator('.page:not(.add)').all_text_contents())

    # меню по наведению 0,3 с
    pg.locator('.tbtn.grp').first.hover(); pg.wait_for_timeout(200); a = pg.locator('.pop').count(); pg.wait_for_timeout(200); c = pg.locator('.pop').count()
    print('hover menu at 0.2s:', a, 'at 0.4s:', c)
    pg.mouse.move(700, 700); pg.wait_for_timeout(600)
    pg.keyboard.press('Shift+Digit1'); pg.wait_for_timeout(200); pg.screenshot(path=OUT + 'v4-board.png')
    b.close()
print('native dialogs:', dialogs); print('ERRORS', errors)
