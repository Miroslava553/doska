from playwright.sync_api import sync_playwright
URL = 'file:///home/claude/board/dist/doska.html?nopeer#r=perf-test-room'
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1400, 'height': 860})
    pg.on('dialog', lambda d: d.accept('X')); pg.goto(URL); pg.wait_for_function('() => window.__doska')
    t = pg.evaluate('''() => { const d = window.__doska; const t0 = performance.now();
      d.act(() => { for (let k = 0; k < 3000; k++) { const pts = []; for (let i = 0; i < 40; i++) pts.push(i*40, Math.round(Math.sin(i/3)*80), 50);
        d.addItem({ id: 's'+k, type: 'stroke', page: d.S.page, z: k, x: (k%60)*90 - 2000, y: Math.floor(k/60)*60 - 1000, s: 1, color: '#1e1e1e', size: 3, kind: 'pen', thin: .4, pts }); } });
      return performance.now() - t0; }''')
    print('insert 3000 strokes ms', round(t))
    pg.wait_for_timeout(500)
    r = pg.evaluate('''async () => { const d = window.__doska; const times = [];
      for (let i = 0; i < 30; i++) { const t0 = performance.now(); d.S.view.x += 7; d.S.view.z *= 0.99;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); times.push(performance.now() - t0); }
      times.sort((a,b)=>a-b); return [times[15], times[28]]; }''')
    print('frame (median, p95) ms incl. 2 rAF', [round(x,1) for x in r])
    # штрих поверх большой доски: задержка на событие
    lat = pg.evaluate('''async () => { const c = document.getElementById('cv-over'); const ts = [];
      const mk = (t, x, y) => new PointerEvent(t, {bubbles:true, cancelable:true, pointerId: 3, pointerType:'pen', clientX:x, clientY:y, pressure:.5, buttons: t==='pointerup'?0:1, button: t==='pointermove'?-1:0});
      window.__doska.setTool('pen'); c.dispatchEvent(mk('pointerdown', 100, 100));
      for (let i = 0; i < 200; i++) { const t0 = performance.now(); c.dispatchEvent(mk('pointermove', 100+i*3, 100+Math.sin(i/9)*40)); ts.push(performance.now()-t0); }
      const t0 = performance.now(); c.dispatchEvent(mk('pointerup', 700, 100)); const up = performance.now()-t0;
      ts.sort((a,b)=>a-b); return [ts[100], ts[190], up]; }''')
    print('pointermove handler ms (median,p95), commit ms', [round(x,2) for x in lat])
    pg.reload(); pg.wait_for_function('() => window.__doska && window.__doska.items.size > 3000', timeout=20000)
    print('reload ok, items', pg.evaluate('() => window.__doska.items.size'))
    b.close()
