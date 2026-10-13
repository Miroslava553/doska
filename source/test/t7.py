import math
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
URL = 'file:///home/claude/board/dist/doska.html?nopeer#r=v3te-stbo-ard1'
errors, dialogs = [], []
def J(pg, js): return pg.evaluate(js)
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1440, 'height': 860})
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    pg.on('dialog', lambda d: (dialogs.append(d.message), d.accept()))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Мира'}))")
    pg.goto(URL); pg.wait_for_function('() => window.__doska'); pg.wait_for_timeout(300)

    # 7. фигура после создания выделена
    J(pg, '() => window.__doska.setTool("fig:triangle")'); pg.mouse.move(300, 300); pg.mouse.down(); pg.mouse.move(500, 380, steps=4); pg.mouse.up()
    print('after triangle: tool', J(pg, '() => window.__doska.S.tool'), 'sel', J(pg, '() => [...window.__doska.S.sel].map(id => window.__doska.items.get(id).kind)'))
    # 5. сделать равносторонним
    pg.click('.selbar [data-tip^="Сделать равносторонним"]')
    it = J(pg, '() => { const d = window.__doska; return d.items.get([...d.S.sel][0]); }')
    print('equilateral: kind', it['kind'], 'h/w', round(it['h'] / it['w'], 4), '(√3/2 = 0.8660)')
    pg.wait_for_timeout(100); pg.screenshot(path=OUT + 'v3-eq.png')

    # треугольник по точкам → равнобедренный
    pg.keyboard.press('KeyY')
    for x, y in [(700, 600), (900, 610), (760, 420)]: pg.mouse.click(x, y); pg.wait_for_timeout(400)
    pg.mouse.click(701, 601)
    pg.click('.selbar [data-tip^="Сделать равнобедренным"]')
    P = J(pg, '() => { const d = window.__doska; const it = d.items.get([...d.S.sel][0]); return it.pts; }')
    sides = sorted(round(math.dist(P[i], P[(i + 1) % 3]), 2) for i in range(3))
    print('isosceles sides:', sides)

    # 1. растянуть по горизонтали за боковую ручку
    J(pg, '() => window.__doska.setTool("rect")'); pg.mouse.move(300, 500); pg.mouse.down(); pg.mouse.move(400, 600, steps=3); pg.mouse.up()
    r0 = J(pg, '() => { const d = window.__doska; return d.items.get([...d.S.sel][0]); }')
    rx, ry = J(pg, f'() => window.__doska.toScreen({r0["x"]} + {r0["w"]}, {r0["y"]} + {r0["h"]} / 2)')
    pg.mouse.move(rx + 5, ry); pg.wait_for_timeout(80)
    cur = J(pg, '() => document.getElementById("cv-over").style.cursor')
    pg.mouse.down(); pg.mouse.move(rx + 105, ry + 30, steps=5); pg.mouse.up()
    r1 = J(pg, '() => { const d = window.__doska; return d.items.get([...d.S.sel][0]); }')
    print('side handle cursor', cur, '| rect w', round(r0['w']), '->', round(r1['w']), 'h', round(r0['h']), '->', round(r1['h']), 'x same:', round(r0['x']) == round(r1['x']))
    # растянуть штрих по вертикали
    pg.keyboard.press('KeyP'); pg.mouse.move(600, 200); pg.mouse.down(); pg.mouse.move(700, 230, steps=6); pg.mouse.up()
    pg.keyboard.press('KeyV'); pg.mouse.click(650, 215)
    s0 = J(pg, '() => { const d = window.__doska; const it = d.items.get([...d.S.sel][0]); return [it.type, window.__doska.items.get([...d.S.sel][0]).pts.length]; }')
    bb = J(pg, '() => { const d = window.__doska; const it = d.items.get([...d.S.sel][0]); return [it.x, it.y]; }')
    hx, hy = J(pg, '() => { const r = [...document.querySelectorAll("canvas")]; const d = window.__doska; const it = d.items.get([...d.S.sel][0]); return null; }') or (0, 0)

    # 2. листы: «+» много раз — активная вкладка видна
    for i in range(9): pg.click('.page.add'); pg.wait_for_timeout(60)
    pg.wait_for_timeout(500)
    vis = J(pg, '() => { const box = document.querySelector(".pages").getBoundingClientRect(); const t = document.querySelector(".page.on").getBoundingClientRect(); return t.left >= box.left - 1 && t.right <= box.right + 1; }')
    print('active tab visible after adding 9 pages:', vis, '|', pg.text_content('.page.on'))

    # 3. правая кнопка по листу: переименовать, удалить с отменой
    pg.click('.page.on', button='right'); pg.wait_for_timeout(100)
    pg.screenshot(path=OUT + 'v3-pagemenu.png')
    pg.click('.pop >> text=Переименовать'); pg.keyboard.press('Control+a'); pg.keyboard.type('Задачи на дом'); pg.keyboard.press('Enter'); pg.wait_for_timeout(100)
    print('renamed:', pg.text_content('.page.on'))
    n0 = len(J(pg, '() => [...document.querySelectorAll(".page:not(.add)")]'))
    pg.click('.page.on', button='right'); pg.click('.pop >> text=Удалить лист'); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT + 'v3-undo.png')
    n1 = len(J(pg, '() => [...document.querySelectorAll(".page:not(.add)")]'))
    pg.click('.undo-btn'); pg.wait_for_timeout(200)
    n2 = len(J(pg, '() => [...document.querySelectorAll(".page:not(.add)")]'))
    print('pages before/after delete/after undo:', n0, n1, n2, '| restored name:', pg.text_content('.page.on'))
    pg.click('.page.on', button='right'); pg.click('.pop >> text=Удалить лист'); pg.wait_for_timeout(6800)
    print('after 6s really deleted:', J(pg, '() => [...window.__doska.doc.getMap("pages").values()].filter(m => m.get("name") === "Задачи на дом").length === 0'))

    # 6. список фигур по наведению через 2 секунды
    shapes = pg.locator('.tbtn.grp').first
    shapes.hover(); pg.wait_for_timeout(1200); a = pg.locator('.pop').count()
    pg.wait_for_timeout(1100); b2 = pg.locator('.pop').count()
    pg.screenshot(path=OUT + 'v3-hover.png')
    pg.mouse.move(700, 600); pg.wait_for_timeout(700); c = pg.locator('.pop').count()
    print('hover menu: at 1.2s', a, 'at 2.3s', b2, 'after leaving', c)

    # правая кнопка по объекту
    pg.keyboard.press('PageUp'); pg.wait_for_timeout(100)
    while J(pg, '() => document.querySelector(".page.on").textContent') != 'Лист 1': pg.keyboard.press('PageUp'); pg.wait_for_timeout(50)
    pg.keyboard.press('Escape')
    tx, ty = J(pg, '() => { const d = window.__doska; const it = [...d.items.values()].find(i => i.type === "rect"); return d.toScreen(it.x + it.w, it.y + 1); }')
    pg.mouse.click(tx - 2, ty, button='right'); pg.wait_for_timeout(150)
    print('object context menu:', pg.locator('.pop .mi').all_text_contents()[:5])
    pg.screenshot(path=OUT + 'v3-ctx.png')
    pg.keyboard.press('Escape'); pg.mouse.click(1300, 820)
    b.close()
print('native dialogs:', dialogs)
print('ERRORS', errors)
