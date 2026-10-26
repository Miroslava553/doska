# История доски: нагрузка — 3000 записей (несколько часов работы), время открытия и перемотки
from playwright.sync_api import sync_playwright
import time
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1300, 'height': 850})
    ctx.add_init_script("""localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));
      localStorage.setItem('doska:account', JSON.stringify({email:'m@e.ru', since:1, pro:{period:'month', started:Date.now(), until:Date.now()+30*864e5, canceled:false, method:'card'}}));""")
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=load-aaaa-bbbb'); pg.wait_for_timeout(2500)
    # рисуем 3000 линий прямо в документ, каждые 1,2 с по линии (время подменяем в записи)
    pg.evaluate("""async () => {
      const D = window.__doska; const Y = D.Y; const d = new Y.Doc(); const rows = [];
      d.on('update', (u) => rows.push(u));
      const pages = d.getMap('pages'), items = d.getMap('items');
      d.transact(() => { const m = new Y.Map(); m.set('name', 'Лист 1'); m.set('order', 1); pages.set('p1', m); });
      for (let i = 0; i < 3000; i++) {
        const x = (i % 60) * 30, y = Math.floor(i / 60) * 40;
        const it = { type: 'stroke', page: 'p1', color: '#1f2328', size: 3, z: i + 1, pts: [x * 10, y * 10, 50, (x + 20) * 10, (y + 25) * 10, 50, (x + 10) * 10, (y + 30) * 10, 50] };
        d.transact(() => { const m = new Y.Map(); for (const [k, v] of Object.entries(it)) m.set(k, v); items.set('L' + i, m); });
        if (i % 7 === 3) d.transact(() => items.delete('L' + (i - 2)));
      }
      const r = indexedDB.open('doska-rec', 1);
      const db = await new Promise((res) => { r.onsuccess = () => res(r.result); });
      const tx = db.transaction('log', 'readwrite'); const s = tx.objectStore('log');
      const t0 = Date.now() - rows.length * 1200 - 3600e3;
      rows.forEach((u, i) => s.add({ room: 'load-cccc-dddd', t: t0 + i * 1200 + (i > 1500 ? 3600e3 : 0), u }));
      await new Promise((r) => { tx.oncomplete = r; });
    }""")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=load-cccc-dddd'); pg.reload(); pg.wait_for_timeout(2500)
    t = time.time()
    pg.click('[data-tip="Меню"]'); pg.wait_for_timeout(100); pg.click('text=История доски')
    pg.wait_for_selector('.hp-note', state='hidden', timeout=60000)
    print('открылось за', round(time.time() - t, 1), 'с; отметок занятий', pg.locator('.hp-ticks span').count())
    box = pg.locator('.hp-range').bounding_box()
    t = time.time()
    for f in [0.1, 0.9, 0.3, 0.6, 0.05]:
        pg.mouse.click(box['x'] + box['width'] * f, box['y'] + box['height'] / 2); pg.wait_for_timeout(50)
    pg.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
    print('5 перемоток за', round(time.time() - t, 2), 'с')
    pg.click('.hp-speed'); pg.click('.hp-speed'); pg.click('.hp-speed'); pg.click('.hp-play'); pg.wait_for_timeout(3000)
    fps = pg.evaluate("() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); })")
    print('кадров в секунду при 8×', fps, pg.inner_text('.hp-time'))
    pg.screenshot(path='/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/hpload.png')
    print(errs); b.close()
