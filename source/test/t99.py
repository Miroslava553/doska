# Точный ластик: стирает ровно то, что попало под круг. Толстая линия, задетая краем, теряет только край.
from playwright.sync_api import sync_playwright
from PIL import Image
import io, time
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/er/'
res = []
def r(n, v): res.append((n, v)); print(('✓ ' if v else '✗ ') + n)
ADD = """([id, x0, y0, x1, y1, size, kind, extra]) => { const D = window.__doska; const pts = []; const n = 40;
  for (let j = 0; j <= n; j++) pts.push(Math.round((x0 + (x1 - x0) * j / n) * 10), Math.round((y0 + (y1 - y0) * j / n) * 10), 50);
  D.doc.transact(() => D.addItem(Object.assign({ id, type: 'stroke', page: D.S.page, z: Date.now() % 1e9, x: 0, y: 0, s: 1, color: '#1f2328', size, kind, v: 2, thin: 0, pts }, extra || {})), 'noundo'); }"""
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    ctx = b.new_context(viewport={'width': 1300, 'height': 800})
    ctx.add_init_script("if (!localStorage.getItem('doska:prefs')) localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0, eraserPrecise: true, size: { eraser: 12 }}));")
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=prec-aaaa-bbbb'); pg.wait_for_timeout(1500)
    pg.evaluate("() => { const v = window.__doska.S.view; v.x = 0; v.y = 0; v.z = 1; }")
    D = lambda js, *a: pg.evaluate(js, *a)
    scr = lambda x, y: D("([x, y]) => window.__doska.toScreen(x, y)", [x, y])
    def shot():
        return Image.open(io.BytesIO(pg.screenshot())).convert('L')
    def dark(img, wx, wy):
        sx, sy = scr(wx, wy); return img.getpixel((int(round(sx)), int(round(sy)))) < 120
    def drag(path, mode_precise=True, keep=False):
        s0 = scr(*path[0]); pg.mouse.move(*s0); pg.mouse.down()
        for q in path[1:]: s1 = scr(*q); pg.mouse.move(*s1, steps=3)
        pg.wait_for_timeout(60)
        if not keep: pg.mouse.up(); pg.wait_for_timeout(120)
    pg.keyboard.press('e'); pg.wait_for_timeout(150)
    if not D("() => JSON.parse(localStorage.getItem('doska:prefs')).eraserPrecise"): pg.keyboard.press('e'); pg.wait_for_timeout(150)
    R = D("() => window.__doska.eraseR()"); print('радиус ластика', R)
    # 1. Толстая линия (40), ластик краем снимает 4 точки сверху
    D(ADD, ['T', 300, 300, 900, 300, 40, 'pen', None]); pg.wait_for_timeout(200)
    yc = 280 - R + 4
    drag([(400, yc), (800, yc)], keep=True)
    im = shot()
    mid = all(not dark(im, x, 282) for x in range(430, 780, 25)) and all(dark(im, x, 286.5) for x in range(430, 780, 25)) and all(dark(im, x, 318) for x in range(430, 780, 25))
    r('пока ведём: снят только край под кругом, остальная толщина на месте', mid)
    pg.mouse.up(); pg.wait_for_timeout(200); im = shot(); im.save(OUT + '1-shave.png')
    r('после отпускания: то же самое', all(not dark(im, x, 282) for x in range(430, 780, 25)) and all(dark(im, x, 286.5) for x in range(430, 780, 25)) and all(dark(im, x, 318) for x in range(430, 780, 25)))
    r('нижний край и концы линии не тронуты', dark(im, 300, 300) and dark(im, 900, 300) and dark(im, 600, 319) and dark(im, 350, 282))
    r('линия одна, с одним вырезом', D("() => { const it = window.__doska.items.get('T'); return it && it.cuts && it.cuts.length === 1; }"))
    # граница: на 1 точку внутрь круга стёрто, на 1 точку снаружи нет
    edge = yc + R
    r('граница выреза ровно по кругу (±1 точка)', not dark(im, 600, edge - 1.2) and dark(im, 600, edge + 1.2))
    # 2. ластик проходит мимо, не касаясь: ничего не меняется
    before = D("() => JSON.stringify(window.__doska.items.get('T').cuts)")
    drag([(400, 280 - R - 1.5), (800, 280 - R - 1.5)])
    r('прошли в полутора точках от края: линия не тронута', D("() => JSON.stringify(window.__doska.items.get('T').cuts)") == before)
    # 3. Ctrl+Z возвращает срезанный край
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(250); im = shot()
    r('отмена возвращает край', dark(im, 600, 282) and not D("() => !!window.__doska.items.get('T').cuts"))
    pg.keyboard.press('Control+Shift+z'); pg.wait_for_timeout(250)
    # 4. выбор: щелчок в стёртое место не выбирает линию, по оставшимся чернилам выбирает
    pg.keyboard.press('v'); pg.wait_for_timeout(100)
    pg.mouse.click(*scr(600, 276)); pg.wait_for_timeout(150)
    sel1 = D("() => [...window.__doska.S.sel]")
    pg.mouse.click(*scr(600, 310)); pg.wait_for_timeout(150)
    sel2 = D("() => [...window.__doska.S.sel]")
    r('щелчок в стёртое место не выбирает, по чернилам выбирает', 'T' not in sel1 and 'T' in sel2)
    # 5. перенос линии: вырез едет вместе с ней
    D("() => { const D = window.__doska; D.S.sel = new Set(); D.doc.transact(() => D.doc.getMap('items').get('T').set('x', 100)); }"); pg.wait_for_timeout(200); im = shot()
    r('сдвинули линию: вырез на новом месте', not dark(im, 700, 282) and dark(im, 700, 290) and dark(im, 420, 282))
    pg.keyboard.press('Escape'); pg.keyboard.press('e'); pg.wait_for_timeout(100)
    if not D("() => JSON.parse(localStorage.getItem('doska:prefs')).eraserPrecise"): pg.keyboard.press('e'); pg.wait_for_timeout(100)
    # 6. ластик «целиком» после выреза: касание стёртого места не удаляет, касание чернил удаляет
    pg.keyboard.press('e'); pg.wait_for_timeout(100)
    whole = not D("() => JSON.parse(localStorage.getItem('doska:prefs')).eraserPrecise")
    drag([(560, yc - 5), (760, yc - 5)])
    r('«целиком» по стёртому месту: линия осталась', whole and D("() => window.__doska.items.has('T')"))
    drag([(560, yc + 3), (760, yc + 3)])
    r('«целиком» по оставшимся чернилам: линия удалена', not D("() => window.__doska.items.has('T')"))
    pg.keyboard.press('e'); pg.wait_for_timeout(100)
    # 7. стереть линию полностью — она удаляется
    D(ADD, ['U', 300, 450, 500, 450, 10, 'pen', None]); pg.wait_for_timeout(150)
    drag([(290, 450), (510, 450)])
    r('стёрли линию целиком точным ластиком: её больше нет', not D("() => window.__doska.items.has('U')"))
    D(ADD, ['U2', 300, 450, 500, 450, 10, 'pen', None]); pg.wait_for_timeout(150)
    drag([(290, 450), (480, 450)])
    r('кусочек остался: линия жива', D("() => window.__doska.items.has('U2')"))
    # 8. маркер, пунктир, рамка, залитый эллипс
    D(ADD, ['H', 300, 550, 900, 550, 30, 'hl', {'color': '#fab005'}]); D(ADD, ['P', 300, 650, 900, 650, 12, 'dash', {'thin': 0}])
    D("""() => { const D = window.__doska; D.doc.transact(() => { D.addItem({ id: 'RC', type: 'rect', page: D.S.page, z: 9e8, x: 1000, y: 150, s: 1, w: 200, h: 120, color: '#1f2328', size: 14 });
      D.addItem({ id: 'EL', type: 'ellipse', page: D.S.page, z: 9e8 + 1, x: 1000, y: 400, s: 1, w: 220, h: 160, color: '#1971c2', size: 6, fill: true }); }, 'noundo'); }""")
    pg.wait_for_timeout(200); im0 = shot()
    drag([(400, 535 - R + 4), (800, 535 - R + 4)])
    drag([(1020, 143 - R + 4), (1180, 143 - R + 4)])
    drag([(1110, 480), (1110, 481)])
    im = shot(); im.save(OUT + '2-kinds.png')
    hl_ok = all(im.getpixel(tuple(int(v) for v in scr(x, 537))) > im0.getpixel(tuple(int(v) for v in scr(x, 537))) + 12 for x in range(450, 760, 40)) and all(abs(im.getpixel(tuple(int(v) for v in scr(x, 560))) - im0.getpixel(tuple(int(v) for v in scr(x, 560)))) < 8 for x in range(450, 760, 40))
    r('маркер: снят только край, остальное того же цвета', hl_ok)
    r('рамка: снят только верхний край линии', not dark(im, 1100, 145) and dark(im, 1100, 152) and dark(im, 1000, 210))
    el_hole = im.getpixel(tuple(int(v) for v in scr(1110, 480))) > im0.getpixel(tuple(int(v) for v in scr(1110, 480))) + 10 and abs(im.getpixel(tuple(int(v) for v in scr(1110 + R + 6, 480))) - im0.getpixel(tuple(int(v) for v in scr(1110 + R + 6, 480)))) < 6
    r('залитый эллипс: дырка ровно под ластиком, заливка вокруг цела', el_hole)
    # 9. маленький ластик близко вдоль толстой линии, как на видео: противоположный край цел, пунктира нет
    D(ADD, ['V', 200, 720, 1100, 720, 36, 'pen', None]); pg.wait_for_timeout(150)
    for k in range(12):
        drag([(250 + k * 70, 702 - R + 3), (250 + k * 70 + 40, 702 - R + 3)])
    im = shot(); im.save(OUT + '3-video-case.png')
    far = all(dark(im, x, 736) for x in range(220, 1090, 10)); center = all(dark(im, x, 720) for x in range(220, 1090, 10))
    r('вдоль края толстой линии: середина и дальний край целые на всей длине', far and center)
    # 10. второе окно той же доски видит вырезы
    pg2 = ctx.new_page(); pg2.on('pageerror', lambda e: errs.append('2: ' + str(e)[:300]))
    pg2.goto('file:///home/claude/board/dist/doska.html?nopeer#r=prec-aaaa-bbbb'); pg2.wait_for_timeout(1800)
    r('во втором окне у линий те же вырезы', pg2.evaluate("() => { const a = window.__doska.items.get('V'); return a && a.cuts && a.cuts.length === 12; }"))
    pg2.close()
    # 11. скорость: 40 толстых длинных линий, точный ластик поперёк всех
    D("""() => { const D = window.__doska; D.doc.transact(() => { for (let i = 0; i < 40; i++) { const pts = []; for (let j = 0; j <= 60; j++) pts.push(Math.round((50 + j * 20) * 10), Math.round((60 + i * 18 + Math.sin(j / 4) * 6) * 10), 50);
      D.addItem({ id: 'Z' + i, type: 'stroke', page: D.S.page, z: 1e9 + i, x: 0, y: 0, s: 1, color: '#1f2328', size: 14, kind: 'pen', v: 2, thin: 0, pts }); } }, 'noundo'); window.__doska.STATS.full = 0; window.__doska.STATS.fullMs = 0; }""")
    pg.wait_for_timeout(300)
    t0 = time.time(); s0 = scr(600, 40); pg.mouse.move(*s0); pg.mouse.down()
    for k in range(40): pg.mouse.move(*scr(600 + (k % 2) * 30, 40 + k * 20))
    pg.mouse.up(); pg.wait_for_timeout(300)
    st = D("() => { const S = window.__doska.STATS; return [S.full, S.fullMs]; }")
    avg = st[1] / max(1, st[0])
    r('перерисовка во время стирания %.1f мс на кадр (меньше 16)' % avg, avg < 16)
    r('без ошибок', not errs)
    if errs: print(errs[:4])
    b.close()
print('ИТОГ', sum(1 for _, v in res if v), 'из', len(res))
