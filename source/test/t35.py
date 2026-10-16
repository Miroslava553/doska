from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude-doska/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/show/'
with sync_playwright() as p:
    b = p.chromium.launch()
    for pos, w in [('bottom', 1280), ('bottom', 1000), ('left', 1280)]:
        pg = b.new_page(viewport={'width': w, 'height': 760}, device_scale_factor=1)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Тест', barPos: '%s'}))" % pos)
        pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v24t-ests-0002'); pg.wait_for_function('() => window.__doska'); pg.wait_for_timeout(300)
        r = pg.evaluate("() => { const t = document.querySelector('.toolbar').getBoundingClientRect(), z = document.querySelector('.zoombar').getBoundingClientRect(); return {tb:[t.left,t.top,t.right,t.bottom], zoom:[z.left,z.top,z.right,z.bottom]} }")
        print(pos, w, r, errs)
        pg.screenshot(path=OUT + f'b-{pos}-{w}.png'); pg.close()
    b.close()
