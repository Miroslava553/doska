# Колесо мыши сразу после переноса выделенного (и во время него) двигает доску с первого раза; у пера защита от «взмаха» осталась
from playwright.sync_api import sync_playwright
res = []
def r(n, v): res.append((n, v)); print(('✓ ' if v else '✗ ') + n)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1200, 'height': 800}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0})); localStorage.setItem('doska:seenTour','1')")
    pg.goto('http://127.0.0.1:8765/doska.html?nopeer#r=whl1-aaaa-bbbb'); pg.wait_for_timeout(1500)
    cdp = pg.context.new_cdp_session(pg)
    def ev(t, x, y, btn='none', buttons=0, pt='mouse'): cdp.send('Input.dispatchMouseEvent', {'type': t, 'x': x, 'y': y, 'button': btn, 'buttons': buttons, 'clickCount': 1 if t in ('mousePressed', 'mouseReleased') else 0, 'pointerType': pt, **({'force': 0.5} if pt == 'pen' else {})})
    def wheel(x, y, dy): cdp.send('Input.dispatchMouseEvent', {'type': 'mouseWheel', 'x': x, 'y': y, 'deltaX': 0, 'deltaY': dy})
    def path(x0, y0, x1, y1, btn, bs, n=10, pt='mouse'):
        for k in range(1, n + 1): ev('mouseMoved', x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, btn, bs, pt); pg.wait_for_timeout(12)
    VY = lambda: pg.evaluate("() => window.__doska.S.view.y")
    scr = lambda id: pg.evaluate("(id) => { const i = window.__doska.items.get(id); return window.__doska.toScreen(i.x, i.y); }", id)
    pg.evaluate("""() => { const D = window.__doska, P = D.S.page; const [X, Y] = D.toWorld(0, 0); D.act(() => {
      D.addItem({ id: 'e', type: 'ellipse', page: P, z: 1, x: X + 300, y: Y + 250, w: 200, h: 140, s: 1, size: 3.15, color: '#1971c2', fill: 1 }); }); }""")
    pg.keyboard.press('v'); pg.wait_for_timeout(200)
    # 1. перенесли и сразу крутим колесо — как у Миры
    ev('mouseMoved', 400, 320); ev('mousePressed', 400, 320, 'left', 1); path(400, 320, 420, 420, 'left', 1)
    ev('mouseReleased', 420, 420, 'left', 0)
    y0 = VY(); wheel(420, 420, 100); pg.wait_for_timeout(60)
    r('сразу после переноса первый же щелчок колеса двигает доску (%.0f)' % (VY() - y0), abs(VY() - y0 + 100) < 1)
    y0 = VY(); wheel(420, 420, 100); pg.wait_for_timeout(60)
    r('и второй тоже', abs(VY() - y0 + 100) < 1)
    # 2. колесо, пока кнопка ещё держит рисунок: доска едет, рисунок остаётся под курсором
    pg.wait_for_timeout(500); s0 = scr('e'); u0 = pg.evaluate("() => window.__doska.undo.undoStack.length")
    ev('mouseMoved', s0[0] + 100, s0[1] + 70); ev('mousePressed', s0[0] + 100, s0[1] + 70, 'left', 1); path(s0[0] + 100, s0[1] + 70, s0[0] + 140, s0[1] + 90, 'left', 1, 4)
    y0 = VY(); wheel(s0[0] + 140, s0[1] + 90, -100); wheel(s0[0] + 140, s0[1] + 90, -100); pg.wait_for_timeout(80)
    r('колесо во время переноса двигает доску', abs(VY() - y0 - 200) < 1)
    path(s0[0] + 140, s0[1] + 90, s0[0] + 150, s0[1] + 100, 'left', 1, 2); ev('mouseReleased', s0[0] + 150, s0[1] + 100, 'left', 0); pg.wait_for_timeout(150)
    s1 = scr('e')
    r('рисунок остался под курсором (%.0f, %.0f)' % (s1[0] - s0[0], s1[1] - s0[1]), abs(s1[0] - s0[0] - 50) < 2 and abs(s1[1] - s0[1] - 30) < 2)
    r('перенос — один шаг отмены', pg.evaluate("() => window.__doska.undo.undoStack.length") - u0 == 1)
    # 3. рамка выделения + колесо: рамка растёт в сторону прокрутки
    pg.evaluate("() => window.__doska.S.sel.clear()")
    ev('mouseMoved', 800, 150); ev('mousePressed', 800, 150, 'left', 1); path(800, 150, 900, 250, 'left', 1, 4)
    wheel(900, 250, 300); pg.wait_for_timeout(50); path(900, 250, 905, 255, 'left', 1, 2); ev('mouseReleased', 905, 255, 'left', 0); pg.wait_for_timeout(100)
    r('рамка с прокруткой не сломалась', pg.evaluate("() => document.querySelector('#cv-over').style.cursor !== 'grabbing'") and not errs)
    # 4. перо: быстрый штрих и сразу «прокрутка» от системы — не принимаем
    pg.keyboard.press('p'); pg.wait_for_timeout(100)
    ev('mouseMoved', 300, 600, 'none', 0, 'pen'); ev('mousePressed', 300, 600, 'left', 1, 'pen'); path(300, 600, 500, 620, 'left', 1, 6, 'pen'); ev('mouseReleased', 500, 620, 'left', 0, 'pen')
    y0 = VY(); wheel(500, 620, 100); pg.wait_for_timeout(50)
    r('после штриха пером «взмах» в первые мгновения по-прежнему не двигает доску', abs(VY() - y0) < 0.5)
    pg.wait_for_timeout(800); y0 = VY(); wheel(500, 620, 100); pg.wait_for_timeout(50)
    r('через секунду колесо снова работает', abs(VY() - y0 + 100) < 1)
    # 5. линия мышью ручкой: колесо во время рисования не двигает доску (линию не рвёт)
    ev('mouseMoved', 300, 500); ev('mousePressed', 300, 500, 'left', 1); path(300, 500, 400, 520, 'left', 1, 5)
    y0 = VY(); wheel(400, 520, 100); pg.wait_for_timeout(40)
    r('во время рисования ручкой колесо доску не двигает', abs(VY() - y0) < 0.5)
    ev('mouseReleased', 400, 520, 'left', 0); pg.wait_for_timeout(50)
    y0 = VY(); wheel(400, 520, 100); pg.wait_for_timeout(50)
    r('а после штриха мышью — сразу двигает', abs(VY() - y0 + 100) < 1)
    # 6. прокрутка колесом при зажатом колесе (перетаскивание доски) не дёргает
    y0 = VY(); ev('mousePressed', 600, 400, 'middle', 4); path(600, 400, 600, 350, 'middle', 4, 5); wheel(600, 350, 100); path(600, 350, 600, 340, 'middle', 4, 2); ev('mouseReleased', 600, 340, 'middle', 0)
    r('зажатое колесо + прокрутка: без ошибок', not errs)
    r('ошибок в странице нет', not errs); print(errs)
    b.close()
print('ИТОГ', sum(1 for _, v in res if v), 'из', len(res))
