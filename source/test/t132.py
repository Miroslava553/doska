# Связь через наш сервер: когда прямое соединение невозможно (WebRTC не работает), репетитор и ученик всё равно видят друг друга
# Запуск: сначала node server/test/e2e-server.js (сайт на 4021)
from playwright.sync_api import sync_playwright
import time, json, urllib.request
BASE = 'http://127.0.0.1:4021/'
res = []
def r(n, v): res.append((n, v)); print(('✓ ' if v else '✗ ') + n, flush=True)
NO_RTC = "window.RTCPeerConnection = function () { throw new Error('нет прямой связи'); }; window.webkitRTCPeerConnection = window.RTCPeerConnection;"
def prefs(name, role): return "localStorage.setItem('doska:prefs', JSON.stringify({name:'%s', role:'%s', roleFirst: 1, roleAt: 0})); localStorage.setItem('doska:seenTour','1');" % (name, role)
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    def person(name, role, room, rtc=False):
        c = b.new_context(viewport={'width': 1200, 'height': 800})
        c.add_init_script(prefs(name, role) + ('' if rtc else NO_RTC))
        pg = c.new_page(); pg.on('pageerror', lambda e: errs.append(name + ': ' + str(e)[:200]))
        pg.goto(BASE + '#r=' + room); pg.wait_for_timeout(500)
        return pg
    def wait(pg, js, t=12):
        end = time.time() + t
        while time.time() < end:
            if pg.evaluate(js): return True
            pg.wait_for_timeout(200)
        return False
    peers = "() => window.__doska && window.__doska.hub.status().peers.length"
    via = "() => (window.__doska.hub.status().peers[0] || {}).via || []"
    add = "([id, x]) => { const D = window.__doska; D.act(() => D.addItem({ id, type: 'rect', page: D.S.page, z: 9e8, x, y: 120, s: 1, w: 80, h: 60, color: '#e03131', size: 4 })); }"
    has = lambda id: "() => window.__doska.items.has('%s')" % id

    room = 'rl%02d-test-room' % (int(time.time()) % 100)
    t0 = time.time()
    A = person('Мира', 'tutor', room); B = person('Ученик', 'student', room)
    ok = wait(A, peers + " === 1 ? true : false") and wait(B, peers + " === 1 ? true : false")
    r('без прямой связи репетитор и ученик соединились через сервер за %.1f с' % (time.time() - t0), ok)
    r('связь идёт через сервер Lodl (%s)' % A.evaluate(via), 'relay' in A.evaluate(via))
    r('у ученика на значке связи «Подключено»', 'Подключено' in B.locator('.status').inner_text())
    A.wait_for_timeout(1500)
    A.evaluate(add, ['A1', 100])
    r('рисунок репетитора появился у ученика', wait(B, has('A1')))
    B.evaluate(add, ['B1', 300])
    r('рисунок ученика появился у репетитора', wait(A, has('B1')))
    # курсор и штрих в процессе (быстрые сообщения)
    B.evaluate("() => { window.__cur = 0; window.__doska.hub.on('ephemeral', (o) => { if (o.t === 'live') window.__cur++; }); }")
    A.evaluate("() => window.__doska.setTool('pen')")
    A.mouse.move(600, 400); A.mouse.down(); A.mouse.move(640, 420, steps=10); A.mouse.move(700, 460, steps=10)
    r('ученик видит линию репетитора, пока тот ещё рисует', wait(B, "() => window.__cur > 0", 6))
    A.mouse.up()
    # большой кусок: картинка ~1,5 МБ одним объектом
    A.evaluate("""() => { const D = window.__doska; const big = 'data:image/png;base64,' + 'A'.repeat(1500000);
      D.act(() => D.addItem({ id: 'BIG', type: 'rect', page: D.S.page, z: 9e8, x: 500, y: 300, s: 1, w: 10, h: 10, color: '#000', size: 2, note: big })); }""")
    r('большой объект (1,5 МБ) дошёл целиком', wait(B, "() => (window.__doska.items.get('BIG') || {}).note?.length === 1500022", 20))
    # третий участник
    C = person('Наблюдатель', 'student', room)
    r('третий участник подключился и получил всю доску', wait(C, has('A1')) and wait(C, has('B1')) and wait(C, peers + " === 2"))
    r('у репетитора теперь двое', wait(A, peers + " === 2"))
    C.context.close()
    r('третий ушёл — у репетитора снова один', wait(A, peers + " === 1", 15))
    # чужая доска ничего не получает
    D = person('Чужой', 'student', room.replace('room', 'zzzz'))
    D.wait_for_timeout(2500)
    r('участник другой доски не видит этих участников и рисунков', D.evaluate(peers) == 0 and not D.evaluate(has('A1')))
    D.context.close()
    # обрыв связи: закрываем канал к серверу у ученика — он сам переподключается и догоняет то, что пропустил
    B.evaluate("() => window.__doska.hub.relay.ws.close()")
    A.evaluate(add, ['A2', 200])
    r('после обрыва ученик сам переподключился и получил пропущенное', wait(B, has('A2'), 20))
    # ученик закрыл вкладку и открыл снова
    B.reload(); B.wait_for_timeout(500)
    r('после перезагрузки ученик снова на связи', wait(B, peers + " === 1", 15) and wait(A, peers + " === 1", 15))
    # оба с прямой связью: два пути одновременно не путают доску
    room2 = room.replace('room', 'both')
    P = person('Мира', 'tutor', room2, rtc=True); Q = person('Ученик', 'student', room2, rtc=True)
    r('с прямой связью тоже соединяются', wait(P, peers + " === 1", 20))
    P.evaluate(add, ['P1', 100]); Q.wait_for_timeout(1500)
    r('объект пришёл ровно один раз, участник в списке один', wait(Q, has('P1')) and Q.evaluate("() => window.__doska.hub.status().peers.length") == 1 and Q.evaluate("() => window.__doska.items.size") == P.evaluate("() => window.__doska.items.size"))
    print('пути:', P.evaluate(via))
    print(errs)
    print('ИТОГ %d из %d' % (sum(v for _, v in res), len(res)))
    b.close()
