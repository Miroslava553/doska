# Заливка всех фигур и ползунок справа
from playwright.sync_api import sync_playwright
O = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/sc/'
URL = 'http://127.0.0.1:8765/doska.html?nopeer#r=fl24-aaaa-bbbb'
res = []
def r(n, v): res.append((n, v)); print(('✓ ' if v else '✗ ') + n)
def init(pos='top'): return "localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0, barPos: '%s'})); localStorage.setItem('doska:seenTour','1')" % pos
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    c = b.new_context(viewport={'width': 1300, 'height': 760}); c.add_init_script(init())
    pg = c.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:300])); pg.goto(URL); pg.wait_for_timeout(1500)
    pg2 = c.new_page(); pg2.on('pageerror', lambda e: errs.append(str(e)[:300])); pg2.goto(URL.replace('?nopeer', '?nopeer&x=2')); pg2.wait_for_timeout(1500); pg.bring_to_front()
    vb = lambda: pg.evaluate("() => { const v = document.querySelector('.vscroll'); if (!v || v.hidden) return null; const r = v.getBoundingClientRect(), t = v.firstChild.getBoundingClientRect(); return {x: r.left, r: r.right, top: r.top, bottom: r.bottom, ty: t.top, th: t.height}; }")
    r('пустой лист: ползунка нет', vb() is None)
    kinds = ['triangle', 'square', 'inscribed', 'circumscribed', 'cube', 'cylinder', 'sphere', 'cone', 'sine', 'axes']
    pg.evaluate("""(kinds) => { const D = window.__doska, P = D.S.page; const [X, Y] = D.toWorld(0, 0); D.act(() => {
      kinds.forEach((k, i) => D.addItem({ id: k, type: 'fig', kind: k, page: P, z: i + 1, x: X + 40 + (i % 5) * 200, y: Y + 120 + Math.floor(i / 5) * 200, w: 140, h: 140, s: 1, size: 3.15, color: '#1971c2' }));
      D.addItem({ id: 'rc', type: 'rect', page: P, z: 40, x: X + 40, y: Y + 520, w: 150, h: 90, s: 1, size: 3.15, color: '#e03131' });
      D.addItem({ id: 'el', type: 'ellipse', page: P, z: 41, x: X + 240, y: Y + 520, w: 150, h: 90, s: 1, size: 3.15, color: '#e03131' });
      D.addItem({ id: 'op', type: 'poly', closed: false, page: P, z: 42, x: X + 440, y: Y + 520, s: 1, size: 3.15, color: '#000', pts: [[0,0],[100,40],[30,90]] });
      D.addItem({ id: 'tx', type: 'text', page: P, z: 43, x: X + 640, y: Y + 520, s: 1, fs: 28, color: '#000', text: 'Текст' });
      D.addItem({ id: 'far', type: 'text', page: P, z: 44, x: X + 300, y: Y + 4000, s: 1, fs: 40, color: '#000', text: 'Конец урока' }); }); D.setTool('select'); }""", kinds)
    pg.wait_for_timeout(300)
    def sel(ids): pg.evaluate("(ids) => { const D = window.__doska; D.S.sel = new Set(ids); dispatchEvent(new Event('resize')); }", ids); pg.wait_for_timeout(300)
    btn = lambda: pg.locator('.selbar button[data-tip^="Закрасить"], .selbar button[data-tip^="Заливка"]')
    def unfill(): btn().click(); pg.wait_for_timeout(250); pg.locator('.fill-pop .fill-off').click(); pg.wait_for_timeout(250)
    F = lambda id: pg.evaluate("(id) => !!window.__doska.items.get(id).fill", id)
    # --- заливка ---
    for k in ['sine', 'axes', 'op', 'tx']:
        sel([k]); r('у «%s» кнопки «Закрасить» нет' % k, btn().count() == 0)
    sel(kinds + ['rc', 'el', 'op', 'tx'])
    r('у смешанного выделения кнопка есть', btn().count() == 1 and 'Закрасить' in btn().get_attribute('data-tip'))
    u0 = pg.evaluate("() => window.__doska.undo.undoStack.length")
    btn().click(); pg.wait_for_timeout(300)
    fillable = ['triangle', 'square', 'inscribed', 'circumscribed', 'cube', 'cylinder', 'sphere', 'cone', 'rc', 'el']
    r('закрасились все замкнутые фигуры и тела', all(F(k) for k in fillable))
    r('волна, оси, незамкнутая линия и текст не тронуты', not any(F(k) for k in ['sine', 'axes', 'op', 'tx']))
    r('кнопка стала «Заливка» и подсвечена', btn().get_attribute('data-tip').startswith('Заливка') and 'on' in btn().get_attribute('class').split())
    r('одним шагом отмены', pg.evaluate("() => window.__doska.undo.undoStack.length") - u0 == 1)
    pg2.wait_for_timeout(500)
    r('у второго участника тоже закрашено', pg2.evaluate("() => !!window.__doska.items.get('cube').fill && !!window.__doska.items.get('inscribed').fill"))
    # попадание внутрь закрашенной фигуры
    def click_center(id):
        c_ = pg.evaluate("(id) => { const D = window.__doska, i = D.items.get(id); return D.toScreen(i.x + i.w / 2, i.y + i.h * 0.62); }", id)
        pg.evaluate("() => { window.__doska.S.sel.clear(); }"); pg.mouse.click(c_[0], c_[1]); pg.wait_for_timeout(450)
        return pg.evaluate("() => [...window.__doska.S.sel]")
    r('щелчок внутри закрашенного треугольника выделяет его', click_center('triangle') == ['triangle'])
    r('щелчок внутри закрашенного куба выделяет его', click_center('cube') == ['cube'])
    sel(['triangle']); unfill()
    r('заливку можно убрать', not F('triangle'))
    r('щелчок внутри незакрашенного треугольника его не выделяет', click_center('triangle') == [])
    # закреплённое не меняется
    pg.evaluate("() => { const D = window.__doska; D.act(() => D.setFields ? D.setFields('square', { locked: true }) : null); }") if pg.evaluate("() => !!window.__doska.setFields") else pg.evaluate("() => { const D = window.__doska; const it = D.items.get('square'); D.act(() => D.addItem({ ...it, locked: true })); }")
    sel(['square', 'el']); unfill()
    r('закреплённая фигура не перекрасилась', F('square'))
    # повёрнутая закрашенная фигура и стирание по закрашенному — без ошибок
    pg.evaluate("() => { const D = window.__doska; const it = D.items.get('inscribed'); D.act(() => D.addItem({ ...it, rot: 30 })); }"); pg.wait_for_timeout(200)
    pg.keyboard.press('e'); cs = pg.evaluate("() => { const D = window.__doska, i = D.items.get('cylinder'); return D.toScreen(i.x + i.w / 2, i.y + i.h / 2); }")
    pg.mouse.move(cs[0] - 60, cs[1]); pg.mouse.down(); pg.mouse.move(cs[0] + 60, cs[1], steps=8); pg.mouse.up(); pg.wait_for_timeout(300)
    r('ластик по закрашенному телу без ошибок', not errs)
    pg.keyboard.press('v')
    pg.evaluate("() => window.__doska.S.sel.clear()")
    pg.screenshot(path=O + 't124-fill.png')
    # --- ползунок ---
    s0 = vb()
    r('есть запись далеко внизу: ползунок виден', s0 is not None)
    r('ползунок короче дорожки (лист длиннее экрана)', s0 and s0['th'] < (s0['bottom'] - s0['top']) * 0.5)
    tb = pg.locator('.topbar, .bar.tr').first.bounding_box(); zb = pg.locator('.zoombar').bounding_box()
    r('не залезает под верхние кнопки и под масштаб', s0['top'] >= tb['y'] + tb['height'] and s0['bottom'] <= zb['y'])
    y0 = pg.evaluate("() => window.__doska.S.view.y")
    pg.mouse.move(s0['x'] + 7, s0['ty'] + 10); pg.mouse.down(); pg.mouse.move(s0['x'] + 7, s0['ty'] + 60, steps=6); pg.wait_for_timeout(100)
    y1 = pg.evaluate("() => window.__doska.S.view.y")
    r('тянем ползунок вниз — лист едет вверх (%.0f)' % (y1 - y0), y1 < y0 - 50)
    pg.mouse.move(s0['x'] + 7, 2000, steps=8); pg.mouse.up(); pg.wait_for_timeout(200)
    vis = pg.evaluate("() => { const D = window.__doska, i = D.items.get('far'); const s = D.toScreen(i.x, i.y); return s[1] > 0 && s[1] < innerHeight; }")
    r('дотянули до низа — видна последняя запись', vis)
    y2 = pg.evaluate("() => window.__doska.S.view.y"); s2 = vb()
    pg.mouse.move(s2['x'] + 7, s2['ty'] + 5); pg.mouse.down(); pg.mouse.move(s2['x'] + 7, s2['ty'] + 400, steps=5); pg.mouse.up(); pg.wait_for_timeout(100)
    r('ниже конца листа ползунок не уводит', abs(pg.evaluate("() => window.__doska.S.view.y") - y2) < 2)
    # щелчок по дорожке над ползунком — на экран вверх
    s3 = vb(); y3 = pg.evaluate("() => window.__doska.S.view.y")
    pg.mouse.click(s3['x'] + 7, s3['top'] + 5); pg.wait_for_timeout(150)
    r('щелчок по дорожке выше — на экран вверх', pg.evaluate("() => window.__doska.S.view.y") - y3 > 500)
    y4 = pg.evaluate("() => window.__doska.S.view.y"); pg.mouse.move(s3['x'] + 7, 300); pg.mouse.wheel(0, 200); pg.wait_for_timeout(150)
    r('колесо над ползунком тоже листает', pg.evaluate("() => window.__doska.S.view.y") < y4 - 100)
    pg.mouse.move(s3['x'] + 7, 300); pg.wait_for_timeout(250); pg.screenshot(path=O + 't124-bar.png')
    # мелкий масштаб
    pg.evaluate("() => { const v = window.__doska.S.view; v.z = 0.06; dispatchEvent(new Event('resize')); }"); pg.wait_for_timeout(200)
    r('при 6% ползунок на месте, без ошибок', vb() is not None and not errs)
    # панель справа
    c2 = b.new_context(viewport={'width': 1300, 'height': 760}); c2.add_init_script(init('right'))
    q = c2.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:300])); q.goto(URL.replace('?nopeer', '?nopeer&x=3')); q.wait_for_timeout(1500)
    q.evaluate("() => { const D = window.__doska, P = D.S.page; const [X, Y] = D.toWorld(0, 0); D.act(() => D.addItem({ id: 'far', type: 'text', page: P, z: 1, x: X + 300, y: Y + 4000, s: 1, fs: 40, color: '#000', text: 'Низ' })); }"); q.wait_for_timeout(300)
    v = q.evaluate("() => { const v = document.querySelector('.vscroll'); return v.hidden ? null : v.getBoundingClientRect().right; }"); tl = q.locator('.toolbar').bounding_box()
    r('панель инструментов справа: ползунок слева от неё', v is not None and v <= tl['x'])
    q.screenshot(path=O + 't124-right.png')
    # телефон
    c3 = b.new_context(viewport={'width': 390, 'height': 760}, is_mobile=True, has_touch=True); c3.add_init_script(init())
    m = c3.new_page(); m.on('pageerror', lambda e: errs.append(str(e)[:300])); m.goto(URL.replace('?nopeer', '?nopeer&x=4')); m.wait_for_timeout(1500)
    m.evaluate("() => { const D = window.__doska, P = D.S.page; const [X, Y] = D.toWorld(0, 0); D.act(() => D.addItem({ id: 'far', type: 'text', page: P, z: 1, x: X + 30, y: Y + 4000, s: 1, fs: 40, color: '#000', text: 'Низ' })); }"); m.wait_for_timeout(300)
    r('на телефоне ползунка нет', m.evaluate("() => { const v = document.querySelector('.vscroll'); return !v || v.hidden; }"))
    r('ошибок в странице нет', not errs); print(errs)
    b.close()
print('ИТОГ', sum(1 for _, v in res if v), 'из', len(res))
