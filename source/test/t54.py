# Потеря сообщения в пути: записи всё равно должны дойти сами (без перезахода)
from playwright.sync_api import sync_playwright
URL = 'file:///home/claude/board/dist/doska.html?nopeer#r=v29r-olee-0160'
with sync_playwright() as p:
    b = p.chromium.launch()
    def mk(name):
        ctx = b.new_context(viewport={'width': 1200, 'height': 800})
        ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'%s', role:'tutor', roleFirst: 1, roleAt: 0}))" % name)
        pg = ctx.new_page(); pg.on('pageerror', lambda e: print(name, 'ERR', e)); pg.goto(URL); pg.wait_for_timeout(2500); return pg
    A = mk("Мира"); B = mk("Репетитор"); print("pages up", flush=True)
    state = {'drop': 0, 'dropped': 0}
    Q = []
    def deliver(dst, d, isbin, tag):
        if tag == 'ab' and isbin and state['drop'] > 0:
            state['drop'] -= 1; state['dropped'] += 1; return
        Q.append((dst, d, isbin))
    def pump(ms):
        import time
        end = time.time() + ms / 1000
        while time.time() < end:
            while Q:
                dst, d, isbin = Q.pop(0)
                dst.evaluate("([d, isbin]) => { const pp = window.__pipe; pp.onmessage?.(isbin ? Uint8Array.from(atob(d), c => c.charCodeAt(0)) : d); }", [d, isbin])
            A.wait_for_timeout(30)
    A.expose_function('__out', lambda d, isbin: deliver(B, d, isbin, 'ab'))
    B.expose_function('__out', lambda d, isbin: deliver(A, d, isbin, 'ba'))
    js = """() => { const pipe = { send: (d) => { if (typeof d === 'string') window.__out(d, false); else { let s = ''; const u = d instanceof Uint8Array ? d : new Uint8Array(d); for (const c of u) s += String.fromCharCode(c); window.__out(btoa(s), true); } }, close() {}, onmessage: null, onclose: null };
      window.__pipe = pipe; window.__doska.hub.addPipe(pipe, 'peer'); }"""
    A.evaluate(js); B.evaluate(js); pump(600)
    cnt = lambda pg: pg.evaluate("() => window.__doska.items.size")
    # теряем следующее двоичное сообщение от A к B (например, кусок большой передачи)
    state['drop'] = 1
    A.evaluate("() => { const d = window.__doska; d.act(() => { for (let i = 0; i < 5; i++) d.addItem({ id: 'm' + i, type: 'rect', page: d.S.page, z: i + 1, x: 100 + i * 60, y: 100, s: 1, w: 40, h: 40, size: 2.7, color: '#e03131' }); }); }")
    pump(200)
    A.evaluate("() => { const d = window.__doska; d.act(() => d.addItem({ id: 'later', type: 'rect', page: d.S.page, z: 9, x: 100, y: 300, s: 1, w: 40, h: 40, size: 2.7, color: '#1971c2' })); }")
    for t in [300, 1000, 2000, 16000]:
        pump(t); print(f'+{t}ms', 'A', cnt(A), 'B', cnt(B), 'dropped', state['dropped'], 'B missing', B.evaluate("() => window.__doska.hub.missing()"))
    b.close()
