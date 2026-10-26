# Вандалы вдвоём: репетитор и ученик одновременно делают случайные действия на одной доске по сети.
# В конце обе доски должны совпасть полностью. Запуск: python3 test/fuzz2.py <seed> <steps>
import sys, random, json
from playwright.sync_api import sync_playwright
SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 1
STEPS = int(sys.argv[2]) if len(sys.argv) > 2 else 300
R = random.Random(SEED)
URL = f'file:///home/claude/board/dist/doska.html?nopeer#r=dv{SEED:02d}-pair-room'
KEYS = ['v', 'p', 'e', 'r', 'o', 'l', 'a', 't', 'Escape', 'Delete', 'Control+z', 'Control+z', 'Control+y', 'Control+a', 'Control+d', 'Shift+N', 'PageDown', 'PageUp', 'Control+c', 'Control+v']
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pages = []
    for role in ('tutor', 'student'):
        c = b.new_context(viewport={'width': 1200, 'height': 780})
        c.add_init_script("""localStorage.setItem('doska:prefs', JSON.stringify({name:'%s', role:'%s', roleFirst: 1, roleAt: 0}));
          localStorage.setItem('doska:account', JSON.stringify({email:'%s@e.ru', since:1, pro:{period:'month', started:Date.now(), until:Date.now()+30*864e5, canceled:false, method:'card'}}));""" % (role, role, role))
        pg = c.new_page(); pg.on('pageerror', lambda e, r=role: errs.append(r + ': ' + str(e)[:200])); pg.on('dialog', lambda d: d.accept())
        pg.goto(URL); pg.wait_for_function('() => window.__doska'); pg.wait_for_timeout(1200); pages.append(pg)
    A, B = pages
    def connect():
        offer = A.evaluate('''async () => { const { hub } = window.__doska; const mc = new window.__MC(hub); window.__mc = mc; return await mc.createOffer(); }''')
        answer = B.evaluate('''async (o) => { const { hub } = window.__doska; const mc = new window.__MC(hub); window.__mc = mc; return await mc.acceptOffer(o); }''', offer)
        A.evaluate('async (a) => window.__mc.acceptAnswer(a)', answer)
        A.wait_for_function('() => window.__doska.hub.status().peers.length > 0', timeout=20000)
    connect(); A.wait_for_timeout(500)
    for step in range(STEPS):
        pg = R.choice(pages); a = R.random()
        try:
            if a < 0.45:
                x0, y0 = R.uniform(40, 1150), R.uniform(130, 740); pg.mouse.move(x0, y0); pg.mouse.down(); pg.mouse.move(x0 + R.uniform(-250, 250), y0 + R.uniform(-200, 200), steps=R.randint(3, 12)); pg.mouse.up()
            elif a < 0.8: pg.keyboard.press(R.choice(KEYS))
            elif a < 0.88: pg.keyboard.type(R.choice(['x+1', 'Ответ', '2']))
            elif a < 0.95: pg.mouse.click(R.uniform(40, 1150), R.uniform(130, 740))
            else: pg.keyboard.press('Escape'); pg.keyboard.press('Escape')
        except Exception as e: errs.append('исключение ' + str(e)[:120])
    for pg in pages: pg.keyboard.press('Escape'); pg.keyboard.press('Escape')
    A.wait_for_timeout(3000)
    snap = """() => { const D = window.__doska; const it = {}; for (const [k, m] of D.doc.getMap('items').entries()) it[k] = JSON.stringify(m.toJSON());
      const pg = {}; for (const [k, m] of D.doc.getMap('pages').entries()) pg[k] = JSON.stringify(m.toJSON()); return { it, pg, cache: D.items.size }; }"""
    sa, sb = A.evaluate(snap), B.evaluate(snap)
    diff_items = [k for k in set(sa['it']) | set(sb['it']) if sa['it'].get(k) != sb['it'].get(k)]
    diff_pages = [k for k in set(sa['pg']) | set(sb['pg']) if sa['pg'].get(k) != sb['pg'].get(k)]
    print(json.dumps({'seed': SEED, 'объектов': [len(sa['it']), len(sb['it'])], 'кэш': [sa['cache'], sb['cache']], 'листов': [len(sa['pg']), len(sb['pg'])],
                      'расхождений': len(diff_items) + len(diff_pages), 'ошибки': errs[:10], 'связь': A.evaluate("() => window.__doska.hub.status().peers.length")}, ensure_ascii=False))
    b.close()
