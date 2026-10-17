# v26: шаблоны графиков (сложить, отдельно, кусочная, окружность), символы у текста
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude-doska/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/show/'
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1280, 'height': 820}, device_scale_factor=1.5)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Тест'}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=v26g-raph-0001'); pg.wait_for_function('() => window.__doska')
    ta = lambda: pg.evaluate("() => { const t = document.querySelector('.floating textarea'); return [t.value, t.value.slice(t.selectionStart, t.selectionEnd), t.selectionStart]; }")
    pg.evaluate('() => window.__doska.setTool("graph")'); pg.mouse.click(160, 220); pg.wait_for_timeout(200)
    btn = lambda name: pg.click(f'.floating .snip:text-is("{name}")')
    btn('Парабола'); print('1', ta())
    pg.keyboard.type('2'); pg.keyboard.press('End'); pg.keyboard.type(' + '); btn('Прямая'); print('2', ta())
    pg.keyboard.press('End'); btn('Окружность'); print('3', ta())
    pg.screenshot(path=OUT + 'g-editor.png')
    pg.click('.floating .btn.primary'); pg.wait_for_timeout(200)
    print('msg/err:', pg.evaluate("() => [...window.__doska.items.values()].filter(i => i.type === 'graph').map(i => i.expr)"))
    # кусочная — второй график
    pg.mouse.click(1100, 760); pg.evaluate('() => window.__doska.setTool("graph")'); pg.mouse.click(700, 220); pg.wait_for_timeout(200)
    btn('Кусочная'); print('4', ta()); pg.click('.floating .btn.primary'); pg.wait_for_timeout(200)
    pg.mouse.click(1250, 800); pg.wait_for_timeout(200)
    pg.screenshot(path=OUT + 'g-graphs.png')
    # текст с символами
    pg.keyboard.press('KeyT'); pg.mouse.click(200, 700); pg.wait_for_timeout(200)
    pg.keyboard.type('Угол ABC = 90'); pg.click('.symbar .sym:text-is("°")'); pg.keyboard.type(', '); pg.click('.symbar .sym:text-is("sin")'); pg.keyboard.type(' α = '); pg.click('.symbar .sym:text-is("½")')
    print('text:', pg.evaluate("() => document.querySelector('.ed-text').value"))
    pg.screenshot(path=OUT + 'g-text.png', clip={'x': 150, 'y': 560, 'width': 700, 'height': 220})
    pg.click('.symbar .sym.frac'); pg.wait_for_timeout(300)
    print('frac opens formula:', pg.evaluate("() => { const t = document.querySelector('.floating textarea'); return t && [t.value, t.selectionStart]; }"))
    print('texts:', pg.evaluate("() => [...window.__doska.items.values()].filter(i => i.type === 'text').map(i => i.text)"))
    print('errors', errs); b.close()
