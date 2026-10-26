# Узкие экраны: телефон и планшет — панели не налезают друг на друга
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, vp in [('phone', {'width': 390, 'height': 800}), ('tablet', {'width': 820, 'height': 1180})]:
        ctx = b.new_context(viewport=vp, device_scale_factor=2, has_touch=True, is_mobile=True)
        ctx.add_init_script("""localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));
          localStorage.setItem('doska:account', JSON.stringify({email:'mira@example.com', since:1, pro:{period:'month', started:Date.now(), until:Date.now()+30*864e5, canceled:false, method:'card'}}));""")
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=nrrw-' + name[:4] + '-aaaa'); pg.wait_for_timeout(2000)
        pg.evaluate("""() => { const d = window.__doska; d.act(() => { d.addItem({ id: 'h1', type: 'hw', page: d.S.page, z: 5, x: 100, y: 200, s: 1, sz: 48, op: 1, name: 'Д/З 1', n: 1 }); d.addItem({ id: 't1', type: 'text', page: d.S.page, z: 4, x: 160, y: 210, s: 1, fs: 28, color: '#1e1e1e', text: '№ 512' }); }); }""")
        pg.wait_for_timeout(300)
        pg.evaluate("() => { const d = window.__doska; d.setTool('select'); d.S.sel = new Set(['h1']); }"); pg.wait_for_timeout(100)
        pg.evaluate("() => window.__doska.setPage(window.__doska.S.page)"); pg.wait_for_timeout(400)
        pg.screenshot(path=OUT + f'n-{name}-1.png')
        pg.evaluate("() => window.__doska.mat().open()"); pg.wait_for_timeout(500)
        pg.screenshot(path=OUT + f'n-{name}-2.png')
        print(name, errs); ctx.close()
    b.close()
