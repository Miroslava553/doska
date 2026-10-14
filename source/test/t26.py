# v19: удержание пера → выделение; после фигуры → ручка; курсор собеседника скрыт; пирамида; ползунок угла
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude-doska/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
def pen(pg, pts, hold_ms=0, wait_ms=6):
    pg.evaluate('''async ([pts, hold, wait]) => { const c = document.getElementById('cv-over');
      const mk = (t, [x, y], b) => new PointerEvent(t, {bubbles: true, cancelable: true, pointerId: 5, pointerType: 'pen', clientX: x, clientY: y, pressure: b ? 0.5 : 0, buttons: b, button: t === 'pointermove' ? -1 : 0});
      c.dispatchEvent(mk('pointerdown', pts[0], 1));
      if (hold) { await new Promise(r => setTimeout(r, hold)); }
      for (const q of pts.slice(1)) { c.dispatchEvent(mk('pointermove', q, 1)); await new Promise(r => setTimeout(r, wait)); }
      c.dispatchEvent(mk('pointerup', pts[pts.length - 1], 0)); }''', [pts, hold_ms, wait_ms])
    pg.wait_for_timeout(60)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1200, 'height': 760})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Мира'}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v19t-ests-tst1'); pg.wait_for_function('() => window.__doska')
    st = lambda: pg.evaluate('() => [window.__doska.S.tool, window.__doska.S.sel.size]')
    n = lambda: pg.evaluate('() => window.__doska.items.size')
    pg.keyboard.press('KeyP')
    pen(pg, [[300 + i * 4, 300 + (i % 7)] for i in range(40)])          # штрих
    pos0 = pg.evaluate('() => { const it = [...window.__doska.items.values()][0]; return [it.x, it.y]; }')
    k = n()
    # удержание на штрихе 700 мс, затем перенос на 100 px вправо
    pen(pg, [[360, 302]] + [[360 + i * 10, 302] for i in range(1, 11)], hold_ms=700)
    pos1 = pg.evaluate('() => { const it = [...window.__doska.items.values()][0]; return [it.x, it.y]; }')
    print('hold+drag: tool', st(), '| moved by', round(pos1[0] - pos0[0]), '| no new items:', n() == k)
    pen(pg, [[900, 600]])  # короткое касание по пустому
    print('tap empty →', st(), '| no dot added:', n() == k)
    # точка коротким касанием по-прежнему ставится
    pen(pg, [[700, 500]]); print('short tap makes dot:', n() == k + 1)
    # удержание на пустом месте → рамка
    pen(pg, [[200, 200]] + [[200 + i * 30, 200 + i * 20] for i in range(1, 12)], hold_ms=700)
    print('hold on empty → marquee, selected:', st())
    pen(pg, [[1000, 700]]); print('tap empty →', st())
    # после фигуры → щелчок по пустому → ручка (даже если до этого был маркер)
    pg.keyboard.press('KeyM'); pg.keyboard.press('KeyR')
    pg.mouse.move(500, 150); pg.mouse.down(); pg.mouse.move(650, 250, steps=5); pg.mouse.up(); pg.wait_for_timeout(60)
    pg.mouse.click(1000, 650); print('figure → click empty →', st()[0])
    # курсор собеседника скрыт по умолчанию
    print('peer cursor pref default:', pg.evaluate("() => JSON.parse(localStorage.getItem('doska:prefs')).peerCursor ?? false"))
    pg.keyboard.press('Shift+KeyC'); print('Shift+C →', pg.evaluate("() => JSON.parse(localStorage.getItem('doska:prefs')).peerCursor"))
    pg.keyboard.press('Shift+KeyC')
    # пирамида и ползунок угла
    pg.evaluate('() => window.__doska.setTool("fig:rpyramid")'); pg.mouse.click(250, 550); pg.wait_for_timeout(60)
    print('rpyramid:', pg.evaluate('() => [...window.__doska.items.values()].pop().kind'))
    pg.mouse.click(1000, 650)
    for kind in ['triangle', 'parallelogram', 'trapezoid', 'rhombus', 'rtriangle']:
        pg.evaluate(f'() => window.__doska.setTool("fig:{kind}")'); pg.mouse.click(600, 500); pg.wait_for_timeout(80)
        has = pg.locator('.selbar .isize[data-tip]').count()
        v0 = pg.locator('.selbar .sz-val').last.text_content()
        pg.evaluate('() => { const r = [...document.querySelectorAll(".selbar .sz-range")].pop(); r.value = 40; r.dispatchEvent(new Event("pointerdown")); r.dispatchEvent(new Event("input")); r.dispatchEvent(new Event("change")); }')
        pg.wait_for_timeout(60)
        v1 = pg.locator('.selbar .sz-val').last.text_content()
        it = pg.evaluate('() => [...window.__doska.items.values()].pop()')
        print(f'{kind}: slider rows {has}, {v0} → {v1}, w×h {round(it["w"])}×{round(it["h"])}, ang {it.get("ang")}')
        pg.screenshot(path=OUT + f'ang-{kind}.png', clip={'x': 300, 'y': 250, 'width': 650, 'height': 400})
        pg.keyboard.press('Control+z'); pg.wait_for_timeout(40)
        it2 = pg.evaluate('() => [...window.__doska.items.values()].pop()')
        print('   undo restores in one step:', round(it2['h']) == 160 or it2.get('ang') is None)
        pg.keyboard.press('Delete'); pg.mouse.click(1000, 650)
    print('errors', errs); b.close()
