# «Глаз»: начало линии собеседника и его картинка — по центру
import time
from playwright.sync_api import sync_playwright
URL = 'file:///home/claude/board/dist/doska.html?nopeer#r=v29r-olee-0250'
with sync_playwright() as p:
    b = p.chromium.launch()
    def mk(name, role):
        ctx = b.new_context(viewport={'width': 1200, 'height': 800})
        ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'%s', role:'%s', roleFirst: 1, roleAt: 0}))" % (name, role))
        pg = ctx.new_page(); pg.on('pageerror', lambda e: print(name, 'ERR', e)); pg.goto(URL); pg.wait_for_timeout(2500); return pg
    A = mk('Мира', 'student'); B = mk('Иван', 'tutor')
    Q = []
    A.expose_function('__out', lambda d, isbin: Q.append((B, d, isbin)))
    B.expose_function('__out', lambda d, isbin: Q.append((A, d, isbin)))
    js = """() => { const pipe = { send: (d) => { if (typeof d === 'string') window.__out(d, false); else { let s = ''; const u = d instanceof Uint8Array ? d : new Uint8Array(d); for (const c of u) s += String.fromCharCode(c); window.__out(btoa(s), true); } }, close() {}, onmessage: null, onclose: null };
      window.__pipe = pipe; window.__doska.hub.addPipe(pipe, 'peer'); }"""
    def pump(ms):
        end = time.time() + ms / 1000
        while time.time() < end:
            while Q:
                dst, d, isbin = Q.pop(0)
                dst.evaluate("([d, isbin]) => window.__pipe.onmessage?.(isbin ? Uint8Array.from(atob(d), c => c.charCodeAt(0)) : d)", [d, isbin])
            A.wait_for_timeout(20)
    A.evaluate(js); B.evaluate(js); pump(800)
    # B следит за A (нажимает «глаз»)
    B.click('.bar.tr .tbtn[data-tip*="Следить"], .bar.tr button:nth-child(4)') if False else B.evaluate("() => { const d = window.__doska; const id = [...d.peersById.keys()][0]; d.S.follow = id; }")
    center = lambda pg, wx, wy: pg.evaluate(f"() => window.__doska.toScreen({wx}, {wy}).map(Math.round)")
    # A пишет у правого края своего экрана (в мире — далеко вправо от центра B)
    A.evaluate("() => { const d = window.__doska; d.S.view = { x: -2000, y: 0, z: 1 }; }")
    A.mouse.move(1100, 300); A.mouse.down()
    for i in range(1, 12):
        A.mouse.move(1100 - i * 8, 300 + i * 4); pump(40)
    A.mouse.up(); pump(700)
    w = A.evaluate("() => window.__doska.toWorld(1100, 300)")
    print('stroke start on B screen:', center(B, w[0], w[1]), '(центр 600,400)')
    # A добавляет большую картинку далеко
    A.evaluate("""() => { const d = window.__doska; const c = document.createElement('canvas'); c.width = 40; c.height = 30; c.getContext('2d').fillRect(0, 0, 40, 30);
      d.act(() => d.addItem({ id: 'img1', type: 'image', page: d.S.page, z: 50, x: 5000, y: 3000, s: 1, w: 2400, h: 1600, src: c.toDataURL() })); }""")
    pump(900)
    r = B.evaluate("() => { const d = window.__doska; const a = d.toScreen(5000, 3000), c = d.toScreen(7400, 4600); return { z: +d.S.view.z.toFixed(3), box: [...a, ...c].map(Math.round) }; }")
    print('image on B screen:', r)
    b.close()
