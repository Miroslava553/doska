# Точный ластик: вырезы при настоящем зеркале, растяжении рамки ручками и растяжении линии
from playwright.sync_api import sync_playwright
from PIL import Image
import io
res = []
def r(n, v): res.append((n, v)); print(('✓ ' if v else '✗ ') + n)
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    pg = b.new_page(viewport={'width': 1300, 'height': 800}); pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0, eraserPrecise: true, size: { eraser: 12 }}));")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=brk3-aaaa-bbbb'); pg.wait_for_timeout(1500)
    D = lambda js, *a: pg.evaluate(js, *a)
    D("() => { window.__doska.S.view = { z: 1, x: 0, y: 0 }; }"); pg.mouse.move(640, 760); pg.wait_for_timeout(100)
    scr = lambda x, y: D("([x, y]) => window.__doska.toScreen(x, y)", [x, y])
    shot = lambda: Image.open(io.BytesIO(pg.screenshot())).convert('L')
    def dark(img, wx, wy): sx, sy = scr(wx, wy); return img.getpixel((int(round(sx)), int(round(sy)))) < 120
    def drag(path):
        pg.mouse.move(*scr(*path[0])); pg.mouse.down()
        for q in path[1:]: pg.mouse.move(*scr(*q), steps=4)
        pg.mouse.up(); pg.wait_for_timeout(150)
    D("""() => { const D = window.__doska; D.doc.transact(() => { D.addItem({ id: 'PL', type: 'poly', page: D.S.page, z: 1, x: 100, y: 200, s: 1, pts: [[0, 0], [300, 0], [300, 160]], closed: false, color: '#1f2328', size: 20 });
      D.addItem({ id: 'RC', type: 'rect', page: D.S.page, z: 2, x: 600, y: 200, s: 1, w: 200, h: 120, color: '#1f2328', size: 16 }); }, 'noundo'); }""")
    pg.keyboard.press('e'); pg.wait_for_timeout(100); R = D("() => window.__doska.eraseR()")
    drag([(140, 190 - R + 3), (200, 190 - R + 3)])     # левая часть верхней стороны ломаной
    drag([(640, 192 - R + 3), (700, 192 - R + 3)])     # левая часть верхней стороны рамки
    # зеркало кнопкой
    pg.keyboard.press('v'); pg.mouse.click(*scr(300, 200)); pg.wait_for_timeout(300)
    print('выделено', D("() => [...window.__doska.S.sel]"), pg.locator('.selbar button, #selBar button, button.ibtn.sq').evaluate_all("(a) => a.map((b) => [...b.attributes].map((x) => x.name + '=' + x.value.slice(0, 30)).join(' '))"))
    btn = pg.locator('button[data-tip="Отразить"]')
    r('кнопка «Отразить» есть', btn.count() > 0)
    if btn.count(): btn.first.click(); pg.wait_for_timeout(250)
    pg.keyboard.press('Escape'); pg.mouse.move(640, 760); pg.wait_for_timeout(200); im = shot()
    r('после зеркала вырез переехал на правую часть стороны', dark(im, 170, 191.5) and not dark(im, 100 + 300 - 70, 191.5))
    # растяжение рамки ручкой вправо в 2 раза
    pg.mouse.click(*scr(600, 260)); pg.wait_for_timeout(250)
    h = D("() => window.__doska.handles()")
    print('ручки', str(h)[:300])
    rh = None
    if isinstance(h, list):
        for q in h:
            if isinstance(q, dict) and q.get('k') in ('e', 'r', 'right'): rh = q
    if rh is None and isinstance(h, list) and h: rh = max(h, key=lambda q: (q.get('x', 0) if isinstance(q, dict) else q[0]) - abs((q.get('y', 0) if isinstance(q, dict) else q[1]) - 262))
    if rh is not None:
        hx, hy = (rh['x'], rh['y']) if isinstance(rh, dict) else (rh[0], rh[1])
        pg.mouse.move(*scr(hx, hy)); pg.mouse.down(); pg.mouse.move(*scr(hx + 200, hy), steps=6); pg.mouse.up(); pg.wait_for_timeout(250)
    pg.keyboard.press('Escape'); pg.mouse.move(640, 760); pg.wait_for_timeout(200)
    it = D("() => { const it = window.__doska.items.get('RC'); return { x: it.x, w: it.w, cuts: it.cuts }; }"); print('рамка', it['x'], it['w'])
    im = shot()
    k = it['w'] / 200
    cx = 600 + (670 - 600) * k
    r('растянули рамку в %.2f раза: вырез растянулся вместе с ней' % k, k > 1.5 and not dark(im, cx, 193.5) and dark(im, 600 + it['w'] - 20, 193.5))
    r('без ошибок', not errs)
    if errs: print(errs[:3])
    b.close()
print('ИТОГ', sum(1 for _, v in res if v), 'из', len(res))
