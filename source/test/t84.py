# Мгновенная перезагрузка сразу после штриха: ничего не теряется
from playwright.sync_api import sync_playwright
import sys
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1400, 'height': 860})
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=perx-aaaa-room'); pg.wait_for_function('() => window.__doska'); pg.wait_for_timeout(1500)
    lost = 0
    for k in range(10):
        pg.keyboard.press('p'); pg.mouse.move(300 + k * 30, 300); pg.mouse.down(); pg.mouse.move(400 + k * 30, 400, steps=8); pg.mouse.up()
        n = pg.evaluate('() => window.__doska.items.size')
        pg.reload(); pg.wait_for_function('() => window.__doska'); pg.wait_for_timeout(1200)
        m = pg.evaluate('() => window.__doska.items.size')
        if m < n: lost += 1
        print(k, n, '→', m)
    print('потеряно при мгновенной перезагрузке', lost, 'из 10')
    b.close()
