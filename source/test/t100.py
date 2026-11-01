# Точный ластик, попытки сломать: увеличение, поворот, масштаб, растяжение, зеркало, точка, второе окно во время стирания, прокрутка
from playwright.sync_api import sync_playwright
from PIL import Image
import io, time
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/er/'
res = []
def r(n, v): res.append((n, v)); print(('✓ ' if v else '✗ ') + n)
ADD = """([id, x0, y0, x1, y1, size, extra]) => { const D = window.__doska; const pts = []; const n = 40;
  for (let j = 0; j <= n; j++) pts.push(Math.round((x0 + (x1 - x0) * j / n) * 10), Math.round((y0 + (y1 - y0) * j / n) * 10), 50);
  D.doc.transact(() => D.addItem(Object.assign({ id, type: 'stroke', page: D.S.page, z: Date.now() % 1e9, x: 0, y: 0, s: 1, color: '#1f2328', size, kind: 'pen', v: 2, thin: 0, pts }, extra || {})), 'noundo'); }"""
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    ctx = b.new_context(viewport={'width': 1300, 'height': 800})
    ctx.add_init_script("if (!localStorage.getItem('doska:prefs')) localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0, eraserPrecise: true, size: { eraser: 12 }}));")
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=brk2-aaaa-bbbb'); pg.wait_for_timeout(1500)
    D = lambda js, *a: pg.evaluate(js, *a)
    def view(z, x=0, y=0): D("([z, x, y]) => { const D = window.__doska; D.S.view = { z, x, y }; }", [z, x, y]); pg.mouse.move(640, 760); pg.wait_for_timeout(120)
    view(1)
    scr = lambda x, y, P=None: (P or pg).evaluate("([x, y]) => window.__doska.toScreen(x, y)", [x, y])
    shot = lambda P=None: Image.open(io.BytesIO((P or pg).screenshot())).convert('L')
    def dark(img, wx, wy, P=None):
        sx, sy = scr(wx, wy, P); return img.getpixel((int(round(sx)), int(round(sy)))) < 120
    def drag(path, keep=False):
        pg.mouse.move(*scr(*path[0])); pg.mouse.down()
        for q in path[1:]: pg.mouse.move(*scr(*q), steps=4)
        pg.wait_for_timeout(60)
        if not keep: pg.mouse.up(); pg.wait_for_timeout(150)
    pg.keyboard.press('e'); pg.wait_for_timeout(100)
    if not D("() => JSON.parse(localStorage.getItem('doska:prefs')).eraserPrecise"): pg.keyboard.press('e')
    # 1. увеличение 230%, как на видео
    D(ADD, ['A', 200, 200, 500, 200, 30, None]); view(2.3, -200, -200); R = D("() => window.__doska.eraseR()")
    yc = 185 - R + 2
    drag([(260, yc), (440, yc)]); im = shot(); im.save(OUT + '4-zoom.png')
    r('увеличение 230%%: снят край на 2 единицы, середина цела (радиус %.2f)' % R, not dark(im, 350, 185.6) and dark(im, 350, 188.5) and dark(im, 350, 200) and dark(im, 350, 214))
    # граница при увеличении: в пикселях экрана меньше одного пикселя расхождения
    sx, sy = scr(350, yc + R); r('край выреза совпадает с кругом курсора на экране (±1 пиксель)', im.getpixel((int(sx), int(sy - 1.6))) > 200 and im.getpixel((int(sx), int(sy + 1.6))) < 120)
    view(1); R = D("() => window.__doska.eraseR()")
    # 2. линия с масштабом s=2
    D(ADD, ['B', 100, 200, 250, 200, 15, {'s': 2, 'x': 0, 'y': -100}]); pg.wait_for_timeout(100)  # на доске: y=300, толщина 30, x 200..500
    drag([(260, 285 - R + 3), (440, 285 - R + 3)]); im = shot()
    r('линия в масштабе 2: срезан только край', not dark(im, 350, 286.5) and dark(im, 350, 289.5) and dark(im, 350, 300))
    # 3. повёрнутая рамка
    D("""() => { const D = window.__doska; D.doc.transact(() => D.addItem({ id: 'RR', type: 'ellipse', page: D.S.page, z: 9e8, x: 700, y: 150, s: 1, w: 240, h: 140, rot: 30, color: '#1f2328', size: 16 }), 'noundo'); }""")
    pg.wait_for_timeout(100)
    # верхняя сторона после поворота: точка середины верхней стороны в мировых координатах
    top = D("""() => { const D = window.__doska; const it = D.items.get('RR'); const a = 30 * Math.PI / 180, cx = 120, cy = 70; const f = (x, y) => [700 + cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), 150 + cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)];
      return { m: f(120, 0), out: f(120, -8 - 1), inn: f(120, 8 - 1), n: [Math.sin(a), -Math.cos(a)] }; }""")
    nx, ny = top['n']; mx, my = top['m']
    c = (mx + nx * (8 + R - 3), my + ny * (8 + R - 3)); tx, ty = (-ny, nx)
    drag([(c[0] - tx * 40, c[1] - ty * 40), (c[0] + tx * 40, c[1] + ty * 40)]); im = shot(); im.save(OUT + '6-rot.png'); print('rot', mx, my, nx, ny, R)
    r('повёрнутый эллипс: срезан внешний край стороны, внутренний цел', not dark(im, mx + nx * 6.5, my + ny * 6.5) and dark(im, mx + nx * 3, my + ny * 3) and dark(im, mx - nx * 7, my - ny * 7))
    # 4. растяжение рамки с вырезом: вырез растягивается вместе
    cuts0 = D("() => window.__doska.items.get('RR').cuts.length")
    r('у рамки один вырез', cuts0 == 1)
    # 5. зеркало ломаной с вырезом
    D("""() => { const D = window.__doska; D.doc.transact(() => D.addItem({ id: 'PL', type: 'poly', page: D.S.page, z: 9e8 + 1, x: 100, y: 450, s: 1, pts: [[0, 0], [300, 0], [300, 120]], closed: false, color: '#1f2328', size: 20 }), 'noundo'); }""")
    pg.wait_for_timeout(100)
    drag([(140, 440 - R + 3), (200, 440 - R + 3)])
    im = shot(); left_cut = not dark(im, 170, 441.5)
    D("() => { const D = window.__doska; D.S.sel = new Set(['PL']); }"); pg.keyboard.press('Escape')
    flipped = D("""() => { const D = window.__doska; const it = D.items.get('PL'); const f = (x) => 300 - x; const c = it.cuts[0]; return c.p.filter((v, i) => i % 2 === 0).map(f); }""")
    D("""() => { const D = window.__doska; const it = D.items.get('PL'); D.doc.transact(() => { const m = D.doc.getMap('items').get('PL'); m.set('pts', it.pts.map(([x, y]) => [300 - x, y])); m.set('cuts', it.cuts.map((c) => ({ r: c.r, p: c.p.map((v, i) => (i % 2 ? v : 300 - v)) }))); }); }""")
    pg.wait_for_timeout(150); im = shot()
    r('отражённая ломаная: вырез тоже отражён', left_cut and not dark(im, 100 + 300 - 70, 441.5) and dark(im, 170, 441.5))
    # 6. щелчок ластиком без движения: круглая ямка
    D(ADD, ['C', 600, 600, 900, 600, 30, None]); pg.wait_for_timeout(100)
    s0 = scr(750, 585 - R + 4); pg.mouse.move(*s0); pg.mouse.down(); pg.mouse.up(); pg.wait_for_timeout(150); im = shot()
    r('щелчок без движения: ямка ровно под кругом', not dark(im, 750, 586.5) and dark(im, 750 + R + 2, 586.5) and dark(im, 750, 590))
    # 7. точка (линия из одной точки) с краю
    D("""() => { const D = window.__doska; D.doc.transact(() => D.addItem({ id: 'DOT', type: 'stroke', page: D.S.page, z: 9e8 + 2, x: 0, y: 0, s: 1, color: '#1f2328', size: 40, kind: 'pen', v: 2, thin: 0, pts: [10500, 6000, 50] }), 'noundo'); }""")
    pg.wait_for_timeout(100); drag([(1050 - 40, 580 - R + 4), (1050 + 40, 580 - R + 4)]); im = shot()
    r('жирная точка: срезан верх, середина и низ на месте', not dark(im, 1050, 581.5) and dark(im, 1050, 600) and dark(im, 1050, 618) and D("() => window.__doska.items.has('DOT')"))
    # 8. второе окно видит вырез, пока ластик ещё ведут
    pg2 = ctx.new_page(); pg2.on('pageerror', lambda e: errs.append('2: ' + str(e)[:300]))
    pg2.goto('file:///home/claude/board/dist/doska.html?nopeer#r=brk2-aaaa-bbbb'); pg2.wait_for_timeout(2000)
    pg2.evaluate("() => { window.__doska.S.view = { z: 1, x: 0, y: 0 }; }"); pg2.mouse.move(640, 420); pg2.wait_for_timeout(200)
    D(ADD, ['W', 200, 720, 900, 720, 30, None]); pg.wait_for_timeout(600)
    pg2.evaluate("() => { window.__doska.S.follow = null; window.__doska.S.view = { z: 1, x: 0, y: 0 }; }"); pg2.mouse.move(640, 420); pg2.wait_for_timeout(300)
    drag([(300, 705 - R + 4), (800, 705 - R + 4)], keep=True); pg.wait_for_timeout(500); pg2.wait_for_timeout(200)
    print('вид второго окна', pg2.evaluate("() => window.__doska.S.view"), scr(550, 706.5, pg2))
    im2 = shot(pg2)
    live = not dark(im2, 550, 706.5, pg2) and dark(im2, 550, 712, pg2)
    pg.mouse.up(); pg.wait_for_timeout(600); im2 = shot(pg2); im2.save(OUT + '5-second-window.png')
    r('второе окно видит вырез, пока ластик ведут, и после', live and not dark(im2, 550, 706.5, pg2) and dark(im2, 550, 720, pg2))
    pg2.close()
    # 9. прокрутка доски с 40 срезанными линиями: кадр быстрый
    D("""() => { const D = window.__doska; D.doc.transact(() => { for (let i = 0; i < 40; i++) { const pts = []; for (let j = 0; j <= 60; j++) pts.push(Math.round((50 + j * 20) * 10), Math.round((60 + i * 18) * 10), 50);
      D.addItem({ id: 'Z' + i, type: 'stroke', page: D.S.page, z: 1e9 + i, x: 0, y: 0, s: 1, color: '#1f2328', size: 14, kind: 'pen', v: 2, thin: 0, pts, cuts: [{ r: 8, p: [100 + i * 5, 60 + i * 18 - 10, 1100, 60 + i * 18 - 10] }] }); } }, 'noundo'); const S = D.STATS; S.full = 0; S.fullMs = 0; }""")
    pg.wait_for_timeout(300)
    for k in range(30): pg.mouse.wheel(0, 20); pg.wait_for_timeout(16)
    st = D("() => { const S = window.__doska.STATS; return [S.full, S.fullMs]; }"); avg = st[1] / max(1, st[0])
    r('прокрутка доски с 40 срезанными линиями: %.1f мс на кадр (меньше 16)' % avg, avg < 16)
    r('без ошибок', not errs)
    if errs: print(errs[:4])
    b.close()
print('ИТОГ', sum(1 for _, v in res if v), 'из', len(res))
