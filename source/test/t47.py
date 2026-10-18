import math
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude-doska/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/show/'
def props(P):
    n = len(P); side = lambda i: math.dist(P[i], P[(i+1)%n])
    vec = lambda i: (P[(i+1)%n][0]-P[i][0], P[(i+1)%n][1]-P[i][1])
    def ang(i):
        a = (P[i-1][0]-P[i][0], P[i-1][1]-P[i][1]); b = (P[(i+1)%n][0]-P[i][0], P[(i+1)%n][1]-P[i][1])
        return round(math.degrees(math.acos((a[0]*b[0]+a[1]*b[1])/math.hypot(*a)/math.hypot(*b))), 1)
    par = lambda i, j: abs(vec(i)[0]*vec(j)[1]-vec(i)[1]*vec(j)[0]) / (math.hypot(*vec(i))*math.hypot(*vec(j))) < 1e-3
    return {'sides': [round(side(i), 1) for i in range(n)], 'angles': [ang(i) for i in range(n)], 'par02': par(0, 2) if n == 4 else None, 'par13': par(1, 3) if n == 4 else None}
CASES = [
  ('parallelogram', [[60, 0], [200, 0], [150, 100], [0, 120]]),
  ('rect',          [[0, 0], [200, 10], [200, 120], [0, 120]]),
  ('square',        [[0, 0], [150, 0], [170, 150], [0, 150]]),
  ('rhombus',       [[100, 0], [200, 70], [100, 160], [0, 80]]),
  ('trapezoid',     [[50, 10], [150, 0], [200, 120], [0, 120]]),
  ('rtriangle',     [[10, 0], [200, 150], [0, 150]]),
  ('triangle',      [[130, 0], [200, 150], [0, 150]]),
  ('eqtriangle',    [[130, 0], [200, 150], [0, 150]]),
  ('hexagon',       [[50, 0], [150, 0], [200, 90], [150, 170], [50, 170], [0, 80]]),
  (None,            [[0, 0], [160, 20], [180, 140], [10, 120]]),
]
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1300, 'height': 850})
    ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}))")
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v29r-olee-0049'); pg.wait_for_timeout(2500)
    tips = lambda: pg.evaluate("() => [...document.querySelectorAll('.selbar button')].map(b => b.dataset.tip || b.title || '')")
    for k, (fk, pts) in enumerate(CASES):
        iid = f'q{k}'
        pg.evaluate("([id, fk, pts]) => { const d = window.__doska; d.act(() => d.addItem({ id, type: 'poly', page: d.S.page, z: 100 + Math.random(), x: -500, y: -300, s: 1, closed: true, size: 2.7, color: '#1e1e1e', pts, ...(fk ? { fk } : {}) })); d.setTool('select'); d.S.sel.clear(); d.S.sel.add(id); }", [iid, fk, pts])
        pg.mouse.move(5, 400); pg.wait_for_timeout(120)
        t = [x for x in tips() if x.startswith('Выровнять')]
        pg.keyboard.press('Shift+R'); pg.wait_for_timeout(60)
        Q = pg.evaluate("(id) => window.__doska.items.get(id).pts", iid)
        moved = sum(1 for a, c in zip(pts, Q) if math.dist(a, [c[0] + 0, c[1] + 0]) > 0.5)
        print(fk, '|', t, '|', props(Q))
        pg.evaluate("(id) => { const d = window.__doska; d.act(() => d.doc.getMap('items').delete(id)); }", iid) if False else None
        pg.evaluate("(id) => { const d = window.__doska; d.S.sel.clear(); }", iid)
        pg.evaluate("(id) => { const d = window.__doska; const m = d.doc.getMap('items'); d.act(() => m.delete(id)); }", iid)
    # фигуры без правки: у параллелограмма кнопки нет, у растянутого квадрата есть
    for kind, w, h in [('parallelogram', 200, 120), ('square', 200, 120), ('square', 150, 150), ('trapezoid', 200, 100), ('hexagon', 200, 100)]:
        pg.evaluate("([kind, w, h]) => { const d = window.__doska; d.act(() => d.addItem({ id: 'f1', type: 'fig', kind, page: d.S.page, z: 300, x: -500, y: -300, s: 1, w, h, size: 2.7, color: '#1e1e1e' })); d.S.sel.clear(); d.S.sel.add('f1'); }", [kind, w, h])
        pg.mouse.move(5, 420); pg.wait_for_timeout(120)
        print('fig', kind, w, h, [x for x in tips() if x.startswith('Выровнять')])
        pg.evaluate("() => { const d = window.__doska; d.S.sel.clear(); const m = d.doc.getMap('items'); d.act(() => m.delete('f1')); }")
    # окружность, растянутая в овал, и обычный эллипс
    for center in [True, False]:
        pg.evaluate("(c) => { const d = window.__doska; d.act(() => d.addItem({ id: 'e1', type: 'ellipse', page: d.S.page, z: 300, x: -500, y: -300, s: 1, w: 200, h: 120, size: 2.7, color: '#1e1e1e', ...(c ? { center: true } : {}) })); d.S.sel.clear(); d.S.sel.add('e1'); }", center)
        pg.mouse.move(5, 440); pg.wait_for_timeout(120)
        print('ellipse center=', center, [x for x in tips() if x.startswith('Выровнять')])
        pg.evaluate("() => { const d = window.__doska; d.S.sel.clear(); const m = d.doc.getMap('items'); d.act(() => m.delete('e1')); }")
    print('errors', errs); b.close()
