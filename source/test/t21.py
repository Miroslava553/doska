# Линия / стрелка / пунктирная линия: инструмент остаётся после рисования; прочие фигуры — выделяются
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1200, 'height': 760})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Мира'}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=line-keep-tst1'); pg.wait_for_function('() => window.__doska')
    st = lambda: pg.evaluate('() => [window.__doska.S.tool, window.__doska.S.sel.size]')
    def drag(x0, y0, x1, y1):
        pg.mouse.move(x0, y0); pg.mouse.down(); pg.mouse.move((x0+x1)/2, (y0+y1)/2, steps=4); pg.mouse.move(x1, y1, steps=4); pg.mouse.up(); pg.wait_for_timeout(60)
    pg.keyboard.press('KeyL'); drag(300, 200, 600, 200); drag(300, 240, 600, 240); print('line x2', st())
    pg.keyboard.press('KeyL'); print('L again ->', st()[0])
    drag(300, 300, 600, 300); drag(300, 340, 600, 380); print('dline x2', st())
    pg.keyboard.press('KeyL'); print('L again ->', st()[0])
    pg.keyboard.press('KeyA'); drag(300, 420, 600, 420); drag(300, 460, 600, 460); print('arrow x2', st())
    pg.keyboard.press('KeyR'); drag(700, 200, 850, 300); print('rect ->', st())
    its = pg.evaluate('() => [...window.__doska.items.values()].map(i => [i.type, !!i.dash])')
    print('items', its)
    pg.keyboard.press('Escape'); pg.screenshot(path=OUT + 'lines.png')
    # меню фигур
    pg.keyboard.press('KeyL'); pg.hover('.tbtn.grp >> nth=0'); pg.wait_for_timeout(500); pg.screenshot(path=OUT + 'shapes-menu.png')
    print('errors', errs); b.close()
