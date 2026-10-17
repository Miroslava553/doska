# связь: молчащий канал закрывается через ~6 с; старый собеседник (без «я тут») не трогается
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Тест'}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v28n-etwk-0001'); pg.wait_for_function('() => window.__doska')
    pg.evaluate("""() => {
      const hub = window.__doska.hub; window.__t = { sent: 0 };
      const mk = (name) => { const pipe = { send: (d) => { if (String(d).includes('ping')) window.__t.sent++; }, close: () => { window.__t[name + 'Closed'] = Date.now(); }, onmessage: null, onclose: null }; const l = hub.addPipe(pipe, 'peer'); return { pipe, l }; };
      window.__t.newer = mk('newer'); window.__t.old = mk('old'); window.__t.t0 = Date.now();
      // новый собеседник 3 с отвечает «я тут», потом замолкает
      let n = 0; const iv = setInterval(() => { if (++n > 6) { clearInterval(iv); window.__t.silentAt = Date.now(); return; } window.__t.newer.pipe.onmessage(JSON.stringify({ t: 'ping' })); }, 500);
    }""")
    pg.wait_for_timeout(12000)
    r = pg.evaluate("() => ({ sentPings: window.__t.sent, newerAlive: window.__t.newer.l.alive, closedAfterSilence: window.__t.newerClosed ? Math.round((window.__t.newerClosed - window.__t.silentAt) / 100) / 10 : null, oldAlive: window.__t.old.l.alive })")
    print(r); print('errors', errs); b.close()
