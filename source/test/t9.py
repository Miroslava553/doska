from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
URL = 'file:///home/claude/board/dist/doska.html?nopeer#r=v5te-stbo-ard1'
errors = []
J = lambda pg, js: pg.evaluate(js)
tool = lambda pg: J(pg, '() => window.__doska.S.tool')
def pen(pg, pts, buttons=1, button=0):
    pg.evaluate('''([pts, buttons, button]) => { const c = document.getElementById('cv-over');
      const mk = (t, [x, y, p], b) => new PointerEvent(t, {bubbles: true, cancelable: true, pointerId: 9, pointerType: 'pen', clientX: x, clientY: y, pressure: p, buttons: b, button: t === 'pointermove' ? -1 : button});
      c.dispatchEvent(mk('pointerdown', pts[0], buttons)); for (const p of pts.slice(1)) c.dispatchEvent(mk('pointermove', p, buttons)); c.dispatchEvent(mk('pointerup', pts[pts.length-1], 0)); }''', [pts, buttons, button])
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1400, 'height': 860})
    pg.on('pageerror', lambda e: errors.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Мира'}))")
    pg.goto(URL); pg.wait_for_function('() => window.__doska'); pg.wait_for_timeout(300)
    pg.keyboard.press('KeyP')
    # короткое нажатие — насовсем
    pg.keyboard.press('KeyE'); print('tap E → stays:', tool(pg))
    pg.keyboard.press('KeyP')
    # зажала E, стёрла, отпустила — вернулось перо
    pen(pg, [[200, 200, .5], [400, 200, .5]])
    pg.keyboard.down('KeyE'); print('holding E:', tool(pg))
    pen(pg, [[300, 180, .5], [300, 220, .5]])
    pg.keyboard.up('KeyE'); print('after release (used):', tool(pg), '| strokes left', J(pg, '() => window.__doska.items.size'))
    # зажала V, сдвинула, отпустила
    pen(pg, [[200, 400, .5], [400, 420, .5]])
    x_before = J(pg, '() => Math.round([...window.__doska.items.values()][0].x)')
    pg.keyboard.down('KeyV'); pg.mouse.move(300, 410); pg.mouse.down(); pg.mouse.move(360, 470, steps=4); pg.mouse.up(); pg.keyboard.up('KeyV')
    print('hold V + drag → back to', tool(pg), '| x before', x_before, 'after', J(pg, '() => Math.round([...window.__doska.items.values()][0].x)'))
    # зажала L, нарисовала линию → снова перо
    pg.keyboard.down('KeyL'); pg.mouse.move(600, 300); pg.mouse.down(); pg.mouse.move(800, 300, steps=4); pg.mouse.up(); pg.keyboard.up('KeyL')
    print('hold L + line → back to', tool(pg), '| types', J(pg, '() => [...window.__doska.items.values()].map(i => i.type)'))

    # быстрое меню: правый щелчок по пустому месту
    pg.mouse.click(700, 600, button='right'); pg.wait_for_timeout(150)
    print('radial buttons:', pg.locator('.radial .rbtn').count(), 'colors:', pg.locator('.radial .rcol').count())
    pg.screenshot(path=OUT + 'v5-radial.png')
    pg.locator('.radial .rbtn[data-tip="Маркер"]').click(); print('picked from radial:', tool(pg), '| radial closed:', pg.locator('.radial').count() == 0)
    # кнопка пера без движения
    pen(pg, [[700, 600, .5]], buttons=2, button=2); pg.wait_for_timeout(100)
    print('pen barrel tap opens radial:', pg.locator('.radial').count())
    pg.locator('.radial .rcol').nth(2).click(); print('color pick:', J(pg, '() => JSON.parse(localStorage.getItem("doska:prefs")).hlColor'), tool(pg))
    # правый щелчок по объекту — меню действий
    pg.mouse.click(700, 300, button='right'); pg.wait_for_timeout(100)
    print('right click on object → menu:', pg.locator('.pop .mi').count() > 0, '| radial:', pg.locator('.radial').count())
    pg.keyboard.press('Escape'); pg.mouse.click(1000, 700); pg.keyboard.press('KeyP')

    # сдвиг у края
    v0 = J(pg, '() => ({...window.__doska.S.view})')
    pen(pg, [[1300, 500, .5], [1340, 510, .5]]); pg.wait_for_timeout(300)
    v1 = J(pg, '() => ({...window.__doska.S.view})')
    pg.wait_for_timeout(700)
    v2 = J(pg, '() => ({...window.__doska.S.view})')
    print('edge pan: after 0.3s dx', round(v1['x'] - v0['x']), '| after 1s dx', round(v2['x'] - v0['x']))
    pen(pg, [[600, 820, .5], [650, 830, .5]]); pg.wait_for_timeout(1100)
    v3 = J(pg, '() => ({...window.__doska.S.view})')
    print('bottom edge: dy', round(v3['y'] - v2['y']))
    pen(pg, [[600, 400, .5], [650, 410, .5]]); pg.wait_for_timeout(1000)
    print('middle: no move', J(pg, '() => window.__doska.S.view.y') == v3['y'])
    # «Да» без Enter
    pg.keyboard.press('Shift+KeyN'); pg.keyboard.press('Delete'); pg.wait_for_timeout(100)
    print('dialog:', pg.locator('.dialog').text_content()); pg.keyboard.press('Escape')
    b.close()
print('ERRORS', errors)
