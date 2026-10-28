# Ученик на большой доске (2000 линий): ластик и наведение мыши не подвешивают страницу
from playwright.sync_api import sync_playwright
import time
with sync_playwright() as p:
    b = p.chromium.launch()
    for role in ('student', 'tutor'):
        pg = b.new_page(viewport={'width': 1300, 'height': 800}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'%s', roleFirst: 1, roleAt: 0, eraserPrecise: true}));" % role)
        pg.goto('file:///home/claude/board/dist/site/index.html?nopeer#r=big%s-aaaa-bbbb' % role[0]); pg.wait_for_timeout(1500)
        pg.evaluate("""() => { const D = window.__doska; const pid = D.S.page; const v = D.S.view; v.x = 0; v.y = 0; v.z = 1;
          D.doc.transact(() => { for (let i = 0; i < 2000; i++) { const ox = (i % 50) * 25, oy = Math.floor(i / 50) * 18; const pts = [];
            for (let j = 0; j < 30; j++) pts.push(Math.round((ox + j * 0.7) * 10), Math.round((oy + Math.sin(j / 3) * 5) * 10), 50);
            D.addItem({ id: 's' + i, type: 'stroke', page: pid, z: i + 1, x: 0, y: 0, s: 1, color: '#1f2328', size: 2, kind: 'pen', v: 2, thin: 0, pts }); } }, 'noundo'); }""")
        pg.wait_for_timeout(800)
        pg.keyboard.press('e'); t = time.time(); pg.mouse.move(100, 100); pg.mouse.down()
        for i in range(60): pg.mouse.move(100 + i * 15, 100 + (i * 9) % 600)
        pg.mouse.up(); pg.evaluate("() => new Promise(r => requestAnimationFrame(r))")
        dt = time.time() - t
        pg.keyboard.press('v'); t = time.time()
        for i in range(40): pg.mouse.move(100 + i * 20, 300 + (i % 5) * 20)
        pg.evaluate("() => new Promise(r => requestAnimationFrame(r))")
        print(role, 'ластик 60 движений', round(dt, 2), 'с; наведение 40 движений', round(time.time() - t, 2), 'с; объектов', pg.evaluate("() => window.__doska.items.size"), errs)
        pg.close()
    b.close()
