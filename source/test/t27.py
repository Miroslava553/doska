# v19: у собеседника не остаются «хвосты» живых линий; перо у края не двигает доску; панель сверху/снизу/справа
from playwright.sync_api import sync_playwright
import math
OUT = '/tmp/claude-0/-home-claude-doska/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
URL = 'file:///home/claude/board/dist/doska.html?nopeer#r=tail-test-0001'
OVER = '''() => { const c = document.getElementById('cv-over'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; }'''
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1200, 'height': 760})
    ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Тест'}))")
    errs = []
    a = ctx.new_page(); a.on('pageerror', lambda e: errs.append(str(e))); a.goto(URL); a.wait_for_function('() => window.__doska')
    c = ctx.new_page(); c.on('pageerror', lambda e: errs.append(str(e))); c.goto(URL); c.wait_for_function('() => window.__doska')
    a.wait_for_timeout(800); a.bring_to_front(); a.keyboard.press('KeyP')
    # быстрые короткие штрихи: отпускание в том же кадре, что последние точки
    a.evaluate('''() => { const cv = document.getElementById('cv-over'); let k = 0;
      const mk = (t, x, y, b) => new PointerEvent(t, {bubbles: true, cancelable: true, pointerId: 5, pointerType: 'pen', clientX: x, clientY: y, pressure: b ? .5 : 0, buttons: b, button: t === 'pointermove' ? -1 : 0});
      for (let s = 0; s < 40; s++) { const x = 100 + (s % 10) * 90, y = 200 + Math.floor(s / 10) * 80;
        cv.dispatchEvent(mk('pointerdown', x, y, 1)); for (let i = 1; i < 12; i++) cv.dispatchEvent(mk('pointermove', x + i * 3, y + Math.sin(i) * 4, 1)); cv.dispatchEvent(mk('pointerup', x + 36, y, 0)); } }''')
    a.wait_for_timeout(1500)
    print('items: A', a.evaluate('() => window.__doska.items.size'), 'B', c.evaluate('() => window.__doska.items.size'))
    # стираем всё у A — у B на наложении не должно остаться ни точки
    a.evaluate('() => { const d = window.__doska; d.act(() => { for (const id of [...d.items.keys()]) d.doc.getMap("items").delete(id); }); }')
    c.wait_for_timeout(800); c.evaluate('() => {}')
    print('B overlay pixels after erase (0 = no stuck tails):', c.evaluate(OVER), '| B items', c.evaluate('() => window.__doska.items.size'))
    # перо у края: доска стоит
    a.bring_to_front()
    v0 = a.evaluate('() => ({...window.__doska.S.view})')
    a.evaluate('''() => { const cv = document.getElementById('cv-over'); for (let i = 0; i < 30; i++) cv.dispatchEvent(new PointerEvent('pointermove', {bubbles: true, pointerId: 5, pointerType: 'pen', clientX: 1198, clientY: 400, buttons: 0})); }''')
    a.wait_for_timeout(700); v1 = a.evaluate('() => ({...window.__doska.S.view})'); print('pen at edge moved view:', round(v1['x'] - v0['x']))
    # положения панели
    for pos in ['bottom', 'right', 'top']:
        a.click('.tl .tbtn >> nth=0'); a.wait_for_timeout(150)
        a.click({'bottom': 'text=Снизу', 'right': 'text=Справа', 'top': 'text=Сверху'}[pos]); a.wait_for_timeout(200)
        tb = a.locator('.toolbar').bounding_box()
        g = a.locator('.toolbar .tbtn.grp').first; g.hover(); a.wait_for_timeout(250)
        pb = a.locator('.pop').bounding_box() if a.locator('.pop').count() else None
        gb = g.bounding_box()
        side = None if not pb else ('below' if pb['y'] >= gb['y'] + gb['height'] else 'above' if pb['y'] + pb['height'] <= gb['y'] else 'left' if pb['x'] + pb['width'] <= gb['x'] else 'overlap')
        a.screenshot(path=OUT + f'bar-{pos}.png')
        print(pos, 'toolbar', {k: round(v) for k, v in tb.items()}, '| menu opens', side)
        a.mouse.move(600, 400); a.wait_for_timeout(100)
    print('errors', errs); b.close()
