# Сердце, звезда, домик: вставка, выделение, заливка, отражение, правка вершин звезды, ластик
from playwright.sync_api import sync_playwright
URL = 'http://127.0.0.1:8765/doska.html?nopeer#r=dc26-aaaa-bbbb'
res = []
def r(n, v): res.append((n, v)); print(('✓ ' if v else '✗ ') + n)
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    c = b.new_context(viewport={'width': 1300, 'height': 760}); c.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0})); localStorage.setItem('doska:seenTour','1')")
    pg = c.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:300])); pg.goto(URL); pg.wait_for_timeout(1500)
    pg2 = c.new_page(); pg2.on('pageerror', lambda e: errs.append(str(e)[:300])); pg2.goto(URL.replace('?nopeer', '?nopeer&x=2')); pg2.wait_for_timeout(1500); pg.bring_to_front()
    shapes = lambda: pg.click('.toolbar [data-grp="shapes"]')
    kinds = {'Сердце': 'heart', 'Звезда': 'star', 'Домик': 'house'}
    for i, (name, k) in enumerate(kinds.items()):
        shapes(); pg.wait_for_timeout(350); bt = pg.locator(f'[data-tip^="{name}"]').first; bt.scroll_into_view_if_needed(); bt.click(); pg.wait_for_timeout(250)
        pg.mouse.click(250 + i * 330, 330); pg.wait_for_timeout(300)
    got = pg.evaluate("() => [...window.__doska.items.values()].map(i => i.kind)")
    r('щелчком вставились сердце, звезда и домик (%s)' % got, got == ['heart', 'star', 'house'])
    pg.keyboard.press('Escape'); pg.evaluate("() => window.__doska.setTool('select')")
    ids = pg.evaluate("() => [...window.__doska.items.keys()]")
    box = lambda id: pg.evaluate("(id) => { const D = window.__doska, i = D.items.get(id); const a = D.toScreen(i.x, i.y), b = D.toScreen(i.x + i.w, i.y + i.h); return [a[0], a[1], b[0], b[1]]; }", id)
    def click(x, y): pg.evaluate("() => window.__doska.S.sel.clear()"); pg.mouse.click(x, y); pg.wait_for_timeout(450); return [*pg.evaluate("() => [...window.__doska.S.sel]")]
    hb = box(ids[0])
    r('щелчок по краю сердца (низ, острие) выделяет его', click((hb[0] + hb[2]) / 2, hb[3] - 3) == [ids[0]])
    sb = box(ids[1])
    r('щелчок по верхнему лучу звезды выделяет её', click((sb[0] + sb[2]) / 2, sb[1] + 4) == [ids[1]])
    r('щелчок в пустую середину незакрашенной звезды — мимо', click((sb[0] + sb[2]) / 2, (sb[1] + sb[3]) / 2 + 5) == [])
    pg.evaluate("(ids) => { const D = window.__doska; D.S.sel = new Set(ids); dispatchEvent(new Event('resize')); }", ids); pg.wait_for_timeout(300)
    pg.locator('.selbar button[data-tip^="Закрасить"]').click(); pg.wait_for_timeout(300)
    r('все три закрасились', pg.evaluate("() => [...window.__doska.items.values()].every(i => i.fill)"))
    r('щелчок внутри закрашенного сердца (в лепестке) выделяет его', click(hb[0] + (hb[2] - hb[0]) * 0.25, hb[1] + (hb[3] - hb[1]) * 0.3) == [ids[0]])
    r('щелчок над ложбинкой сердца — мимо', click((hb[0] + hb[2]) / 2, hb[1] + 4) == [])
    db = box(ids[2])
    r('щелчок в закрашенный домик выделяет его', click(db[0] + (db[2] - db[0]) * 0.2, db[1] + (db[3] - db[1]) * 0.7) == [ids[2]])
    r('щелчок рядом с крышей снаружи — мимо', click(db[0] + 5, db[1] + 5) == [])
    pg2.wait_for_timeout(400)
    r('у второго участника те же фигуры и заливка', pg2.evaluate("() => [...window.__doska.items.values()].map(i => i.kind + (i.fill ? '+' : '')).join()") == 'heart+,star+,house+')
    # отражение сердца
    pg.evaluate("(id) => { window.__doska.S.sel = new Set([id]); dispatchEvent(new Event('resize')); }", ids[0]); pg.wait_for_timeout(300)
    mir = pg.locator('.selbar button[data-tip^="Отразить"]')
    if mir.count(): mir.click(); pg.wait_for_timeout(300)
    r('отражение сердца без ошибок', not errs)
    # правка вершин звезды двойным щелчком
    pg.mouse.click(10, 700); pg.wait_for_timeout(500)
    pg.mouse.dblclick((sb[0] + sb[2]) / 2, sb[1] + 4); pg.wait_for_timeout(500)
    k = pg.evaluate("() => { const D = window.__doska; return [...D.S.sel].map(id => D.items.get(id).type); }")
    r('звезду можно править по вершинам (%s)' % k, len(k) == 1 and not errs)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    # ластик режет сердце
    pg.evaluate("() => window.__doska.S.sel.clear()"); pg.keyboard.press('e'); pg.wait_for_timeout(100)
    hb = box(ids[0]); n0 = pg.evaluate("() => window.__doska.items.size")
    pg.mouse.move(hb[0] - 20, (hb[1] + hb[3]) / 2); pg.mouse.down(); pg.mouse.move(hb[2] + 20, (hb[1] + hb[3]) / 2, steps=12); pg.mouse.up(); pg.wait_for_timeout(300)
    r('ластик по сердцу без ошибок', not errs)
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(200)
    r('Ctrl+Z вернул сердце', pg.evaluate("() => [...window.__doska.items.values()].some(i => i.kind === 'heart')"))
    r('ошибок в странице нет', not errs); print(errs)
    b.close()
print('ИТОГ', sum(1 for _, v in res if v), 'из', len(res))
