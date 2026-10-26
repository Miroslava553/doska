# История доски: два листа (следит за листом, где идёт работа) и вид на телефоне
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch()
    for vp in [{'width': 1300, 'height': 850}, {'width': 390, 'height': 760}]:
        ctx = b.new_context(viewport=vp, device_scale_factor=2)
        ctx.add_init_script("""localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));
          localStorage.setItem('doska:account', JSON.stringify({email:'m@e.ru', since:1, pro:{period:'month', started:Date.now(), until:Date.now()+30*864e5, canceled:false, method:'card'}}));""")
        pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=twop-aaaa-bbbb'); pg.wait_for_timeout(2000)
        D = "window.__doska"
        pg.evaluate("""async () => { const D = window.__doska; const p1 = D.pages()[0].id;
          D.act(() => D.addItem({ id: 'a1', type: 'rect', page: p1, x: 0, y: 0, w: 300, h: 200, size: 3, color: '#1f2328', z: 1 }));
          await new Promise(r => setTimeout(r, 1300)); }""")
        pg.mouse.click(600, 600); pg.keyboard.press('Shift+N'); pg.wait_for_timeout(300)
        pg.evaluate("""async () => { const D = window.__doska; const ps = D.pages(); const p2 = ps[ps.length - 1].id;
          D.act(() => D.addItem({ id: 'b1', type: 'ellipse', page: p2, x: 0, y: 0, w: 300, h: 300, size: 3, color: '#1971c2', z: 1 }));
          await new Promise(r => setTimeout(r, 1300)); }""")
        print('листов', pg.evaluate("() => window.__doska.pages().length"))
        pg.evaluate("() => window.__doska.hist().open()"); pg.wait_for_timeout(1200)
        pg.screenshot(path=OUT + f"two_{vp['width']}_end.png")
        pg.keyboard.press('ArrowLeft'); pg.wait_for_timeout(300)
        pg.screenshot(path=OUT + f"two_{vp['width']}_back.png")
        print(vp['width'], 'лист в истории', pg.locator('.hp-pages .chip.on').inner_text() if pg.locator('.hp-pages .chip.on').count() else '-', errs)
        ctx.close()
    b.close()
