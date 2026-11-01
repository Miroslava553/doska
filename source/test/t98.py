# Ластик «целиком» при быстром движении: линия исчезает ровно тогда, когда край её чернил касается круга ластика
from playwright.sync_api import sync_playwright
import time, json, random
res = []
def r(n, v): res.append((n, v)); print(('✓ ' if v else '✗ ') + n)
CHECK = """(path) => { const D = window.__doska, R = D.eraseR(); const out = { exp: [], bad: [] };
  const wp = path.map(([x, y]) => D.toWorld(x, y));
  const ps = (px, py, ux, uy, vx, vy) => { const wx = vx - ux, wy = vy - uy, L = wx * wx + wy * wy; let t = L ? ((px - ux) * wx + (py - uy) * wy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(ux + wx * t - px, uy + wy * t - py); };
  for (const it of D.items.values()) { if (it.type !== 'stroke') continue;
    const pts = []; for (let i = 0; i < it.pts.length; i += 3) pts.push([it.pts[i] / 10, it.pts[i + 1] / 10]);
    let d = 1e9; for (let i = 1; i < pts.length; i++) for (let k = 0; k < wp.length; k++) { const a = wp[Math.max(0, k - 1)], b = wp[k];
      // расстояние между отрезками (без пересечений — линии вертикальные, путь горизонтальный, пересечение даст 0 через проекции)
      d = Math.min(d, ps(a[0], a[1], pts[i-1][0], pts[i-1][1], pts[i][0], pts[i][1]), ps(b[0], b[1], pts[i-1][0], pts[i-1][1], pts[i][0], pts[i][1]), ps(pts[i][0], pts[i][1], a[0], a[1], b[0], b[1]), ps(pts[i-1][0], pts[i-1][1], a[0], a[1], b[0], b[1]));
      const cr = ((pts[i-1][0]-a[0])*(b[1]-a[1]) - (pts[i-1][1]-a[1])*(b[0]-a[0])) * ((pts[i][0]-a[0])*(b[1]-a[1]) - (pts[i][1]-a[1])*(b[0]-a[0])) < 0 && ((a[0]-pts[i-1][0])*(pts[i][1]-pts[i-1][1]) - (a[1]-pts[i-1][1])*(pts[i][0]-pts[i-1][0])) * ((b[0]-pts[i-1][0])*(pts[i][1]-pts[i-1][1]) - (b[1]-pts[i-1][1])*(pts[i][0]-pts[i-1][0])) < 0; if (cr) d = 0; }
    const gap = d - R - it.size / 2; const hid = D.S.hidden.has(it.id);
    if (gap <= -0.05 && !hid) out.bad.push(['не стёрта', it.id, +gap.toFixed(2)]);
    if (gap > 0.05 && hid) out.bad.push(['лишняя', it.id, +gap.toFixed(2)]);
    if (gap <= 0) out.exp.push(it.id); }
  return out; }"""
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    pg = b.new_page(viewport={'width': 1300, 'height': 800}); pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0, eraserPrecise: false}));")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=eras-aaaa-bbbb'); pg.wait_for_timeout(1500)
    random.seed(3)
    lines = [(60 + i * 9 + random.random() * 4, 150 + random.random() * 200, 300 + random.random() * 250, random.choice([2, 3, 6, 12, 20])) for i in range(130)]
    pg.evaluate("""(L) => { const D = window.__doska; const pid = D.S.page; const v = D.S.view; v.x = 0; v.y = 0; v.z = 1;
      D.doc.transact(() => { L.forEach(([x, y0, h, sz], i) => { const pts = []; for (let j = 0; j <= 30; j++) pts.push(Math.round((x + Math.sin(j) * 1.5) * 10), Math.round((y0 + h * j / 30) * 10), 50);
        D.addItem({ id: 'L' + i, type: 'stroke', page: pid, z: i + 1, x: 0, y: 0, s: 1, color: '#1f2328', size: sz, kind: 'pen', v: 2, thin: 0, pts }); }); }, 'noundo'); }""", lines)
    pg.wait_for_timeout(500); pg.keyboard.press('e'); pg.wait_for_timeout(200)
    R = pg.evaluate("() => window.__doska.eraseR()")
    print('радиус ластика', R)
    # быстрые рывки: по 140 точек экрана за событие, зигзагом
    path = [(40, 260)]; pg.mouse.move(*path[0]); pg.mouse.down()
    worst = []
    for k in range(1, 12):
        q = (40 + k * 115, 260 + (60 if k % 2 else -40)); path.append(q); pg.mouse.move(*q)
        o = pg.evaluate(CHECK, path); worst += o['bad']
    r('после каждого рывка стёрто ровно то, чего коснулся край круга', not worst)
    if worst: print(worst[:8])
    exp = pg.evaluate(CHECK, path)['exp']
    pg.mouse.up(); pg.wait_for_timeout(300)
    left = pg.evaluate("() => [...window.__doska.items.keys()]")
    r('после отпускания удалены именно задетые (%d)' % len(exp), set(exp).isdisjoint(left) and len(left) == 130 - len(exp))
    # на волосок: путь останавливается на 0,6 точки ближе края линии и на 0,6 дальше
    for d, want in ((-0.6, True), (0.6, False)):
        pg.evaluate("""(sz) => { const D = window.__doska; const pts = []; for (let j = 0; j <= 10; j++) pts.push(6000, 2000 + j * 300, 50);
          D.doc.transact(() => D.addItem({ id: 'E', type: 'stroke', page: D.S.page, z: 5000, x: 0, y: 0, s: 1, color: '#1f2328', size: sz, kind: 'pen', v: 2, thin: 0, pts }), 'noundo'); }""", 6)
        cx = 600 - R - 3 - d
        sa = pg.evaluate("([x, y]) => window.__doska.toScreen(x, y)", [cx - 300, 350]); sb = pg.evaluate("([x, y]) => window.__doska.toScreen(x, y)", [cx, 350])
        pg.mouse.move(sa[0], sa[1]); pg.mouse.down(); pg.mouse.move(sb[0], sb[1])
        hid = pg.evaluate("() => window.__doska.S.hidden.has('E')"); pg.mouse.up(); pg.wait_for_timeout(200)
        r('край линии на %+.1f точки от круга: %s' % (d, 'стирает' if want else 'не стирает'), hid == want)
    # подвели вплотную, но не коснулись: линия ни в одном кадре не пропадает (не мигает)
    pg.evaluate("""() => { const D = window.__doska; D.doc.transact(() => { if (D.items.has('E')) D.doc.getMap('items').delete('E'); }, 'noundo');
      const pts = []; for (let j = 0; j <= 10; j++) pts.push(6000, 2000 + j * 300, 50);
      D.doc.transact(() => D.addItem({ id: 'E2', type: 'stroke', page: D.S.page, z: 6000, x: 0, y: 0, s: 1, color: '#1f2328', size: 6, kind: 'pen', v: 2, thin: 0, pts }), 'noundo');
      window.__blink = 0; window.__pred = 0; const tick = () => { if (D.S.hidden.has('E2')) window.__blink++; window.__bt = requestAnimationFrame(tick); }; tick();
      addEventListener('pointermove', (e) => { window.__pred += e.getPredictedEvents ? e.getPredictedEvents().length : 0; }, true); }""")
    for speed in (3, 12, 40):
        cx = 600 - R - 3 - 0.8
        sa = pg.evaluate("([x, y]) => window.__doska.toScreen(x, y)", [cx - 400, 350]); sb = pg.evaluate("([x, y]) => window.__doska.toScreen(x, y)", [cx, 350])
        pg.mouse.move(sa[0], sa[1]); pg.mouse.down(); pg.mouse.move(sb[0], sb[1], steps=speed); pg.wait_for_timeout(250)
        pg.mouse.move(sb[0], sb[1] + 80, steps=speed); pg.mouse.up(); pg.wait_for_timeout(150)
    bl = pg.evaluate("() => window.__blink"); alive = pg.evaluate("() => window.__doska.items.has('E2')")
    r('ластик вплотную к линии: линия не мигает и остаётся (кадров со скрытием: %d, подсказок браузера: %d)' % (bl, pg.evaluate("() => window.__pred")), bl == 0 and alive)
    # скорость: 2000 линий, 60 рывков
    pg.evaluate("""() => { const D = window.__doska; const pid = D.S.page;
      D.doc.transact(() => { for (let i = 0; i < 2000; i++) { const ox = (i % 50) * 25, oy = Math.floor(i / 50) * 18; const pts = [];
        for (let j = 0; j < 30; j++) pts.push(Math.round((ox + j * 0.7) * 10), Math.round((oy + Math.sin(j / 3) * 5) * 10), 50);
        D.addItem({ id: 's' + i, type: 'stroke', page: pid, z: 1000 + i, x: 0, y: 0, s: 1, color: '#1f2328', size: 2, kind: 'pen', v: 2, thin: 0, pts }); } }, 'noundo'); }""")
    pg.wait_for_timeout(600)
    t = pg.evaluate("""async () => { const cv = document.querySelector('#over') || document.querySelector('canvas'); const el = document.elementFromPoint(100, 100);
      const ev = (type, x, y) => el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 7, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, isPrimary: true, pressure: 0.5 }));
      ev('pointerdown', 100, 100); const t0 = performance.now();
      for (let i = 0; i < 60; i++) ev('pointermove', 100 + i * 15, 100 + (i * 9) % 600);
      const t1 = performance.now(); ev('pointerup', 1000, 400); return (t1 - t0) / 60; }""")
    r('на доске из 2000 линий одно движение ластика занимает %.2f мс (меньше 3)' % t, t < 3)
    r('без ошибок', not errs)
    if errs: print(errs[:3])
    b.close()
print('ИТОГ', sum(1 for _, v in res if v), 'из', len(res))
