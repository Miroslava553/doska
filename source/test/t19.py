# Быстрые пунктиры с ускорением на «тяжёлой» доске: замер кадров и задержек главного потока
import sys
from playwright.sync_api import sync_playwright
heavy = int(sys.argv[1]) if len(sys.argv) > 1 else 1500
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1400, 'height': 860})
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Мира'}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=dash-test-%04d' % heavy); pg.wait_for_function('() => window.__doska'); pg.wait_for_timeout(200)
    pg.evaluate('''(N) => { const d = window.__doska; d.act(() => { for (let k = 0; k < N; k++) { const pts = []; for (let i = 0; i < 40; i++) pts.push(i * 30, Math.round(Math.sin(i / 3) * 60), 50);
      d.addItem({ id: 'h' + k, type: 'stroke', page: d.S.page, z: k, x: (k % 40) * 40, y: Math.floor(k / 40) * 25, s: 1, color: '#888', size: 2, kind: 'pen', v: 2, thin: .4, pts }); } }); }''', heavy)
    pg.wait_for_timeout(500); pg.keyboard.press('KeyP'); pg.evaluate('() => { const s = window.__doska.STATS; s.full = s.fullMs = s.append = 0; }')
    r = pg.evaluate('''async () => {
      const c = document.getElementById('cv-over');
      const mk = (t, x, y, b) => new PointerEvent(t, {bubbles: true, cancelable: true, pointerId: 7, pointerType: 'pen', clientX: x, clientY: y, pressure: 0.5, buttons: b, button: t === 'pointermove' ? -1 : 0});
      const frames = []; let last = performance.now(), run = true; const f = (t) => { frames.push(t - last); last = t; if (run) requestAnimationFrame(f); }; requestAnimationFrame(f);
      const upCost = [];
      let x = 100, row = 300;
      for (let k = 0; k < 40; k++) {
        const v = 2 + (k % 20) * 1.2;        // ускорение
        if (x > 1150) { x = 100; row += 45; }
        c.dispatchEvent(mk('pointerdown', x, row, 1));
        for (let i = 0; i < 5; i++) { x += v; c.dispatchEvent(mk('pointermove', x, row + Math.sin(x / 50) * 4, 1)); await new Promise(r => setTimeout(r, 5)); }
        const t0 = performance.now(); c.dispatchEvent(mk('pointerup', x, row, 0)); upCost.push(performance.now() - t0);
        for (let i = 0; i < 3; i++) { x += v; c.dispatchEvent(mk('pointermove', x, row, 0)); await new Promise(r => setTimeout(r, 5)); }
      }
      await new Promise(r => setTimeout(r, 300)); run = false;
      const q = (a, k) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * k)];
      const st = window.__doska.STATS; return { rejoin: st.rejoin || 0, full: st.full, fullMs: st.fullMs, append: st.append, frameMed: q(frames, .5), frameP95: q(frames, .95), frameMax: Math.max(...frames), longFrames: frames.filter(x => x > 25).length, upMed: q(upCost, .5), upMax: Math.max(...upCost), strokes: [...d_items()].length };
      function d_items() { return [...window.__doska.items.values()].filter(i => !/^h\d+$/.test(i.id)); }
    }''')
    print('heavy=%d' % heavy, {k: round(v, 1) for k, v in r.items()})
    b.close()
