# v24: крупные панели, нижняя приподнята, отменить/вернуть в левом нижнем углу; запоздалое касание пера
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude-doska/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/show/'
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1280, 'height': 760}, device_scale_factor=1.5)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Тест'}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v24t-ests-0001'); pg.wait_for_function('() => window.__doska')
    pg.wait_for_timeout(300)
    pg.screenshot(path=OUT + 'b-top.png')
    r = pg.evaluate("() => { const t = document.querySelector('.toolbar').getBoundingClientRect(); return {tb:[t.left,t.top,t.width,t.height]} }"); print('top', r)
    # снизу
    pg.evaluate("() => { const pr = JSON.parse(localStorage.getItem('doska:prefs')); }")
    pg.mouse.click(30, 30)  # меню? попробуем через prefs
    pg.keyboard.press('Escape')
    pg.evaluate("() => { const m = [...document.querySelectorAll('.chip')]; }")
    # пишем пером с запоздалым касанием
    js = """async () => {
      const cv = document.getElementById('cv-over');
      const ev = (type, x, y, buttons, pressure) => cv.dispatchEvent(new PointerEvent(type, {pointerId: 7, pointerType: 'pen', clientX: x, clientY: y, buttons, button: type==='pointermove'? -1 : 0, pressure, bubbles: true, cancelable: true, isPrimary: true}));
      for (let i = 0; i < 6; i++) { ev('pointermove', 400 + i, 400, 0, 0); await new Promise(r => setTimeout(r, 8)); }
      await new Promise(r => setTimeout(r, 160)); // Windows задержал касание
      ev('pointerdown', 440, 402, 1, 0.5);
      for (let i = 1; i <= 20; i++) { ev('pointermove', 440 + i * 8, 402, 1, 0.5); await new Promise(r => setTimeout(r, 8)); }
      ev('pointerup', 600, 402, 0, 0);
      await new Promise(r => setTimeout(r, 50));
      const its = [...window.__doska.items.values()].filter(i => i.type === 'stroke');
      const s = its[its.length - 1]; return { n: its.length, x: s && s.x, late: window.__doska.STATS.lateStart, start: s && window.__doska.toScreen(s.x, s.y) };
    }"""
    print('late stroke', pg.evaluate(js))
    # обычное касание (без задержки) не трогаем
    js2 = js.replace('160', '0').replace("for (let i = 0; i < 6; i++) { ev('pointermove', 400 + i, 400, 0, 0)", "for (let i = 0; i < 6; i++) { ev('pointermove', 400 + i, 500, 0, 0)").replace("ev('pointerdown', 440, 402", "ev('pointerdown', 406, 500").replace("440 + i * 8, 402", "406 + i * 8, 500").replace("ev('pointerup', 600, 402", "ev('pointerup', 566, 500")
    print('normal stroke', pg.evaluate(js2))
    pg.screenshot(path=OUT + 'b-top-ink.png')
    print('errors', errs); b.close()
