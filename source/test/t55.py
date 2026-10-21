# Репетитор впервые заходит по ссылке: названия листов ученицы не должны теряться
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(); bad = 0
    for run in range(6):
        room = f'v29r-olee-{170 + run:04d}'
        def mk(name, q):
            ctx = b.new_context(viewport={'width': 1200, 'height': 800})
            ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'%s', role:'tutor', roleFirst: 1, roleAt: 0}))" % name)
            pg = ctx.new_page(); pg.on('pageerror', lambda e: print(name, 'ERR', e)); pg.goto(f'file:///home/claude/board/dist/doska.html{q}#r={room}'); return pg
        A = mk('Мира', '?nopeer'); A.wait_for_timeout(2500)
        A.evaluate("""() => { const d = window.__doska; const P = d.doc.getMap('pages');
          d.doc.transact(() => { P.get('p1').set('name', 'Математика'); const m = new d.Y.Map(); m.set('name', 'Физика'); m.set('order', 2); P.set('pfiz', m); });
          d.act(() => { for (let i = 0; i < 4; i++) d.addItem({ id: 'm' + i, type: 'rect', page: 'p1', z: i + 1, x: 100 + i * 60, y: 100, s: 1, w: 40, h: 40, size: 2.7, color: '#e03131' }); }); }""")
        B = mk('Репетитор', ''); B.wait_for_timeout(3500)
        full = lambda src: src.evaluate("() => { const d = window.__doska; const u = d.Y.encodeStateAsUpdate(d.doc); let s = ''; for (const c of u) s += String.fromCharCode(c); return btoa(s); }")
        apply = "(u) => { const d = window.__doska; d.Y.applyUpdate(d.doc, Uint8Array.from(atob(u), c => c.charCodeAt(0)), 'wire'); }"
        ua, ub = full(A), full(B)
        B.evaluate(apply, ua); A.evaluate(apply, ub); B.wait_for_timeout(300)
        info = lambda pg: pg.evaluate("() => { const d = window.__doska; return { on: d.pages().find(p => p.id === d.S.page)?.name, pages: d.pages().map(p => p.name + ':' + d.pageItems(p.id).length).join(' ') }; }")
        ia, ib = info(A), info(B)
        ok = ia['pages'] == 'Математика:4 Физика:0' and ib['pages'] == ia['pages']
        bad += not ok
        print(run, 'A', ia, 'B', ib, 'OK' if ok else 'FAIL')
        A.context.close(); B.context.close()
    print('fails', bad); b.close()
