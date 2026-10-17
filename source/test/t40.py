# окно графика: шаблоны и оси внизу в списках, окно двигается, график правится после вставки
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude-doska/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/show/'
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1280, 'height': 800}, device_scale_factor=1.5)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Тест', barPos: 'bottom'}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v27g-raph-0001'); pg.wait_for_function('() => window.__doska')
    pg.evaluate('() => window.__doska.setTool("graph")'); pg.mouse.click(700, 520); pg.wait_for_timeout(200)
    r = pg.evaluate("() => { const p = document.querySelector('.floating').getBoundingClientRect(), t = document.querySelector('.toolbar').getBoundingClientRect(); return [p.top, p.bottom, t.top]; }"); print('panel top/bottom, toolbar top', r)
    pg.screenshot(path=OUT + 'ge-1.png')
    pg.click('.ddbtn:has-text("Шаблоны")'); pg.wait_for_timeout(150); pg.screenshot(path=OUT + 'ge-2.png')
    pg.click('.tpl:has-text("Парабола")'); pg.wait_for_timeout(100)
    print('after tpl:', pg.evaluate("() => { const t = document.querySelector('.floating textarea'); return [t.value, t.value.slice(t.selectionStart, t.selectionEnd)]; }"))
    pg.click('.ddbtn:has-text("Оси")'); pg.wait_for_timeout(150); pg.screenshot(path=OUT + 'ge-3.png')
    # перетащить окно за заголовок
    h = pg.query_selector('.floating .panel-title').bounding_box()
    pg.mouse.move(h['x'] + 40, h['y'] + 8); pg.mouse.down(); pg.mouse.move(h['x'] - 300, h['y'] - 150, steps=6); pg.mouse.up()
    print('moved panel to', pg.evaluate("() => { const p = document.querySelector('.floating'); return [p.offsetLeft, p.offsetTop]; }"))
    pg.click('.floating .btn.primary'); pg.wait_for_timeout(200)
    g = pg.evaluate("() => [...window.__doska.items.values()].find(i => i.type === 'graph')")
    cx, cy = pg.evaluate(f"() => window.__doska.toScreen({g['x']} + {g['w']}/2, {g['y']} + {g['h']}/2)")
    pg.mouse.dblclick(cx, cy); pg.wait_for_timeout(250)
    print('dblclick opens editor:', pg.evaluate("() => document.querySelector('.floating .panel-title')?.textContent"))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
    pg.mouse.click(cx, cy); pg.wait_for_timeout(200)
    print('tool/sel', pg.evaluate("() => [window.__doska.S.tool, [...window.__doska.S.sel], !document.querySelector('.selbar').hidden]"))
    print('selbar edit btn:', pg.evaluate("() => [...document.querySelectorAll('.selbar button')].map(b => b.title).slice(0, 30)"))
    print('errors', errs); b.close()
