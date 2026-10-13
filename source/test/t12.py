from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 600, 'height': 400}, device_scale_factor=3)
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Мира'}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=curs-test-ccc3'); pg.wait_for_function('() => window.__doska'); pg.wait_for_timeout(200)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    for i, (k, col) in enumerate([('KeyP', None), ('KeyD', None), ('KeyM', None)]):
        pg.keyboard.press(k)
        if i == 0: pg.keyboard.press('Digit2')
        pg.mouse.move(100 + i * 150, 250); pg.wait_for_timeout(80)
        pg.screenshot(path=OUT + f'cursor{i}.png', clip={'x': 70 + i * 150, 'y': 210, 'width': 60, 'height': 60})
    print('css cursor:', pg.evaluate('() => document.getElementById("cv-over").style.cursor'))
    # курсор не пропадает во время рисования
    pg.keyboard.press('KeyP'); pg.mouse.move(300, 300); pg.mouse.down(); pg.mouse.move(380, 320, steps=6); pg.wait_for_timeout(50)
    pg.screenshot(path=OUT + 'cursor-drawing.png', clip={'x': 280, 'y': 260, 'width': 140, 'height': 90}); pg.mouse.up()
    print('errors', errs)
    b.close()
