# Уменьшить / Увеличить выделенное целиком: кнопки на панели выделения
from playwright.sync_api import sync_playwright
import json
O = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/sc/'
URL = 'http://127.0.0.1:8765/doska.html?nopeer#r=scal-aaaa-bbbb'
res = []
def r(n, v): res.append((n, v)); print(('✓ ' if v else '✗ ') + n)
INIT = "localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0})); localStorage.setItem('doska:seenTour','1')"
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    c = b.new_context(viewport={'width': 1366, 'height': 800}); c.add_init_script(INIT)
    pg = c.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
    pg.goto(URL); pg.wait_for_timeout(1500)
    pg2 = c.new_page(); pg2.on('pageerror', lambda e: errs.append(str(e)[:300])); pg2.goto(URL.replace('?nopeer', '?nopeer&x=2')); pg2.wait_for_timeout(1500)
    pg.bring_to_front()
    pg.keyboard.press('p')
    for k in range(3):
        pg.mouse.move(300 + k * 120, 330); pg.mouse.down(); pg.mouse.move(360 + k * 120, 450, steps=10); pg.mouse.move(400 + k * 120, 360, steps=8); pg.mouse.up()
    pg.keyboard.press('v'); pg.wait_for_timeout(200)
    pg.mouse.move(250, 280); pg.mouse.down(); pg.mouse.move(800, 500, steps=10); pg.mouse.up(); pg.wait_for_timeout(400)
    st = lambda: pg.evaluate("() => [...window.__doska.S.sel].map(id => { const i = window.__doska.items.get(id); return {id, x: i.x, y: i.y, s: i.s || 1, w: i.w, h: i.h, size: i.size, fs: i.fs, type: i.type}; })")
    box = lambda: pg.evaluate("() => window.__doska.selectionBox()")
    shrink = pg.locator('.selbar button[data-tip^="Уменьшить"]'); grow = pg.locator('.selbar button[data-tip^="Увеличить"]')
    r('на панели есть «Уменьшить» и «Увеличить»', shrink.count() == 1 and grow.count() == 1)
    s0, b0 = st(), box(); bt0 = shrink.bounding_box(); th0 = pg.inner_text('.selbar .sz-val')
    shrink.click(); pg.wait_for_timeout(300)
    s1, b1 = st(), box(); bt1 = shrink.bounding_box(); th1 = pg.inner_text('.selbar .sz-val')
    w0, w1 = b0[2] - b0[0], b1[2] - b1[0]
    r('рисунок стал меньше примерно в 0,8 раза (%.0f → %.0f)' % (w0, w1), 0.76 < w1 / w0 < 0.84)
    r('верх и середина стоят на месте', abs((b0[0] + b0[2]) / 2 - (b1[0] + b1[2]) / 2) < 1.5 and abs(b0[1] - b1[1]) < 3)
    r('кнопка не уехала из-под курсора', abs(bt0['x'] - bt1['x']) < 2 and abs(bt0['y'] - bt1['y']) < 2)
    r('линии стали тоньше вместе с рисунком, ползунок это показывает (%s → %s)' % (th0, th1), th0 != th1)
    grow.click(); pg.wait_for_timeout(300); s2 = st()
    r('меньше и потом больше — размер вернулся точно', all(abs(a['x'] - c_['x']) < 1e-6 and abs(a['y'] - c_['y']) < 1e-6 and abs(a['s'] - c_['s']) < 1e-9 for a, c_ in zip(s0, s2)))
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(200); s3 = st()
    r('отмена откатывает один шаг', all(abs(a['s'] - c_['s']) < 1e-9 for a, c_ in zip(s1, s3)))
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(200)
    r('вторая отмена — исходный размер', all(abs(a['s'] - c_['s']) < 1e-9 for a, c_ in zip(s0, st())))
    pg.keyboard.press('Control+Shift+z'); pg.wait_for_timeout(200)
    r('повтор снова уменьшает', all(abs(a['s'] - c_['s']) < 1e-9 for a, c_ in zip(s1, st())))
    # толщина после уменьшения: ставим 3,5 — на экране ровно 3,5
    pg.evaluate("() => { const r = document.querySelector('.selbar .sz-range'); r.focus(); }")
    pg.locator('.selbar button[data-tip^="Толщина по умолчанию"]').click(); pg.wait_for_timeout(200)
    eff = pg.evaluate("() => [...window.__doska.S.sel].map(id => { const i = window.__doska.items.get(id); return i.size * (i.s || 1); })")
    r('«толщина по умолчанию» у уменьшенного рисунка даёт ровно 3,5 на экране (%s)' % eff, all(abs(e - 3.5) < 1e-6 for e in eff) and pg.inner_text('.selbar .sz-val') == '3,5')
    # смешанное: фигура, текст, формула, повёрнутый прямоугольник, закреплённое
    pg.evaluate("""() => { const D = window.__doska, P = D.S.page; const [X, Y] = D.toWorld(0, 0); D.act(() => {
      D.addItem({ id: 'r1', type: 'rect', page: P, z: 50, x: X + 900, y: Y + 300, w: 160, h: 100, s: 1, size: 3.15, color: '#1971c2' });
      D.addItem({ id: 'r2', type: 'rect', page: P, z: 51, x: X + 900, y: Y + 450, w: 120, h: 60, s: 1, size: 3.15, rot: 0.5, color: '#e03131' });
      D.addItem({ id: 't1', type: 'text', page: P, z: 52, x: X + 1100, y: Y + 300, s: 1, fs: 30, color: '#1e1e1e', text: 'Надпись' });
      D.addItem({ id: 'm1', type: 'tex', page: P, z: 53, x: X + 1100, y: Y + 400, s: 1, fs: 40, color: '#1e1e1e', tex: 'x^2+1' });
      D.addItem({ id: 'L1', type: 'rect', page: P, z: 54, x: X + 1100, y: Y + 500, w: 80, h: 40, s: 1, size: 3.15, locked: true, color: '#000' }); });
      D.S.sel = new Set(['r1', 'r2', 't1', 'm1', 'L1']); }""")
    pg.mouse.move(600, 700); pg.wait_for_timeout(500)
    g = lambda id: pg.evaluate("(id) => { const i = window.__doska.items.get(id); return {x: i.x, y: i.y, s: i.s || 1, w: i.w, h: i.h, size: i.size, rot: i.rot}; }", id)
    a = {k: g(k) for k in ['r1', 'r2', 't1', 'm1', 'L1']}
    pg.locator('.selbar button[data-tip^="Уменьшить"]').click(); pg.wait_for_timeout(300)
    z = {k: g(k) for k in ['r1', 'r2', 't1', 'm1', 'L1']}
    r('прямоугольник уменьшился, а толщина его линии осталась', abs(z['r1']['w'] - a['r1']['w'] * 0.8) < 1e-6 and z['r1']['size'] == a['r1']['size'])
    r('повёрнутый остался повёрнутым', abs(z['r2']['w'] - a['r2']['w'] * 0.8) < 1e-6 and z['r2']['rot'] == a['r2']['rot'])
    r('надпись и формула уменьшились', abs(z['t1']['s'] - 0.8) < 1e-9 and abs(z['m1']['s'] - 0.8) < 1e-9)
    r('закреплённое не тронуто', z['L1'] == a['L1'])
    pg.screenshot(path=O + 'mixed.png')
    pg.evaluate("() => { window.__doska.S.sel = new Set(['L1']); dispatchEvent(new Event('resize')); }"); pg.mouse.move(610, 700); pg.wait_for_timeout(400)
    r('у одного закреплённого кнопок размера нет', pg.locator('.selbar button[data-tip^="Уменьшить"]').count() == 0)
    # предел
    pg.evaluate("() => { window.__doska.S.sel = new Set(['t1']); dispatchEvent(new Event('resize')); }"); pg.mouse.move(600, 700); pg.wait_for_timeout(400)
    for _ in range(40): pg.locator('.selbar button[data-tip^="Уменьшить"]').click(force=True); pg.wait_for_timeout(15)
    pg.wait_for_timeout(200)
    bt = pg.evaluate("() => { const b = window.__doska.selectionBox(); return Math.max(b[2]-b[0], b[3]-b[1]); }")
    r('уменьшать бесконечно нельзя, рисунок остаётся видимым (%.1f)' % bt, bt >= 4 and pg.locator('.toast:has-text("Меньше уже нельзя")').count() >= 1)
    # панель под рисунком: после уменьшения не прыгает наверх
    pg.evaluate("() => { const D = window.__doska, P = D.S.page; const [X, Y] = D.toWorld(150, 130); D.act(() => D.addItem({ id: 'big', type: 'rect', page: P, z: 60, x: X, y: Y, w: 400, h: 560, s: 1, size: 3.15, color: '#000' })); D.S.sel = new Set(['big']); dispatchEvent(new Event('resize')); }")
    pg.wait_for_timeout(400)
    sb0 = pg.locator('.selbar').bounding_box(); bx = pg.evaluate("() => window.__doska.toScreen(0, window.__doska.selectionBox()[3])[1]")
    r('панель стоит под высоким рисунком', sb0['y'] > bx - 5)
    bt = pg.locator('.selbar button[data-tip^="Уменьшить"]'); q0 = bt.bounding_box(); bt.click(); pg.wait_for_timeout(250); bt.click(); pg.wait_for_timeout(300); q1 = bt.bounding_box()
    r('после двух нажатий кнопка на том же месте', abs(q0['x'] - q1['x']) < 1 and abs(q0['y'] - q1['y']) < 1)
    nb = pg.evaluate("() => window.__doska.toScreen(0, window.__doska.selectionBox()[3])[1]")
    r('нижний край рисунка не сдвинулся', abs(nb - bx) < 2)
    pg.keyboard.press('Shift'); pg.mouse.move(700, 700); pg.wait_for_timeout(100); pg.evaluate("() => dispatchEvent(new Event('resize'))"); pg.wait_for_timeout(300)
    ov_ = pg.evaluate("() => { const D = window.__doska, b = D.selectionBox(), [x0, y0] = D.toScreen(b[0], b[1]), [x1, y1] = D.toScreen(b[2], b[3]), r = document.querySelector('.selbar').getBoundingClientRect(); return !(r.bottom <= y0 || r.top >= y1 || r.right <= x0 || r.left >= x1); }")
    r('после клавиши панель встаёт как обычно и не налезает на рисунок', not ov_)
    # вторая вкладка видит
    pg2.wait_for_timeout(600)
    r('у второго участника размер тот же', abs(pg2.evaluate("() => window.__doska.items.get('m1').s") - pg.evaluate("() => window.__doska.items.get('m1').s")) < 1e-9)
    # телефон: панель помещается
    c3 = b.new_context(viewport={'width': 390, 'height': 760}, is_mobile=True, has_touch=True); c3.add_init_script(INIT)
    m = c3.new_page(); m.on('pageerror', lambda e: errs.append(str(e)[:300])); m.goto(URL.replace('?nopeer', '?nopeer&x=3')); m.wait_for_timeout(2000)
    m.evaluate("""() => { const D = window.__doska, P = D.S.page; const [X, Y] = D.toWorld(60, 300); D.act(() => {
      D.addItem({ id: 'r1', type: 'rect', page: P, z: 50, x: X, y: Y, w: 120, h: 80, s: 1, size: 3.15, color: '#1971c2' });
      D.addItem({ id: 't1', type: 'text', page: P, z: 52, x: X + 140, y: Y, s: 1, fs: 30, color: '#1e1e1e', text: 'Текст' }); });
      D.setTool('select'); D.S.sel = new Set(['r1', 't1']); dispatchEvent(new Event('resize')); }""")
    m.wait_for_timeout(500)
    sb = m.locator('.selbar').bounding_box()
    r('телефон: панель с новыми кнопками в пределах экрана (%s)' % (sb and round(sb['width'])), sb is not None and sb['x'] >= 0 and sb['x'] + sb['width'] <= 390)
    m.screenshot(path=O + 'phone.png')
    r('ошибок в странице нет', not errs); print(errs)
    b.close()
print('ИТОГ', sum(1 for _, v in res if v), 'из', len(res))
