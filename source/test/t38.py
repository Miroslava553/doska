# мигание у собеседника при правке угла/стороны: фигура и рамка не должны пропадать
from playwright.sync_api import sync_playwright
import io
from PIL import Image
URL = 'file:///home/claude/board/dist/doska.html?nopeer#r=v26f-lick-0001'
def ink(pg, clip):
    im = Image.open(io.BytesIO(pg.screenshot(clip=clip))).convert('RGB'); px = im.load(); n = o = 0
    for y in range(0, im.height, 2):
        for x in range(0, im.width, 2):
            r, g, b = px[x, y]
            if r < 120 and g < 140: n += 1          # линия фигуры (тёмная/синяя)
            elif r > 220 and 80 < g < 140 and b < 60: o += 1  # оранжевая рамка
    return n, o
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1000, 'height': 700})
    ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Тест'}))")
    errs = []
    A = ctx.new_page(); A.on('pageerror', lambda e: errs.append('A ' + str(e))); A.goto(URL); A.wait_for_function('() => window.__doska')
    B = ctx.new_page(); B.on('pageerror', lambda e: errs.append('B ' + str(e))); B.goto(URL); B.wait_for_function('() => window.__doska')
    A.wait_for_timeout(800); A.bring_to_front()
    A.evaluate('() => window.__doska.setTool("fig:triangle")'); A.mouse.move(350, 250); A.mouse.down(); A.mouse.move(650, 450, steps=5); A.mouse.up(); A.wait_for_timeout(300)
    it = A.evaluate("() => [...window.__doska.items.values()].pop()")
    x0, y0 = A.evaluate(f"() => window.__doska.toScreen({it['x']}, {it['y']} + {it['h']})"); x1, _ = A.evaluate(f"() => window.__doska.toScreen({it['x']} + {it['w']}, 0)")
    clip = {'x': 250, 'y': 150, 'width': 520, 'height': 400}
    print('before', ink(B, clip))
    A.mouse.dblclick((x0 + x1) / 2, y0 - 1); A.wait_for_timeout(200)
    seq = []
    A.mouse.move((x0 + x1) / 2, y0 - 1); A.mouse.down()
    for i in range(8): A.wait_for_timeout(60); seq.append(ink(B, clip))   # держим, не двигая
    for i in range(10):
        A.mouse.move((x0 + x1) / 2 + i * 4, y0 - 1 + i * 3); A.wait_for_timeout(60); seq.append(ink(B, clip)); print(i, B.evaluate("() => [...window.__doska.remotePv.values()].map(v => [v.tmp && v.tmp.length, v.hid.size, v.sel && v.sel.length, v.tmp && JSON.stringify(v.tmp[0]).slice(0,120)])"))
        if i in (3, 4): B.screenshot(path='/tmp/claude-0/-home-claude-doska/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/show/fl-%d.png' % i, clip=clip)
    A.mouse.up(); A.wait_for_timeout(300); seq.append(ink(B, clip))
    print('lines:', [s[0] for s in seq]); print('frame:', [s[1] for s in seq])
    print('min lines', min(s[0] for s in seq), 'min frame', min(s[1] for s in seq[:-1]))
    print('errors', errs); b.close()
