# Воспроизводит запись пера (файл из «Записать перо») с исходными интервалами и сохраняет скриншот
import json, sys
from playwright.sync_api import sync_playwright
rec = json.load(open(sys.argv[1])); out = sys.argv[2] if len(sys.argv) > 2 else 'replay.png'
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1600, 'height': 1000})
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Мира', steady: %s}))" % rec.get('prefs', {}).get('steady', 0.85))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=repl-ayte-st01'); pg.wait_for_function('() => window.__doska')
    pg.keyboard.press('KeyP')
    pg.evaluate('''async (ev) => { const c = document.getElementById('cv-over'); const map = { down: 'pointerdown', move: 'pointermove', up: 'pointerup', cancel: 'pointercancel' };
      let t0 = ev[0].t, w0 = performance.now();
      for (const e of ev) { const type = map[e.type]; if (!type) continue;
        const wait = (e.t - t0) - (performance.now() - w0); if (wait > 1) await new Promise(r => setTimeout(r, wait));
        c.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: e.id, pointerType: e.pt, clientX: e.x, clientY: e.y, pressure: e.p, buttons: e.b, button: e.btn, tiltX: e.tx, tiltY: e.ty })); } }''', rec['ev'])
    pg.wait_for_timeout(200); pg.screenshot(path=out); b.close()
print('ok', out)
