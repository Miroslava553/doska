# Колесо (или правая кнопка) нажато, пока левая ещё держит перенос, рамку или линию: доска двигается сразу, с первого раза
from playwright.sync_api import sync_playwright
res = []
def r(n, v): res.append((n, v)); print(('✓ ' if v else '✗ ') + n)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1200, 'height': 800}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0})); localStorage.setItem('doska:seenTour','1')")
    pg.goto('http://127.0.0.1:8765/doska.html?nopeer#r=chrd-aaaa-bbbb'); pg.wait_for_timeout(1500)
    cdp = pg.context.new_cdp_session(pg)
    def ev(t, x, y, btn='none', buttons=0): cdp.send('Input.dispatchMouseEvent', {'type': t, 'x': x, 'y': y, 'button': btn, 'buttons': buttons, 'clickCount': 1 if t != 'mouseMoved' else 0})
    def path(x0, y0, x1, y1, btn, bs, n=10):
        for k in range(1, n + 1): ev('mouseMoved', x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, btn, bs); pg.wait_for_timeout(12)
    V = lambda: pg.evaluate("() => { const v = window.__doska.S.view; return [v.x, v.y]; }")
    it = lambda id: pg.evaluate("(id) => { const i = window.__doska.items.get(id); return i ? [i.x, i.y] : null; }", id)
    scr = lambda id: pg.evaluate("(id) => { const i = window.__doska.items.get(id); return window.__doska.toScreen(i.x, i.y); }", id)
    pg.evaluate("""() => { const D = window.__doska, P = D.S.page; const [X, Y] = D.toWorld(0, 0); D.act(() => {
      D.addItem({ id: 'e', type: 'ellipse', page: P, z: 1, x: X + 300, y: Y + 300, w: 200, h: 140, s: 1, size: 3.15, color: '#1971c2', fill: 1 });
      D.addItem({ id: 'far', type: 'rect', page: P, z: 2, x: X + 1500, y: Y + 300, w: 100, h: 80, s: 1, size: 3.15, color: '#e03131' }); }); }""")
    pg.keyboard.press('v'); pg.wait_for_timeout(200)
    # 1. несём фигуру, по дороге колесом отодвигаем доску, потом несём дальше
    e0 = it('e'); v0 = V(); u0 = pg.evaluate("() => window.__doska.undo.undoStack.length")
    ev('mouseMoved', 400, 370); ev('mousePressed', 400, 370, 'left', 1); path(400, 370, 500, 400, 'left', 1)
    ev('mousePressed', 500, 400, 'middle', 5); path(500, 400, 300, 400, 'middle', 5)
    v1 = V()
    r('колесо при зажатой левой сразу двигает доску (%d)' % (v1[0] - v0[0]), abs((v1[0] - v0[0]) + 200) < 3)
    ev('mouseReleased', 300, 400, 'middle', 1); path(300, 400, 350, 450, 'left', 1)
    ev('mouseReleased', 350, 450, 'left', 0); pg.wait_for_timeout(200)
    e1 = it('e'); z = pg.evaluate("() => window.__doska.S.view.z")
    exp = [e0[0] + (100 + 50) / z, e0[1] + (30 + 50) / z]
    r('фигура доехала за курсором: перенос до и после колеса сложился (%.0f,%.0f ≈ %.0f,%.0f)' % (e1[0], e1[1], exp[0], exp[1]), abs(e1[0] - exp[0]) < 2 and abs(e1[1] - exp[1]) < 2)
    r('перенос — один шаг отмены', pg.evaluate("() => window.__doska.undo.undoStack.length") - u0 == 1)
    # 2. сначала отпустили левую, потом колесо
    v0 = V(); ev('mouseMoved', 330, 420); ev('mousePressed', 330, 420, 'left', 1); path(330, 420, 360, 430, 'left', 1, 4)
    ev('mousePressed', 360, 430, 'middle', 5); path(360, 430, 460, 430, 'middle', 5, 6)
    ev('mouseReleased', 460, 430, 'left', 4); path(460, 430, 520, 430, 'middle', 4, 4)
    ev('mouseReleased', 520, 430, 'middle', 0); pg.wait_for_timeout(200)
    r('левую отпустили раньше колеса: доска доехала до конца (%d)' % (V()[0] - v0[0]), abs(V()[0] - v0[0] - 160) < 3)
    r('ничего не зависло', pg.evaluate("() => window.__doska.dbg() === undefined || true") and pg.evaluate("() => document.querySelector('#cv-over').style.cursor !== 'grabbing'"))
    v0 = V(); ev('mousePressed', 600, 600, 'middle', 4); path(600, 600, 500, 600, 'middle', 4); ev('mouseReleased', 500, 600, 'middle', 0); pg.wait_for_timeout(100)
    r('следующая прокрутка колесом работает с первого раза', abs(V()[0] - v0[0] + 100) < 3)
    # 3. рамка выделения: колесом подтягиваем дальнюю фигуру и захватываем её
    pg.evaluate("() => { window.__doska.S.sel.clear(); }")
    fs = scr('far'); es = scr('e')
    ev('mouseMoved', es[0] - 30, es[1] - 30); ev('mousePressed', es[0] - 30, es[1] - 30, 'left', 1); path(es[0] - 30, es[1] - 30, es[0] + 300, es[1] + 200, 'left', 1)
    ev('mousePressed', es[0] + 300, es[1] + 200, 'middle', 5); path(es[0] + 300, es[1] + 200, es[0] - 500, es[1] + 200, 'middle', 5, 16)
    ev('mouseReleased', es[0] - 500, es[1] + 200, 'middle', 1)
    fs2 = scr('far'); path(es[0] - 500, es[1] + 200, fs2[0] + 130, fs2[1] + 120, 'left', 1)
    ev('mouseReleased', fs2[0] + 130, fs2[1] + 120, 'left', 0); pg.wait_for_timeout(200)
    sel = pg.evaluate("() => [...window.__doska.S.sel].sort()")
    r('рамка захватила и ближнюю, и подъехавшую дальнюю фигуру (%s)' % sel, sel == ['e', 'far'])
    # 4. линия ручкой мышью: колесом подвинули — линия одна и непрерывная
    pg.keyboard.press('Escape'); pg.keyboard.press('p'); pg.wait_for_timeout(100)
    n0 = pg.evaluate("() => window.__doska.items.size")
    ev('mouseMoved', 300, 650); ev('mousePressed', 300, 650, 'left', 1); path(300, 650, 450, 650, 'left', 1)
    ev('mousePressed', 450, 650, 'middle', 5); path(450, 650, 250, 650, 'middle', 5); ev('mouseReleased', 250, 650, 'middle', 1)
    path(250, 650, 400, 700, 'left', 1); ev('mouseReleased', 400, 700, 'left', 0); pg.wait_for_timeout(200)
    st = pg.evaluate("() => { const a = [...window.__doska.items.values()].pop(); const b = a._box || null; return {type: a.type, n: window.__doska.items.size}; }")
    r('получился один штрих', st['n'] == n0 + 1 and st['type'] == 'stroke')
    # 5. правая кнопка вместо колеса: доска двигается, меню не открывается
    pg.keyboard.press('v'); v0 = V()
    ev('mouseMoved', 700, 300); ev('mousePressed', 700, 300, 'left', 1); path(700, 300, 720, 320, 'left', 1, 3)
    ev('mousePressed', 720, 320, 'right', 3); path(720, 320, 620, 320, 'right', 3); ev('mouseReleased', 620, 320, 'right', 1); ev('mouseReleased', 620, 320, 'left', 0); pg.wait_for_timeout(300)
    r('правая при зажатой левой тоже двигает доску', abs(V()[0] - v0[0] + 100) < 3)
    r('меню по правой кнопке не выскочило', pg.locator('.radial, .panel.pop').count() == 0)
    pg.evaluate("() => { window.__log = []; for (const t of ['pointerdown','pointerup','pointercancel','lostpointercapture','gotpointercapture','contextmenu']) document.addEventListener(t, e => window.__log.push(t + ' b' + e.button + ' bs' + e.buttons + ' ' + (e.target.id || e.target.className)), true); }")
    # 6. обычный случай: отпустили и сразу колесом
    pg.evaluate("() => { const D = window.__doska, i = D.items.get('e'), v = D.S.view; v.x = 400 - i.x * v.z; v.y = 300 - i.y * v.z; dispatchEvent(new Event('resize')); D.S.sel = new Set(['e']); }"); pg.wait_for_timeout(200); es = scr('e')
    ev('mouseMoved', es[0] + 100, es[1] + 70); ev('mousePressed', es[0] + 100, es[1] + 70, 'left', 1); path(es[0] + 100, es[1] + 70, es[0] + 160, es[1] + 90, 'left', 1, 5)
    ev('mouseReleased', es[0] + 160, es[1] + 90, 'left', 0)
    v0 = V(); ev('mousePressed', es[0] + 160, es[1] + 90, 'middle', 4); path(es[0] + 160, es[1] + 90, es[0] + 60, es[1] + 90, 'middle', 4); ev('mouseReleased', es[0] + 60, es[1] + 90, 'middle', 0)
    r('отпустили и сразу колесом — работает с первого раза', abs(V()[0] - v0[0] + 100) < 3)
    r('ошибок в странице нет', not errs); print(errs)
    b.close()
print('ИТОГ', sum(1 for _, v in res if v), 'из', len(res))
