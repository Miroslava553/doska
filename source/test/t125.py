# Ползунок отодвинут от края и тянется пером; прозрачность заливки; кнопки «Полный экран» нет
from playwright.sync_api import sync_playwright
O = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/sc/'
URL = 'http://127.0.0.1:8765/doska.html?nopeer#r=fl25-aaaa-bbbb'
res = []
def r(n, v): res.append((n, v)); print(('✓ ' if v else '✗ ') + n)
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    c = b.new_context(viewport={'width': 1300, 'height': 760}); c.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0})); localStorage.setItem('doska:seenTour','1')")
    pg = c.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:300])); pg.goto(URL); pg.wait_for_timeout(1500)
    r('кнопки «Полный экран» нет', pg.locator('.fs-btn').count() == 0 and pg.locator('[data-tip^="Полный экран"], [title^="Полный экран"]').count() == 0)
    pg.evaluate("""() => { const D = window.__doska, P = D.S.page; const [X, Y] = D.toWorld(0, 0); D.act(() => {
      D.addItem({ id: 'cube', type: 'fig', kind: 'cube', page: P, z: 1, x: X + 200, y: Y + 200, w: 160, h: 160, s: 1, size: 3.15, color: '#e03131' });
      D.addItem({ id: 'rc', type: 'rect', page: P, z: 2, x: X + 450, y: Y + 220, w: 160, h: 100, s: 1, size: 3.15, color: '#1971c2' });
      D.addItem({ id: 'far', type: 'text', page: P, z: 3, x: X + 300, y: Y + 4000, s: 1, fs: 40, color: '#000', text: 'Низ' }); }); D.setTool('select'); }""")
    pg.wait_for_timeout(300)
    # --- ползунок ---
    g = pg.evaluate("() => { const v = document.querySelector('.vscroll'), t = v.firstChild; const r = v.getBoundingClientRect(), q = t.getBoundingClientRect(); return {right: innerWidth - q.right, x: q.left + q.width / 2, ty: q.top, ta: getComputedStyle(v).touchAction, tt: getComputedStyle(t).touchAction}; }")
    r('ползунок отодвинут от края (%.0f px)' % g['right'], g['right'] >= 12)
    r('перо не превращается в прокрутку страницы (touch-action: none)', g['ta'] == 'none' and g['tt'] == 'none')
    cdp = c.new_cdp_session(pg)
    def ev(t, x, y, bs): cdp.send('Input.dispatchMouseEvent', {'type': t, 'x': x, 'y': y, 'button': 'left' if t != 'mouseMoved' else ('left' if bs else 'none'), 'buttons': bs, 'clickCount': 1 if t != 'mouseMoved' else 0, 'pointerType': 'pen', 'force': 0.5})
    y0 = pg.evaluate("() => window.__doska.S.view.y"); n0 = pg.evaluate("() => window.__doska.items.size")
    ev('mouseMoved', g['x'], g['ty'] + 10, 0); ev('mousePressed', g['x'], g['ty'] + 10, 1)
    # перо уходит вбок с узкой полосы — перетаскивание не обрывается
    for k in range(1, 16): ev('mouseMoved', g['x'] - k * 4, g['ty'] + 10 + k * 8, 1); pg.wait_for_timeout(12)
    mid = pg.evaluate("() => window.__doska.S.view.y")
    ev('mouseReleased', g['x'] - 60, g['ty'] + 130, 0); pg.wait_for_timeout(150)
    r('пером тянем ползунок — лист едет (%.0f)' % (mid - y0), mid < y0 - 200)
    r('перо ушло с полосы вбок — перетаскивание не оборвалось', abs(pg.evaluate("() => window.__doska.S.view.y") - mid) < 1 and mid < y0 - 200)
    r('пером по ползунку ничего не нарисовалось', pg.evaluate("() => window.__doska.items.size") == n0)
    pg.evaluate("() => { const D = window.__doska, i = D.items.get('cube'), v = D.S.view; v.y = 250 - i.y * v.z; dispatchEvent(new Event('resize')); }"); pg.wait_for_timeout(200)
    # --- прозрачность заливки ---
    pg.evaluate("() => { const D = window.__doska; D.S.sel = new Set(['cube', 'rc']); dispatchEvent(new Event('resize')); }"); pg.wait_for_timeout(300)
    pg.locator('.selbar button[data-tip^="Закрасить"]').click(); pg.wait_for_timeout(300)
    fb = pg.locator('.selbar button[data-tip^="Заливка"]')
    r('после заливки кнопка «Заливка» подсвечена', fb.count() == 1 and 'on' in fb.get_attribute('class').split())
    fb.click(); pg.wait_for_timeout(300)
    pop = pg.locator('.fill-pop')
    r('открылось окно с прозрачностью и «Убрать заливку»', pop.count() == 1 and pop.locator('input[type=range]').count() == 1 and 'Убрать заливку' in pop.inner_text())
    r('ползунок показывает прозрачность 78%', pop.locator('.sz-val').inner_text() == '78%')
    u0 = pg.evaluate("() => window.__doska.undo.undoStack.length")
    rb = pop.locator('input[type=range]').bounding_box()
    pg.mouse.move(rb['x'] + rb['width'] * 0.8, rb['y'] + rb['height'] / 2); pg.mouse.down()
    for k in range(1, 11): pg.mouse.move(rb['x'] + rb['width'] * (0.8 - k * 0.06), rb['y'] + rb['height'] / 2); pg.wait_for_timeout(15)
    pg.mouse.up(); pg.wait_for_timeout(200)
    fo = pg.evaluate("() => [window.__doska.items.get('cube').fo, window.__doska.items.get('rc').fo]")
    r('прозрачность поменялась у обеих фигур (%s)' % fo, fo[0] == fo[1] and fo[0] and fo[0] > 0.6)
    r('перетаскивание ползунка — один шаг отмены', pg.evaluate("() => window.__doska.undo.undoStack.length") - u0 == 1)
    r('окно не закрылось, пока тянули', pop.count() == 1)
    pg.screenshot(path=O + 't125-pop.png')
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(200)
    r('Ctrl+Z вернул прежнюю прозрачность', pg.evaluate("() => window.__doska.items.get('cube').fo") in (None, 0.22))
    pg.mouse.click(1000, 650); pg.wait_for_timeout(200)
    pg.evaluate("() => { const D = window.__doska; D.S.sel = new Set(['cube', 'rc']); dispatchEvent(new Event('resize')); }"); pg.wait_for_timeout(300)
    pg.locator('.selbar button[data-tip^="Заливка"]').click(); pg.wait_for_timeout(250)
    pg.locator('.fill-pop .fill-off').click(); pg.wait_for_timeout(250)
    r('«Убрать заливку» убрала у обеих и закрыла окно', not pg.evaluate("() => !!window.__doska.items.get('cube').fill || !!window.__doska.items.get('rc').fill") and pg.locator('.fill-pop').count() == 0)
    r('кнопка снова «Закрасить»', pg.locator('.selbar button[data-tip^="Закрасить"]').count() == 1)
    # повторно закрасили — прежняя прозрачность помнится
    pg.evaluate("() => { const D = window.__doska; D.act(() => { D.addItem({ ...D.items.get('rc'), fill: true, fo: 0.8 }); }); }"); pg.wait_for_timeout(200)
    vis = pg.evaluate("() => { const D = window.__doska, i = D.items.get('rc'); const [x, y] = D.toScreen(i.x + i.w / 2, i.y + i.h / 2); const c = document.querySelector('canvas'); const g = c.getContext('2d'); const d = g.getImageData(Math.round(x * devicePixelRatio), Math.round(y * devicePixelRatio), 1, 1).data; return [...d]; }")
    r('плотная заливка рисуется плотной (%s)' % vis[:3], vis[0] < 120 and vis[2] > 150)
    r('ошибок в странице нет', not errs); print(errs)
    b.close()
print('ИТОГ', sum(1 for _, v in res if v), 'из', len(res))
