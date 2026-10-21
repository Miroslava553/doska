# Два человека на одной доске: ученица (A) и репетитор (B), листы «Математика» и «Физика».
import base64
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
URL = 'file:///home/claude/board/dist/doska.html?nopeer#r=v29r-olee-0150'
with sync_playwright() as p:
    b = p.chromium.launch()
    def mk(name):
        ctx = b.new_context(viewport={'width': 1200, 'height': 800})
        ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'%s', role:'tutor', roleFirst: 1, roleAt: 0}))" % name)
        pg = ctx.new_page(); pg.on('pageerror', lambda e: print(name, 'ERR', e)); pg.goto(URL); pg.wait_for_timeout(2500); return pg
    A = mk('Мира')
    # A: «Математика» (p1) и «Физика», на обоих листах записи
    A.evaluate("""() => { const d = window.__doska; const P = d.doc.getMap('pages');
      d.doc.transact(() => { P.get(d.pages()[0].id).set('name', 'Математика'); const m = new d.Y.Map(); m.set('name', 'Физика'); m.set('order', 2); P.set('pfiz', m); });
      const pm = d.pages()[0].id;
      d.act(() => { for (let i = 0; i < 5; i++) d.addItem({ id: 'm' + i, type: 'rect', page: pm, z: i + 1, x: 100 + i * 60, y: 100, s: 1, w: 40, h: 40, size: 2.7, color: '#e03131' }); });
      d.act(() => { for (let i = 0; i < 3; i++) d.addItem({ id: 'f' + i, type: 'ellipse', page: 'pfiz', z: i + 1, x: 100 + i * 60, y: 200, s: 1, w: 40, h: 40, size: 2.7, color: '#1971c2' }); });
    }""")
    B = mk('Репетитор')
    # связь через «провод»: обновления в обе стороны
    def wire(src, dst, tag):
        src.expose_function(f'__send_{tag}', lambda u: dst.evaluate("(u) => { const d = window.__doska; const a = Uint8Array.from(atob(u), c => c.charCodeAt(0)); d.Y.applyUpdate(d.doc, a, 'wire'); }", u))
        src.evaluate(f"""() => {{ const d = window.__doska; d.doc.on('update', (u, origin) => {{ if (origin === 'wire') return; let s = ''; for (const c of u) s += String.fromCharCode(c); window.__send_{tag}(btoa(s)); }}); }}""")
    wire(A, B, 'ab'); wire(B, A, 'ba')
    full = lambda src: src.evaluate("() => { const d = window.__doska; const u = d.Y.encodeStateAsUpdate(d.doc); let s = ''; for (const c of u) s += String.fromCharCode(c); return btoa(s); }")
    B.evaluate("(u) => { const d = window.__doska; d.Y.applyUpdate(d.doc, Uint8Array.from(atob(u), c => c.charCodeAt(0)), 'wire'); }", full(A))
    A.evaluate("(u) => { const d = window.__doska; d.Y.applyUpdate(d.doc, Uint8Array.from(atob(u), c => c.charCodeAt(0)), 'wire'); }", full(B))
    B.wait_for_timeout(300)
    info = lambda pg: pg.evaluate("() => { const d = window.__doska; return { page: d.pages().find(p => p.id === d.S.page)?.name, pages: d.pages().map(p => p.name + ':' + d.pageItems(p.id).length) }; }")
    print('A', info(A)); print('B', info(B))
    # B переходит на «Физика», потом на «Математика» — кликом по вкладкам
    B.click('.pages >> text=Физика'); B.wait_for_timeout(200); print('B on fiz', info(B))
    B.locator('.pages > *').first.click(); B.wait_for_timeout(300); print('B on math', info(B))
    B.screenshot(path=OUT + 'B-math.png')
    print('B view', B.evaluate("() => window.__doska.S.view"), 'A view', A.evaluate("() => window.__doska.S.view"))
    # перезагрузка B
    B.reload(); B.wait_for_timeout(2500); print('B after reload', info(B))
    print('pages map keys A', A.evaluate("() => [...window.__doska.doc.getMap('pages').keys()]"), 'B', B.evaluate("() => [...window.__doska.doc.getMap('pages').keys()]"))
    b.close()
