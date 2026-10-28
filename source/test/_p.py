from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h in ((1332, 946), (1366, 768), (1920, 1080)):
        pg = b.new_page(viewport={'width': w, 'height': h})
        pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));")
        pg.goto('file:///home/claude/board/dist/site/index.html?nopeer#r=popx-aaaa-bbbb'); pg.wait_for_timeout(1200)
        btn = pg.locator('.tbtn[data-grp="shapes"], [data-tip^="Фигуры"]').first
        for k in range(4):
            btn.click(); pg.wait_for_timeout(400)
            r = pg.evaluate("() => { const p = document.querySelector('.pop'); if (!p) return 'нет'; const r = p.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), p.style.left]; }")
            br = btn.bounding_box()
            print(w, k, 'кнопка', round(br['x']), 'окно', r)
            pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        pg.close()
    b.close()
