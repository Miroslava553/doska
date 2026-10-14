# v21: поворот и вершины у плоских фигур, курсоры, урок из файла на новый лист, без курсора собеседника
from playwright.sync_api import sync_playwright
import json
OUT = '/tmp/claude-0/-home-claude-doska/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1300, 'height': 800}, accept_downloads=True)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Тест'}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=rot2-dtes-0001'); pg.wait_for_function('() => window.__doska')
    D = lambda: pg.evaluate('() => [...window.__doska.items.values()]')
    cur = lambda: pg.evaluate('() => document.getElementById("cv-over").style.cursor')[:60]
    def drag(a, b, steps=8, shift=False):
        pg.mouse.move(*a)
        if shift: pg.keyboard.down('Shift')
        pg.mouse.down(); pg.mouse.move(*b, steps=steps); pg.mouse.up()
        if shift: pg.keyboard.up('Shift')
        pg.wait_for_timeout(80)
    # прямоугольник → поворот за стрелку
    pg.keyboard.press('KeyR'); drag((300, 300), (500, 420))
    it = D()[-1]; print('rect selected, tool', pg.evaluate('() => window.__doska.S.tool'))
    x0, y0 = pg.evaluate(f"() => window.__doska.toScreen({it['x']}, {it['y']})"); x1, y1 = pg.evaluate(f"() => window.__doska.toScreen({it['x'] + it['w']}, {it['y'] + it['h']})")
    pg.mouse.move(650, 760); pg.wait_for_timeout(60)
    pg.screenshot(path=OUT + 'rot-rect-handles.png', clip={'x': x0 - 60, 'y': y0 - 60, 'width': x1 - x0 + 120, 'height': y1 - y0 + 120})
    r = 2 + 14 + 9.2  # запас рамки + середина дуги
    rx, ry = x1 + r, y0 - r
    pg.mouse.move(rx, ry); pg.wait_for_timeout(60); print('cursor over rotate:', 'rot' if 'svg' in cur() else cur())
    drag((rx, ry), (rx + 40, ry + 120), shift=True)
    it2 = D()[-1]; print('after rotate → type', it2['type'], 'fk', it2.get('fk'), 'pts', len(it2.get('pts', [])))
    pg.mouse.move(650, 760); pg.wait_for_timeout(60)
    pg.screenshot(path=OUT + 'rot-rect-after.png', clip={'x': x0 - 80, 'y': y0 - 80, 'width': x1 - x0 + 160, 'height': y1 - y0 + 160})
    # вершина многоугольника
    v = pg.evaluate(f"() => window.__doska.toScreen({it2['x']} + {it2['pts'][0][0]}, {it2['y']} + {it2['pts'][0][1]})")
    pg.mouse.move(*v); pg.wait_for_timeout(60); print('cursor over vertex:', 'vx' if 'svg' in cur() else cur())
    drag(v, (v[0] - 50, v[1] - 30)); it3 = D()[-1]; print('vertex moved:', it3['pts'] != it2['pts'])
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(60); print('undo vertex:', D()[-1]['pts'] == it2['pts'])
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(60); print('undo rotate → back to', D()[-1]['type'])
    # отрезок: конец тянется
    pg.mouse.click(1000, 700); pg.keyboard.press('KeyL'); drag((700, 200), (900, 200)); pg.keyboard.press('KeyV')
    ln = D()[-1]; pg.mouse.click(800, 200); pg.wait_for_timeout(60)
    e = pg.evaluate(f"() => window.__doska.toScreen({ln['x']} + {ln['x2']}, {ln['y']} + {ln['y2']})")
    drag(e, (e[0] + 40, e[1] + 60)); ln2 = D()[-1]; print('line end moved:', round(ln['x2']), round(ln['y2']), '→', round(ln2['x2']), round(ln2['y2']))
    # эллипс: поворот
    pg.mouse.click(1000, 700); pg.keyboard.press('KeyO'); drag((900, 400), (1100, 480))
    el_ = D()[-1]; x0, y0 = pg.evaluate(f"() => window.__doska.toScreen({el_['x']}, {el_['y']})"); x1, y1 = pg.evaluate(f"() => window.__doska.toScreen({el_['x'] + el_['w']}, {el_['y'] + el_['h']})")
    rx, ry = x1 + 2 + 5 + 9.2, y1 + 2 + 5 + 9.2
    drag((rx, ry), (rx - 60, ry + 40)); el2 = D()[-1]; print('ellipse rot:', el2.get('rot'))
    pg.mouse.move(650, 760); pg.wait_for_timeout(60); pg.screenshot(path=OUT + 'rot-all.png')
    # треугольник из планиметрии: поворот → многоугольник с подписью
    pg.mouse.click(1000, 760); pg.evaluate('() => window.__doska.setTool("fig:rtriangle")'); pg.mouse.click(300, 650); pg.wait_for_timeout(80)
    tr = D()[-1]; x1, y0 = pg.evaluate(f"() => window.__doska.toScreen({tr['x'] + tr['w']}, {tr['y']})")
    drag((x1 + 4 + 14 + 11, y0 - 4 - 14 - 11), (x1 + 60, y0 + 20)); tr2 = D()[-1]; print('rtriangle rotated →', tr2['type'], tr2.get('fk'))
    # меню: нет курсора собеседника и полного экрана; урок из файла — на новые листы
    pg.mouse.click(1000, 760); pg.click('.tl .tbtn >> nth=0'); pg.wait_for_timeout(150)
    txt = pg.locator('.pop').inner_text(); print('menu has cursor item:', 'курсор' in txt.lower(), '| fullscreen:', 'Полный экран' in txt, '| import label:', 'на новый лист' in txt)
    pg.keyboard.press('Escape'); pg.mouse.click(1000, 760)
    with pg.expect_download() as d: pg.keyboard.press('Control+s')
    path = d.value.path(); pages0 = pg.evaluate('() => document.querySelectorAll(".page").length')
    with pg.expect_file_chooser() as fc: pg.keyboard.press('Control+o')
    import shutil; shutil.copy(path, OUT + 'Алгебра урок 3.doska'); fc.value.set_files(OUT + 'Алгебра урок 3.doska'); pg.wait_for_timeout(400)
    tabs = pg.evaluate('() => [...document.querySelectorAll(".page")].map(b => b.textContent)'); print('pages:', pages0, '→', tabs)
    print('items on new page:', pg.evaluate('() => window.__doska.pageItems().length'))
    print('errors', errs); b.close()
