from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude-doska/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/show/'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 900, 'height': 600}, device_scale_factor=2)
    ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}))")
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v29r-olee-0090'); pg.wait_for_timeout(2500)
    # перо с сильно меняющимся нажимом: буква Е
    pg.evaluate("""async () => {
      const cv = document.querySelectorAll('canvas')[1]; const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const fire = (type, x, y, pr) => cv.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'pen', isPrimary: true, clientX: x, clientY: y, pressure: pr, buttons: type === 'pointerup' ? 0 : 1, button: 0, bubbles: true, cancelable: true }));
      const stroke = async (pts) => { fire('pointermove', pts[0][0], pts[0][1], 0); await sleep(30); fire('pointerdown', pts[0][0], pts[0][1], 0.9);
        for (let i = 1; i < pts.length; i++) { fire('pointermove', pts[i][0], pts[i][1], pts[i][2]); await sleep(12); }
        fire('pointerup', pts.at(-1)[0], pts.at(-1)[1], 0); await sleep(80); };
      const line = (x0, y0, x1, y1, n = 25) => Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0.95 - 0.8 * Math.sin(Math.PI * t) ** 2]; });
      await stroke([...line(480, 200, 380, 200), ...line(380, 200, 380, 400).slice(1), ...line(380, 400, 480, 400).slice(1)]);
      await stroke(line(380, 300, 450, 300));
    }""")
    pg.wait_for_timeout(300)
    print(pg.evaluate("() => [...window.__doska.items.values()].map(i => [i.type, i.kind, i.thin])"))
    pg.screenshot(path=OUT + 'pen-e.png', clip={'x': 330, 'y': 160, 'width': 220, 'height': 290})
    print(errs); b.close()
