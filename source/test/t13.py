from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
errors = []
J = lambda pg, js: pg.evaluate(js)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1400, 'height': 800})
    pg.on('pageerror', lambda e: errors.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    # старые настройки (3 уровня) — должны перейти на новые числа
    pg.add_init_script("if (!localStorage.getItem('doska:prefs')) localStorage.setItem('doska:prefs', JSON.stringify({name: 'Мира', sizeIdx: {pen: 2, hl: 1, eraser: 0, text: 1}}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=size-test-ddd4'); pg.wait_for_function('() => window.__doska'); pg.wait_for_timeout(300)
    print('migrated sizes:', J(pg, '() => JSON.parse(localStorage.getItem("doska:prefs")).size'))
    # курсор-ручка исчезает, когда указатель ушёл на панель
    pg.keyboard.press('KeyP'); pg.mouse.move(500, 400); pg.wait_for_timeout(80)
    a = J(pg, '() => !!window.__doska && document.getElementById("cv-over") && true')
    pg.mouse.move(500, 400); pg.mouse.down(); pg.mouse.move(560, 420, steps=5); pg.mouse.up()
    undo = pg.locator('.toolbar .tbtn[data-tip^="Отменить"]').bounding_box()
    pg.mouse.move(undo['x'] + undo['width'] / 2, undo['y'] + undo['height'] / 2, steps=8); pg.wait_for_timeout(100)
    pg.screenshot(path=OUT + 'v8-undo-hover.png', clip={'x': 300, 'y': 0, 'width': 1100, 'height': 500})
    px = pg.evaluate('''() => { const c = document.getElementById('cv-over'); const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; }''')
    print('overlay pixels while on undo button (0 = no stuck cursor):', px)
    # ползунок толщины
    pg.mouse.move(700, 500); pg.wait_for_timeout(200)
    pg.locator('.toolbar .tbtn[data-tip^="Перо"]').hover(); pg.wait_for_timeout(450)
    print('size popover open:', pg.locator('.sz-pop').count(), '| presets:', pg.locator('.sz-chip .sz-n').all_text_contents())
    pg.screenshot(path=OUT + 'v8-size.png', clip={'x': 600, 'y': 0, 'width': 800, 'height': 260})
    pg.locator('.sz-chip', has_text='8').first.click()
    print('pen size after preset 8:', J(pg, '() => JSON.parse(localStorage.getItem("doska:prefs")).size.pen'))
    pg.evaluate('() => { const r = document.querySelector(".sz-range"); r.value = 12.5; r.dispatchEvent(new Event("input")); r.dispatchEvent(new Event("change")); }')
    print('slider 12.5 →', J(pg, '() => JSON.parse(localStorage.getItem("doska:prefs")).size.pen'))
    pg.mouse.move(700, 600); pg.wait_for_timeout(600)
    pg.mouse.move(400, 600); pg.mouse.down(); pg.mouse.move(600, 600, steps=6); pg.mouse.up()
    print('new stroke size:', J(pg, '() => [...window.__doska.items.values()].pop().size'))
    pg.keyboard.press('BracketLeft'); print('[ →', J(pg, '() => JSON.parse(localStorage.getItem("doska:prefs")).size.pen'))
    pg.keyboard.press('BracketRight'); pg.keyboard.press('BracketRight'); print(']] →', J(pg, '() => JSON.parse(localStorage.getItem("doska:prefs")).size.pen'))
    # выделенное получает новую толщину
    pg.keyboard.press('KeyV'); pg.mouse.click(500, 600)
    pg.keyboard.press('BracketLeft'); print('selected stroke size after [:', J(pg, '() => { const d = window.__doska; return d.items.get([...d.S.sel][0])?.size; }'))
    pg.keyboard.press('KeyE'); pg.locator('.toolbar .tbtn[data-tip^="Ластик"]').click(); pg.wait_for_timeout(100)
    print('eraser presets:', pg.locator('.sz-chip .sz-n').all_text_contents())
    b.close()
print('ERRORS', errors)
