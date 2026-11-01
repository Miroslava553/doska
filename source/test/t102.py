# Точный ластик по тексту: стирает только часть букв под кругом; правка текста убирает вырезы; «целиком» удаляет текст
from playwright.sync_api import sync_playwright
from PIL import Image
import io
res = []
def r(n, v): res.append((n, v)); print(('✓ ' if v else '✗ ') + n)
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    pg = b.new_page(viewport={'width': 1300, 'height': 800}); pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0, eraserPrecise: true, size: { eraser: 12 }}));")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=txt1-aaaa-bbbb'); pg.wait_for_timeout(1500)
    D = lambda js, *a: pg.evaluate(js, *a)
    D("() => { window.__doska.S.view = { z: 1, x: 0, y: 0 }; }"); pg.mouse.move(640, 760); pg.wait_for_timeout(100)
    scr = lambda x, y: D("([x, y]) => window.__doska.toScreen(x, y)", [x, y])
    shot = lambda: Image.open(io.BytesIO(pg.screenshot())).convert('L')
    D("() => { const D = window.__doska; D.doc.transact(() => D.addItem({ id: 'TX', type: 'text', page: D.S.page, z: 1, x: 200, y: 200, s: 1, fs: 120, color: '#1f2328', text: 'ШРИФТ' }), 'noundo'); }")
    pg.wait_for_timeout(300); im0 = shot()
    pg.keyboard.press('e'); R = D("() => window.__doska.eraseR()")
    pg.mouse.move(*scr(220, 300)); pg.mouse.down(); pg.mouse.move(*scr(560, 300), steps=10); pg.mouse.up(); pg.wait_for_timeout(200)
    im = shot()
    def darkcount(img, y0, y1, x0=200, x1=600):
        n = 0
        for y in range(int(y0), int(y1)):
            for x in range(x0, x1, 2):
                sx, sy = scr(x, y)
                if img.getpixel((int(sx), int(sy))) < 120: n += 1
        return n
    inside = darkcount(im, 300 - R + 1.5, 300 + R - 1.5, 222, 558); inside0 = darkcount(im0, 300 - R + 1.5, 300 + R - 1.5, 222, 558)
    above = darkcount(im, 215, 300 - R - 1.5); above0 = darkcount(im0, 215, 300 - R - 1.5)
    r('текст: под кругом стёрто (было %d тёмных точек, стало %d), выше пути буквы целы (%d из %d)' % (inside0, inside, above, above0), inside0 > 50 and inside == 0 and abs(above - above0) <= 3)
    r('текст остался одним объектом с вырезом', D("() => { const t = window.__doska.items.get('TX'); return !!(t && t.cuts && t.cuts.length); }"))
    pg.keyboard.press('e'); pg.wait_for_timeout(100)  # «целиком»
    pg.mouse.move(*scr(380, 300)); pg.mouse.down(); pg.mouse.move(*scr(381, 300)); pg.mouse.up(); pg.wait_for_timeout(200)
    r('«целиком» по стёртому месту текста: текст остался', D("() => window.__doska.items.has('TX')"))
    pg.mouse.move(*scr(260, 240)); pg.mouse.down(); pg.mouse.move(*scr(262, 240)); pg.mouse.up(); pg.wait_for_timeout(200)
    r('«целиком» по буквам: текст удалён', not D("() => window.__doska.items.has('TX')"))
    r('без ошибок', not errs)
    b.close()
print('ИТОГ', sum(1 for _, v in res if v), 'из', len(res))
