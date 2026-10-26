# Крайние случаи разметки: 30 листов с длинными именами, длинное название, 40 меток Д/З, 30 папок, 40 досок на главном
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/edge/'
import os; os.makedirs(OUT, exist_ok=True)
for vp in [(1366, 820), (390, 780)]:
  with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': vp[0], 'height': vp[1]}, has_touch=vp[0] < 600, is_mobile=vp[0] < 600)
    ctx.add_init_script("""localStorage.setItem('doska:prefs', JSON.stringify({name:'ШШШШШШШШШШШШШШШШШШШШШШШШШШШШШШ', role:'tutor', roleFirst: 1, roleAt: 0}));
      localStorage.setItem('doska:account', JSON.stringify({email:'очень.длинный.адрес.почты.для.проверки@example-very-long-domain.ru', since:1, pro:{period:'month', started:Date.now(), until:Date.now()+30*864e5, canceled:false, method:'card'}}));""")
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=edge-aaaa-bbbb'); pg.wait_for_timeout(1500)
    pg.evaluate("""() => { const D = window.__doska; const Y = D.Y; const yP = D.doc.getMap('pages'), yM = D.doc.getMap('meta');
      D.doc.transact(() => { for (let i = 0; i < 30; i++) { const m = new Y.Map(); m.set('name', 'ШШШШШШШШШШШШШШШШШШШШШШШШШШШШШ' + i); m.set('order', 10 + i); yP.set('px' + i, m); } yM.set('title', 'Ж'.repeat(60)); });
      const p0 = D.pages()[0].id;
      D.act(() => { for (let i = 0; i < 40; i++) D.addItem({ id: 'hw' + i, type: 'hw', page: p0, z: 100 + i, x: 100 + (i % 8) * 60, y: 100 + Math.floor(i / 8) * 80, s: 1, sz: 48, op: 1, name: 'ЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖ'.slice(0, 40), n: i + 1 }); });
    }""")
    pg.wait_for_timeout(600); pg.screenshot(path=OUT + f'board-{vp[0]}.png')
    over = pg.evaluate("() => [...document.querySelectorAll('.bar, .hw-box, .hw-list, .pages, .title-btn')].map(e => { const r = e.getBoundingClientRect(); return (r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1) ? e.className + ' ' + [r.left, r.right, r.bottom].map(Math.round) : ''; }).filter(Boolean)")
    print(vp, 'за краем на доске:', over)
    # главный экран: много досок и папок
    pg.evaluate("""() => { const rec = []; for (let i = 0; i < 40; i++) rec.push({ room: 'r' + i + '-aaaa-bbbb', t: Date.now() - i * 864e5, title: i % 3 ? 'Длинное название доски для проверки разметки ' + i : '' }); localStorage.setItem('doska:recent', JSON.stringify(rec));
      const f = []; for (let i = 0; i < 30; i++) f.push({ id: 'f' + i, name: 'ЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖЖ'.slice(0, 30) }); localStorage.setItem('doska:bfolders', JSON.stringify(f)); }""")
    pg.goto('file:///home/claude/board/dist/doska.html'); pg.wait_for_timeout(1500)
    pg.screenshot(path=OUT + f'home-{vp[0]}.png', full_page=True)
    sw = pg.evaluate("() => [document.documentElement.scrollWidth, innerWidth]")
    print(vp, 'ширина главной', sw)
    print(errs); b.close()
