# Два независимых браузера + ручное WebRTC-подключение (без серверов)
from playwright.sync_api import sync_playwright
import base64, os
URL = 'file:///home/claude/board/dist/doska.html?nopeer#r=rtc0-test-room'
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
errors = []
def count(pg): return pg.evaluate('() => window.__doska.items.size')
with sync_playwright() as p:
    b = p.chromium.launch()
    cA = b.new_context(viewport={'width': 1200, 'height': 760}); cA.add_init_script("if (!localStorage.getItem('doska:prefs')) localStorage.setItem('doska:prefs', JSON.stringify({name: 'Мира'}))")
    cB = b.new_context(viewport={'width': 1000, 'height': 700}); cB.add_init_script("if (!localStorage.getItem('doska:prefs')) localStorage.setItem('doska:prefs', JSON.stringify({name: 'Учитель'}))")
    A = cA.new_page(); B = cB.new_page()
    for pg, nm in ((A, 'Мира'), (B, 'Учитель')):
        pg.on('dialog', lambda d, nm=nm: d.accept(nm))
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
        pg.goto(URL); pg.wait_for_function('() => window.__doska'); pg.wait_for_timeout(300)
    # A рисует до подключения (офлайн)
    A.keyboard.press('KeyR'); A.mouse.move(300, 300); A.mouse.down(); A.mouse.move(500, 420, steps=4); A.mouse.up()
    B.keyboard.press('KeyO'); B.mouse.move(300, 300); B.mouse.down(); B.mouse.move(450, 400, steps=4); B.mouse.up()
    print('before connect', count(A), count(B))
    # ручной обмен кодами
    offer = A.evaluate('''async () => { const { hub } = window.__doska; const mc = new window.__MC(hub); window.__mc = mc; return await mc.createOffer(); }''')
    answer = B.evaluate('''async (o) => { const { hub } = window.__doska; const mc = new window.__MC(hub); window.__mc = mc; return await mc.acceptOffer(o); }''', offer)
    A.evaluate('async (a) => window.__mc.acceptAnswer(a)', answer)
    A.wait_for_function('() => window.__doska.hub.status().peers.length > 0', timeout=15000)
    A.wait_for_timeout(500)
    print('after connect', count(A), count(B), 'A sees', A.evaluate('() => window.__doska.hub.status().peers.map(p=>p.name)'))
    # большая картинка (> чанка) — должна пройти кусками
    big = B.evaluate('''() => { const c = document.createElement('canvas'); c.width = 1200; c.height = 900; const x = c.getContext('2d');
      for (let i = 0; i < 4000; i++) { x.fillStyle = `hsl(${i*7%360},70%,50%)`; x.fillRect(Math.random()*1200, Math.random()*900, 20, 20); }
      const src = c.toDataURL('image/png'); const d = window.__doska;
      d.act(() => d.addItem({ id: 'bigimg', type: 'image', page: d.S.page, z: 99, x: 600, y: 100, s: 1, w: 400, h: 300, src }));
      return src.length; }''')
    A.wait_for_function('() => window.__doska.items.has("bigimg")', timeout=15000)
    print('big image bytes', big, 'arrived at A')
    # живой штрих учителя виден у ученицы во время рисования
    B.keyboard.press('KeyP'); B.mouse.move(200, 500); B.mouse.down()
    for i in range(20): B.mouse.move(200 + i * 10, 500 + (i % 5) * 6)
    A.wait_for_timeout(300)
    live = A.evaluate('() => document.getElementById("cv-over") && true')
    A.screenshot(path=OUT + 't3-live.png')
    B.mouse.up(); A.wait_for_timeout(300)
    print('after teacher stroke', count(A), count(B))
    # смотреть за собеседником
    B.mouse.move(500, 300); B.mouse.wheel(0, -500); B.wait_for_timeout(400)
    A.keyboard.press('Shift+KeyF'); A.wait_for_timeout(500)
    print('follow on:', A.evaluate('() => window.__doska.S.follow'), 'zoom A', A.evaluate('() => window.__doska.S.view.z.toFixed(2)'), 'zoom B', B.evaluate('() => window.__doska.S.view.z.toFixed(2)'))
    A.screenshot(path=OUT + 't3-A.png'); B.screenshot(path=OUT + 't3-B.png')
    # разрыв и восстановление: B закрывает вкладку, A рисует, B возвращается и подключается заново
    b.close()
print('ERRORS', errors)
