from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude-doska/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/show/'
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1100, 'height': 760}, device_scale_factor=2)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Тест'}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v23t-ests-0002'); pg.wait_for_function('() => window.__doska')
    D = lambda: pg.evaluate('() => [...window.__doska.items.values()]')
    TS = lambda x, y: pg.evaluate(f"() => window.__doska.toScreen({x}, {y})")
    pg.evaluate('() => window.__doska.setTool("fig:cube")'); pg.mouse.click(500, 400); pg.wait_for_timeout(80)
    c = D()[-1]; x0, y0 = TS(c['x'], c['y']); x1, y1 = TS(c['x'] + c['w'], c['y'] + c['h'])
    pg.mouse.dblclick((x0 + x1) / 2, (y0 + y1) / 2); pg.wait_for_timeout(100)
    # найти ребро под курсором: идём по левой стороне рамки внутрь
    found = None
    for dx in range(0, 40, 2):
        pg.mouse.move(x0 + dx, (y0 + y1) / 2); pg.wait_for_timeout(40)
        h = pg.evaluate('() => window.__doska.S.hoverShape')
        if h and h['mode'] == 'edge': found = (x0 + dx, (y0 + y1) / 2, h); break
    print('edge found', found)
    pg.mouse.down(); pg.mouse.move(found[0] - 50, found[1], steps=5); pg.mouse.up(); pg.wait_for_timeout(100)
    pg.mouse.move(1000, 700); pg.wait_for_timeout(80)
    c2 = D()[-1]; print('cube m changed:', c2.get('m') is not None, 'w', round(c['w']), '→', round(c2['w']))
    pg.screenshot(path=OUT + 's-cube-edge.png', clip={'x': x0 - 110, 'y': y0 - 40, 'width': x1 - x0 + 170, 'height': y1 - y0 + 90})
    # линия: двойной щелчок — концы видны
    pg.keyboard.press('Escape'); pg.mouse.click(1000, 700); pg.keyboard.press('KeyL')
    pg.mouse.move(150, 650); pg.mouse.down(); pg.mouse.move(400, 600, steps=5); pg.mouse.up(); pg.keyboard.press('KeyV')
    ln = D()[-1]; pg.mouse.click(275, 625); pg.wait_for_timeout(450); pg.mouse.dblclick(275, 625); pg.wait_for_timeout(100)
    print('line shape mode:', pg.evaluate('() => window.__doska.S.shapeEdit') == ln['id'])
    pg.mouse.move(1000, 700); pg.wait_for_timeout(80)
    pg.screenshot(path=OUT + 's-line-edit.png', clip={'x': 110, 'y': 560, 'width': 330, 'height': 130})
    # эллипс: двойной щелчок ничего не ломает
    pg.mouse.click(1000, 700); pg.keyboard.press('KeyO') 
    print('errors', errs); b.close()
