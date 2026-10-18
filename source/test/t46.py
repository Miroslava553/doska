from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude-doska/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/show/'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1300, 'height': 850})
    ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}))")
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v29r-olee-0046'); pg.wait_for_timeout(2500)
    def drag(a, c, steps=10):
        pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move(*c, steps=steps); pg.mouse.up(); pg.wait_for_timeout(150)
    last = lambda: pg.evaluate("() => { const a = [...window.__doska.items.values()]; const it = a[a.length - 1]; const {pts, ...r} = it; return r; }")
    corner = lambda: pg.evaluate("() => window.__doska.handles()[2]")
    for kind, x in [('eqtriangle', 150), ('triangle', 450), ('parallelogram', 750), ('rect', 1000)]:
        pg.keyboard.press('Escape')
        t = ('fig:' + kind) if kind != 'rect' else kind
        pg.evaluate(f'() => window.__doska.setTool("{t}")'); drag((x, 150), (x + 30, 176))
        a = last(); print(kind, 'small:', {k: a.get(k) for k in ('s', 'size', 'w', 'h')})
        c = corner(); drag((c[0], c[1]), (c[0] + 200, c[1] + 200), 25)
        a = last(); print('   big:', {k: a.get(k) for k in ('s', 'size', 'w', 'h')})
    # старая фигура с масштабом s (как на сайте сейчас): после растягивания толщина = видимая, s = 1
    pg.keyboard.press('Escape')
    pg.evaluate("() => window.__doska.act(() => window.__doska.addItem({ id: 'old1', type: 'fig', kind: 'triangle', page: window.__doska.S.page, z: 999, x: -300, y: 300, s: 4, w: 30, h: 26, size: 2.7, color: '#1e1e1e' }))")
    pg.evaluate("() => { window.__doska.S.sel.clear(); window.__doska.S.sel.add('old1'); }"); pg.keyboard.press('v'); pg.wait_for_timeout(100)
    pg.evaluate("() => { const S = window.__doska.S; S.sel.clear(); S.sel.add('old1'); }"); pg.mouse.move(5, 5); pg.wait_for_timeout(200)
    c = corner(); drag((c[0], c[1]), (c[0] + 60, c[1] + 60), 20)
    it = pg.evaluate("() => { const {pts, ...r} = window.__doska.items.get('old1'); return r; }"); print('legacy s=4:', {k: it.get(k) for k in ('s', 'size', 'w', 'h')})
    pg.screenshot(path=OUT + 'width-fix.png')
    print(errs); b.close()
