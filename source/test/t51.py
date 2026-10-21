import sys
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
Z = float(sys.argv[1]) if len(sys.argv) > 1 else 12
KIND = sys.argv[2] if len(sys.argv) > 2 else 'mouse'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1600, 'height': 900}, device_scale_factor=1.5)
    ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0, barPos: 'left'}))")
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v29r-olee-0110'); pg.wait_for_timeout(2500)
    pg.evaluate(f"() => {{ const d = window.__doska; d.S.view.z = {Z}; d.S.view.x = 0; d.S.view.y = 0; }}")
    res = pg.evaluate("""async (kind) => {
      const cv = document.querySelectorAll('canvas')[1]; const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const fire = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, { pointerId: 9, pointerType: kind, isPrimary: true, clientX: x, clientY: y, pressure: type === 'pointerup' ? 0 : 0.5, buttons: type === 'pointerup' ? 0 : 1, button: 0, bubbles: true, cancelable: true }));
      const frames = []; let run = true; const tick = (t) => { frames.push(t); if (run) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
      const handlerTimes = [];
      for (let c = 0; c < 4; c++) {
        const cx = 500 + c * 220, cy = 450, R = 40, N = 60;
        fire('pointerdown', cx + R, cy);
        for (let i = 1; i <= N; i++) { const a = 2 * Math.PI * i / N; const t0 = performance.now(); fire('pointermove', cx + R * Math.cos(a), cy + R * Math.sin(a)); handlerTimes.push(performance.now() - t0); await sleep(8); }
        fire('pointerup', cx + R, cy); await sleep(60);
      }
      run = false; await sleep(30);
      const gaps = []; for (let i = 1; i < frames.length; i++) gaps.push(frames[i] - frames[i - 1]);
      gaps.sort((a, b) => b - a); handlerTimes.sort((a, b) => b - a);
      return { frames: frames.length, worstGaps: gaps.slice(0, 5).map(x => +x.toFixed(1)), worstHandler: handlerTimes.slice(0, 5).map(x => +x.toFixed(1)), medHandler: +handlerTimes[Math.floor(handlerTimes.length / 2)].toFixed(2) };
    }""", KIND)
    print('zoom', Z, res)
    pg.screenshot(path=OUT + f'circles-z{int(Z)}-{KIND}.png', clip={'x': 400, 'y': 330, 'width': 900, 'height': 240})
    print(errs); b.close()
