# v25: собеседник видит процесс: выделение, перенос, растяжение, рамку, фигуры, правку формы, текст, ластик
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude-doska/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/show/'
URL = 'file:///home/claude/board/dist/doska.html?nopeer#r=v25p-ests-0002'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1100, 'height': 700})
    ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Тест'}))")
    errs = []
    A = ctx.new_page(); A.on('pageerror', lambda e: errs.append('A ' + str(e))); A.goto(URL); A.wait_for_function('() => window.__doska')
    B = ctx.new_page(); B.on('pageerror', lambda e: errs.append('B ' + str(e))); B.goto(URL); B.wait_for_function('() => window.__doska')
    A.wait_for_timeout(800); A.bring_to_front()
    pv = lambda: B.evaluate("() => [...window.__doska.remotePv.values()].map(v => ({sel: v.sel && v.sel.length, ov: !!v.ov, marq: !!v.marq, tmp: v.tmp && v.tmp.map(t => t.type + (t.text ? ':' + t.text : '')), hid: v.hid.size, er: v.er && v.er.st.pieces.size}))")
    shot = lambda n: B.screenshot(path=OUT + 'pv-' + n + '.png', clip={'x': 100, 'y': 100, 'width': 800, 'height': 500})
    # прямоугольник: во время рисования
    A.keyboard.press('KeyR'); A.mouse.move(200, 200); A.mouse.down(); A.mouse.move(300, 280, steps=4); A.mouse.move(380, 330, steps=4); A.wait_for_timeout(200)
    print('1 drawing rect:', pv()); shot('1-draw')
    A.mouse.up(); A.wait_for_timeout(300)
    print('2 after (selected):', pv()); shot('2-selected')
    # перенос
    A.mouse.move(290, 205); A.mouse.down(); A.mouse.move(450, 300, steps=6); A.wait_for_timeout(200)
    print('3 moving:', pv()); shot('3-move')
    A.mouse.up(); A.wait_for_timeout(300)
    # растяжение за угол
    it = A.evaluate("() => [...window.__doska.items.values()].pop()")
    cx, cy = A.evaluate(f"() => window.__doska.toScreen({it['x']} + {it['w']}, {it['y']} + {it['h']})")
    A.mouse.move(cx + 10, cy + 10); A.mouse.down(); A.mouse.move(cx + 120, cy + 90, steps=6); A.wait_for_timeout(200)
    print('4 resizing:', pv()); shot('4-resize')
    A.mouse.up(); A.wait_for_timeout(300)
    # правка формы: двойной щелчок, тянем сторону
    it = A.evaluate("() => [...window.__doska.items.values()].pop()")
    x0, y0 = A.evaluate(f"() => window.__doska.toScreen({it['x']}, {it['y']})"); x1, y1 = A.evaluate(f"() => window.__doska.toScreen({it['x']} + {it['w']} * ({it.get('s') or 1}), {it['y']})")
    A.mouse.dblclick((x0 + x1) / 2, y0 + 1); A.wait_for_timeout(150)
    A.mouse.move((x0 + x1) / 2, y0 + 1); A.mouse.down(); A.mouse.move((x0 + x1) / 2 + 60, y0 + 1, steps=5); A.wait_for_timeout(200)
    print('5 edge drag:', pv()); shot('5-edge')
    A.mouse.up(); A.keyboard.press('Escape'); A.wait_for_timeout(300)
    # рамка выделения
    A.mouse.click(1000, 650); A.keyboard.press('KeyV'); A.mouse.move(150, 450); A.mouse.down(); A.mouse.move(700, 600, steps=5); A.wait_for_timeout(200)
    print('6 marquee:', pv()); shot('6-marq')
    A.mouse.up(); A.mouse.click(1000, 650); A.wait_for_timeout(300)
    # текст
    A.keyboard.press('KeyT'); A.mouse.click(200, 520); A.wait_for_timeout(150); A.keyboard.type('Привет, x²', delay=20); A.wait_for_timeout(250)
    print('7 typing:', pv()); shot('7-text')
    A.mouse.click(1000, 650); A.wait_for_timeout(300)
    # ластик точный по линии
    A.keyboard.press('KeyP'); A.mouse.move(500, 500); A.mouse.down(); A.mouse.move(800, 520, steps=12); A.mouse.up(); A.wait_for_timeout(200)
    A.evaluate("() => { const pr = JSON.parse(localStorage.getItem('doska:prefs')); }")
    A.keyboard.press('KeyE'); A.keyboard.press('KeyE')  # второй раз — точный
    A.mouse.move(650, 470); A.mouse.down(); A.mouse.move(650, 560, steps=8); A.wait_for_timeout(200)
    print('8 erasing:', pv()); shot('8-erase')
    A.mouse.up(); A.wait_for_timeout(400)
    print('9 done:', pv(), 'items A/B', A.evaluate('() => window.__doska.items.size'), B.evaluate('() => window.__doska.items.size'))
    shot('9-final')
    print('errors', errs); b.close()
