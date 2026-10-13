from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
URL = 'file:///home/claude/board/dist/doska.html?nopeer#r=v6te-stbo-ard1'
errors = []
J = lambda pg, js: pg.evaluate(js)
W, H = 1400, 860
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': W, 'height': H})
    pg.on('pageerror', lambda e: errors.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Мира'}))")
    pg.goto(URL); pg.wait_for_function('() => window.__doska'); pg.wait_for_timeout(300)
    print('toasts at start:', pg.locator('.toast').count(), '| status:', pg.text_content('.status'))
    # перо упирается в правый край и стоит
    pg.keyboard.press('KeyP')
    x0 = J(pg, '() => window.__doska.S.view.x')
    pg.mouse.move(1000, 400); pg.mouse.down(); pg.mouse.move(W - 8, 400, steps=10)
    samples = []
    for i in range(6): pg.wait_for_timeout(100); samples.append(round(J(pg, '() => window.__doska.S.view.x') - x0))
    pg.mouse.up()
    st = J(pg, '() => { const it = [...window.__doska.items.values()].find(i => i.type === "stroke"); const a = it.pts; let mx = 0; for (let i = 0; i < a.length; i += 3) mx = Math.max(mx, a[i] / 10); return Math.round(mx); }')
    print('pen at right edge: view shift every 100ms', samples, '| stroke length (world)', st)
    pg.wait_for_timeout(300); x1 = J(pg, '() => window.__doska.S.view.x')
    pg.wait_for_timeout(300); print('stops after release:', x1 == J(pg, '() => window.__doska.S.view.x'))
    # ластик у нижнего края
    pg.keyboard.press('KeyE'); y0 = J(pg, '() => window.__doska.S.view.y')
    pg.mouse.move(600, 500); pg.mouse.down(); pg.mouse.move(600, H - 6, steps=8); pg.wait_for_timeout(400); pg.mouse.up()
    print('eraser at bottom edge: dy', round(J(pg, '() => window.__doska.S.view.y') - y0))
    # без нажатия — упёрлась в левый край
    x2 = J(pg, '() => window.__doska.S.view.x')
    pg.mouse.move(300, 500); pg.mouse.move(0, 500, steps=5)
    a = []; 
    for i in range(5): pg.wait_for_timeout(200); a.append(round(J(pg, '() => window.__doska.S.view.x') - x2))
    print('hover at left edge (every 200ms):', a)
    pg.mouse.move(300, 500); pg.wait_for_timeout(100); x3 = J(pg, '() => window.__doska.S.view.x'); pg.wait_for_timeout(200)
    print('stops when leaving edge:', x3 == J(pg, '() => window.__doska.S.view.x'))
    # у края, но на высоте панелей — не едет
    x4 = J(pg, '() => window.__doska.S.view.x'); pg.mouse.move(W - 1, 30); pg.wait_for_timeout(400)
    print('top area does not scroll:', x4 == J(pg, '() => window.__doska.S.view.x'))
    # подписи в меню фигур
    pg.mouse.move(700, 600); pg.locator('.tbtn.grp').first.hover(); pg.wait_for_timeout(450)
    print('shapes pop text:', pg.locator('.pop').inner_text().replace('\n', ' | '))
    pg.screenshot(path=OUT + 'v6-shapes.png')
    pg.mouse.move(700, 600); pg.wait_for_timeout(600)
    for k in ['KeyE', 'KeyE', 'KeyV', 'KeyV']: pg.keyboard.press(k)
    print('toasts after E,E,V,V:', pg.locator('.toast').count())
    b.close()
print('ERRORS', errors)
