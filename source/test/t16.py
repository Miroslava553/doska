from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1400, 'height': 860})
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Мира'}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=perf-pens-ggg7'); pg.wait_for_function('() => window.__doska')
    pg.keyboard.press('KeyP')
    r = pg.evaluate('''async () => { const c = document.getElementById('cv-over');
      const mk = (t, x, y, b) => new PointerEvent(t, {bubbles: true, cancelable: true, pointerId: 6, pointerType: 'pen', clientX: x, clientY: y, pressure: 0.4, buttons: b, button: t === 'pointermove' ? -1 : 0});
      c.dispatchEvent(mk('pointerdown', 100, 400, 1));
      const frames = []; let last = performance.now(); let run = true;
      const f = (t) => { frames.push(t - last); last = t; if (run) requestAnimationFrame(f); }; requestAnimationFrame(f);
      for (let i = 0; i < 3000; i++) { c.dispatchEvent(mk('pointermove', 100 + (i % 600) * 2, 400 + 200 * Math.sin(i / 40) + Math.floor(i / 600) * 20, 1)); if (i % 8 === 0) await new Promise(r => requestAnimationFrame(r)); }
      run = false; c.dispatchEvent(mk('pointerup', 0, 0, 0));
      const t0 = performance.now(); for (let k = 0; k < 10; k++) { window.__doska.S; } 
      frames.sort((a, b) => a - b); return { frames: frames.length, med: frames[frames.length >> 1], p95: frames[Math.floor(frames.length * .95)], max: frames[frames.length - 1] }; }''')
    print('frame ms during a 3000-point live stroke:', {k: round(v, 1) for k, v in r.items()})
    b.close()
