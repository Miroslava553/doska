import math
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude-doska/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/show/'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1300, 'height': 900})
    ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}))")
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v29r-olee-0060'); pg.wait_for_timeout(2500)
    shapes = {
      'hers':   [[563, 200], [730, 453], [838, 887], [455, 634]],
      'mild':   [[120, 10], [300, 0], [400, 200], [0, 200]],
      'rot':    [[0, 0], [100, 0], [180, 160], [-60, 150]],
    }
    off = 0
    for name, P in shapes.items():
        for start in range(4):  # разные начальные вершины — как бы ни был устроен обход
            Q0 = P[start:] + P[:start]
            iid = f'{name}{start}'
            pg.evaluate("([id, pts, x]) => { const d = window.__doska; d.act(() => d.addItem({ id, type: 'poly', fk: 'trapezoid', page: d.S.page, z: 5, x, y: -350, s: 1, closed: true, size: 2.7, color: '#1971c2', pts })); }", [iid, Q0, -600 + off])
            pg.evaluate("(id) => { const d = window.__doska; d.setTool('select'); d.S.sel.clear(); d.S.sel.add(id); }", iid)
            pg.keyboard.press('Shift+R'); pg.wait_for_timeout(50)
            Q = pg.evaluate("(id) => window.__doska.items.get(id).pts", iid)
            n = 4; side = [math.dist(Q[i], Q[(i+1)%4]) for i in range(4)]
            d = lambda i: (Q[(i+1)%4][0]-Q[i][0], Q[(i+1)%4][1]-Q[i][1])
            cr = lambda i, j: abs(d(i)[0]*d(j)[1]-d(i)[1]*d(j)[0])/(math.hypot(*d(i))*math.hypot(*d(j)))
            print(name, start, 'sides', [round(x) for x in side], 'par02', cr(0,2) < 1e-6, 'par13', cr(1,3) < 1e-6)
        off += 0
    pg.evaluate("() => { const d = window.__doska; d.S.sel.clear(); for (const id of [...d.items.keys()]) if (!id.startsWith('hers0')) d.act(() => d.doc.getMap('items').delete(id)); d.S.sel.add('hers0'); }")
    pg.mouse.move(5, 800); pg.wait_for_timeout(200)
    pg.screenshot(path=OUT + 'trap-fix.png')
    print(errs); b.close()
