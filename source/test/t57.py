from playwright.sync_api import sync_playwright
URL = 'file:///home/claude/board/dist/doska.html?nopeer#r=v29r-olee-0200'
with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    def mk(name, role):
        ctx = b.new_context(viewport={'width': 1200, 'height': 800})
        ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'%s', role:'%s', roleFirst: 1, roleAt: 0}))" % (name, role))
        ctx.add_init_script("""(() => { const O = window.OscillatorNode; window.__notes = 0; const st = O.prototype.start; O.prototype.start = function (...a) { window.__notes++; return st.apply(this, a); }; })()""")
        pg = ctx.new_page(); pg.on('pageerror', lambda e: print(name, 'ERR', e)); pg.goto(URL); pg.wait_for_timeout(2500); return pg
    A = mk('Иван Петрович', 'tutor'); B = mk('Мира', 'student')
    Q = []
    A.expose_function('__out', lambda d, isbin: Q.append((B, d, isbin)))
    B.expose_function('__out', lambda d, isbin: Q.append((A, d, isbin)))
    js = """() => { const pipe = { send: (d) => { if (typeof d === 'string') window.__out(d, false); else { let s = ''; const u = d instanceof Uint8Array ? d : new Uint8Array(d); for (const c of u) s += String.fromCharCode(c); window.__out(btoa(s), true); } }, close() { this.onclose?.(); }, onmessage: null, onclose: null };
      window.__pipe = pipe; window.__doska.hub.addPipe(pipe, 'peer'); }"""
    def pump(n=40):
        for _ in range(n):
            while Q:
                dst, d, isbin = Q.pop(0)
                dst.evaluate("([d, isbin]) => window.__pipe.onmessage?.(isbin ? Uint8Array.from(atob(d), c => c.charCodeAt(0)) : d)", [d, isbin])
            A.wait_for_timeout(25)
    A.mouse.click(600, 400); B.mouse.click(600, 400)  # нажатие — браузер разрешает звук
    A.evaluate(js); B.evaluate(js); pump()
    toasts = lambda pg: pg.evaluate("() => [...document.querySelectorAll('.toast')].map(t => t.textContent)")
    print('tutor sees:', toasts(A), 'notes', A.evaluate('() => window.__notes'))
    print('student sees:', toasts(B), 'notes', B.evaluate('() => window.__notes'))
    b.close()
