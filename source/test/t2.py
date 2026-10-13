import os, glob
from playwright.sync_api import sync_playwright

URL = 'file:///home/claude/board/dist/doska.html?nopeer#r=test-cccc-dddd'
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
errors = []

def count(page): return page.evaluate('() => window.__doska.items.size')

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1280, 'height': 760}, accept_downloads=True)
    ctx.add_init_script("if (!localStorage.getItem('doska:prefs')) localStorage.setItem('doska:prefs', JSON.stringify({name: 'Мира'}))")
    page = ctx.new_page()
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    page.on('pageerror', lambda e: errors.append('pageerror ' + str(e)))
    page.on('dialog', lambda d: d.accept('Мира'))
    page.goto(URL); page.wait_for_function('() => window.__doska'); page.wait_for_timeout(400)

    # стикер
    page.keyboard.press('KeyN'); page.mouse.click(250, 300); page.keyboard.type('Не забыть: единицы СИ'); page.keyboard.press('Escape')
    # лазер (эфемерный — объектов не прибавляется)
    # маркер
    page.keyboard.press('KeyM'); page.mouse.move(200, 520); page.mouse.down(); page.mouse.move(500, 520, steps=10); page.mouse.up()
    # линия с шагом 15°
    page.keyboard.press('KeyL'); page.keyboard.down('Shift'); page.mouse.move(600, 500); page.mouse.down(); page.mouse.move(800, 510, steps=5); page.mouse.up(); page.keyboard.up('Shift')
    it = page.evaluate('() => [...window.__doska.items.values()].find(i => i.type === "line")')
    print('snapped line y2 =', round(it['y2'], 3))
    # масштаб через ручку
    page.keyboard.press('KeyV'); page.mouse.click(260, 320)
    s0 = page.evaluate('() => [...window.__doska.S.sel].map(id => window.__doska.items.get(id).s)')
    bb = page.evaluate('''() => { const d = window.__doska; const it = d.items.get([...d.S.sel][0]); const [x,y] = d.toScreen(it.x + it.w, it.y + it.h); return [x, y]; }''')
    page.mouse.move(bb[0] + 5, bb[1] + 5); page.mouse.down(); page.mouse.move(bb[0] + 105, bb[1] + 105, steps=5); page.mouse.up()
    s1 = page.evaluate('() => [...window.__doska.S.sel].map(id => window.__doska.items.get(id).s)')
    print('scale', s0, '->', s1)
    page.screenshot(path=OUT + 't2a.png')

    # меню, фигуры, модалки
    page.locator('.tl .tbtn').first.click(); page.wait_for_timeout(150); page.screenshot(path=OUT + 't2-menu.png')
    page.keyboard.press('Escape'); page.mouse.click(1200, 700)
    page.keyboard.press('Shift+Slash'); page.wait_for_timeout(150); page.screenshot(path=OUT + 't2-help.png'); page.keyboard.press('Escape')
    page.locator('.status').click(); page.wait_for_timeout(150)
    page.locator('details.manual summary').click(); page.locator('text=1. Я начинаю').click(); page.wait_for_timeout(5500)
    code = page.locator('.manual textarea').first.input_value()
    print('manual offer code length', len(code), code[:12])
    page.screenshot(path=OUT + 't2-connect.png'); page.keyboard.press('Escape')

    # экспорт PDF всех листов → импорт этого PDF обратно (проверка pdf.js с file://)
    page.keyboard.press('Shift+KeyN'); page.wait_for_timeout(200)
    page.keyboard.press('KeyF'); page.mouse.click(400, 300); page.keyboard.type('E = mc^2'); page.keyboard.press('Enter')
    with page.expect_download() as d:
        page.evaluate('() => document.querySelector(".tl .tbtn").click()')
        page.locator('text=Все листы в PDF').click()
    pdfpath = OUT + 'export.pdf'; d.value.save_as(pdfpath)
    print('pdf size', os.path.getsize(pdfpath), open(pdfpath, 'rb').read(8))
    with page.expect_download() as d:
        page.keyboard.press('Control+s')
    d.value.save_as(OUT + 'lesson.doska'); print('lesson file', os.path.getsize(OUT + 'lesson.doska'))
    page.keyboard.press('Shift+KeyN'); page.wait_for_timeout(200)
    n = count(page)
    with page.expect_file_chooser() as fc:
        page.keyboard.press('KeyI')
    fc.value.set_files(pdfpath)
    page.wait_for_function(f'() => window.__doska.items.size >= {n + 2}', timeout=20000)
    print('pdf pages inserted', count(page) - n)
    page.keyboard.press('Shift+Digit1'); page.wait_for_timeout(500)
    page.screenshot(path=OUT + 't2-pdf.png')
    print('pages', page.evaluate('() => [...document.querySelectorAll(".page")].map(e => e.textContent)'))

    # узкий экран
    page.set_viewport_size({'width': 1024, 'height': 700}); page.wait_for_timeout(300); page.screenshot(path=OUT + 't2-narrow.png')
    b.close()
print('ERRORS', errors)
