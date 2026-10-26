# Шторка и точный ластик: куски разрезанной линии остаются под шторкой; ученик ничего не видит
from playwright.sync_api import sync_playwright
from PIL import Image
import io
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
URL = 'file:///home/claude/board/dist/doska.html?nopeer#r=sher-test-room'
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1200, 'height': 800})
    ctx.add_init_script("""if (!localStorage.getItem('doska:prefs')) localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0, eraserPrecise: true}));
      localStorage.setItem('doska:account', JSON.stringify({email:'m@e.ru', since:1, pro:{period:'month', started:Date.now(), until:Date.now()+30*864e5, canceled:false, method:'card'}}));""")
    A = ctx.new_page(); A.on('pageerror', lambda e: errs.append(str(e))); A.goto(URL); A.wait_for_timeout(1800)
    def drag(a, c, steps=14):
        A.mouse.move(*a); A.mouse.down(); A.mouse.move(*c, steps=steps); A.mouse.up(); A.wait_for_timeout(150)
    A.evaluate("() => window.__doska.setTool('pen')"); drag((300, 300), (300, 500)); drag((360, 300), (420, 500))
    A.keyboard.press('v'); drag((250, 250), (480, 550))
    A.click('.selbar [data-tip^="Скрыть ответ"]'); A.wait_for_timeout(500)
    A.keyboard.press('e'); drag((250, 400), (480, 400), 30); A.wait_for_timeout(500)
    r = A.evaluate("() => { const D = window.__doska; const st = [...D.items.values()].filter(i => i.type === 'stroke').map(i => i.id); const sh = [...D.items.values()].find(i => i.type === 'shade'); return [st.length, st.every(id => sh.cover.includes(id))]; }")
    print('после точного ластика линий', r[0], 'все под шторкой', r[1])
    # ученик открывает ту же доску в этом браузере
    A.evaluate("() => { const p = JSON.parse(localStorage.getItem('doska:prefs')); p.role = 'student'; localStorage.setItem('doska:prefs', JSON.stringify(p)); }")
    A.reload(); A.wait_for_timeout(1800)
    # при уходе со страницы доска сохраняет свои настройки и может перезаписать роль, поэтому проверяем и повторяем
    for _ in range(3):
        if A.evaluate("() => document.querySelector('.role-pill')?.textContent || ''").startswith('Ученик'): break
        A.evaluate("() => { const p = JSON.parse(localStorage.getItem('doska:prefs')); p.role = 'student'; localStorage.setItem('doska:prefs', JSON.stringify(p)); }"); A.reload(); A.wait_for_timeout(1800)
    print('роль на странице', A.evaluate("() => document.querySelector('.role-pill')?.textContent || ''"))
    A.mouse.move(1150, 780); A.wait_for_timeout(300)
    im = Image.open(io.BytesIO(A.screenshot())).convert('L')
    box = A.evaluate("() => { const D = window.__doska; const sh = [...D.items.values()].find(i => i.type === 'shade'); const a = D.toScreen(sh.x, sh.y), b = D.toScreen(sh.x + sh.w, sh.y + sh.h); return [a[0], a[1], b[0], b[1]]; }")
    crop = im.crop(tuple(int(v) for v in box))
    print('ученик: тёмных точек под шторкой', sum(1 for v in crop.getdata() if v < 90))
    A.keyboard.press('v'); drag((250, 250), (480, 550)); print('ученик выделил', A.evaluate("() => window.__doska.S.sel.size"))
    A.screenshot(path=OUT + 'sher.png')
    A.keyboard.press('Escape'); A.evaluate("() => window.__doska.hist().open()"); A.wait_for_timeout(1200)
    A.screenshot(path=OUT + 'sher-hist.png')
    im = Image.open(io.BytesIO(A.screenshot(clip={'x': 0, 'y': 70, 'width': 1200, 'height': 660}))).convert('L')
    print('история у ученика с Про: тёмных точек', sum(1 for v in im.getdata() if v < 90))
    worst = 0
    for k in range(40):
        A.evaluate("(v) => { const r = document.querySelector('.hp-range'); r.value = v; r.dispatchEvent(new Event('input')); }", str(k * 250)); A.wait_for_timeout(80)
        im = Image.open(io.BytesIO(A.screenshot(clip={'x': 0, 'y': 70, 'width': 1200, 'height': 660}))).convert('L')
        d = sum(1 for v in im.getdata() if v < 90)
        if d > worst: worst = d; A.screenshot(path=OUT + 'sher-worst.png')
    print('перемотка назад по всей записи: больше всего тёмных точек в кадре', worst)
    A.screenshot(path=OUT + 'sher-hist0.png')
    print(errs); b.close()
