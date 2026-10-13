import os, struct, zlib
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
BASE = 'file:///home/claude/board/dist/doska.html?nopeer'
errors = []

def png(path, w=300, h=200):
    raw = b''.join(b'\x00' + b''.join(bytes([(x * 255 // w), (y * 255 // h), 160]) for x in range(w)) for y in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))

def sel(pg): return pg.evaluate('() => [...window.__doska.S.sel].map(id => window.__doska.items.get(id)?.type)')
def tb(pg): return pg.evaluate('() => { const t = document.querySelector(".toolbar"); return t.style.left + "/" + t.style.top + "/" + t.offsetWidth; }')

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1440, 'height': 860})
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    pg.on('dialog', lambda d: d.accept())
    pg.goto(BASE)
    pg.fill('input[placeholder="Ваше имя"]', 'Мира')
    pg.fill('input[placeholder="Название новой доски"]', 'Алгебра — Петя, подготовка к ЕГЭ, профильный уровень')
    print('title input value len', len(pg.input_value('input[placeholder="Название новой доски"]')))
    pg.click('text=Создать')
    pg.wait_for_function('() => window.__doska && document.querySelector(".btitle")?.textContent.length > 3')
    pg.wait_for_timeout(300)
    print('board title:', pg.text_content('.btitle'), '| tab:', pg.title())

    # 5. вставка картинки сразу выделена
    png(OUT + 'shot.png')
    pg.keyboard.press('KeyP')
    with pg.expect_file_chooser() as fc:
        pg.keyboard.press('KeyI')
    fc.value.set_files(OUT + 'shot.png')
    pg.wait_for_function('() => window.__doska.S.sel.size === 1')
    print('after insert: tool', pg.evaluate('() => window.__doska.S.tool'), 'selected', sel(pg))
    pg.wait_for_timeout(200)
    pg.screenshot(path=OUT + 'v2-inspector.png')

    # 6. курсор на ручке масштаба
    h = pg.evaluate('''() => { const d = window.__doska; const it = d.items.get([...d.S.sel][0]); const [x, y] = d.toScreen(it.x + it.w, it.y + it.h); return [x + 5, y + 5]; }''')
    pg.mouse.move(h[0], h[1]); pg.wait_for_timeout(100)
    c1 = pg.evaluate('() => document.getElementById("cv-over").style.cursor')
    pg.mouse.move(h[0] - 60, h[1] - 60); pg.wait_for_timeout(100)
    c2 = pg.evaluate('() => document.getElementById("cv-over").style.cursor')
    print('cursor on handle:', c1, '| inside:', c2)

    # 8. панель действий не исчезает при перетаскивании
    pg.mouse.move(h[0] - 80, h[1] - 80); pg.mouse.down()
    vis = []
    for i in range(6):
        pg.mouse.move(h[0] - 80 + i * 15, h[1] - 80, steps=2); vis.append(pg.evaluate('() => !document.querySelector(".selbar").hidden'))
        pg.wait_for_timeout(40)
    pg.mouse.up()
    print('inspector visible during drag:', all(vis))

    # 4. закрепить через панель → замочек → открепить
    pg.click('.selbar [data-tip^="Закрепить"]')
    badge = pg.locator('.lockbadge'); print('lock badges:', badge.count(), 'selected after lock:', sel(pg))
    pg.keyboard.press('KeyP'); print('badges with pen tool:', pg.locator('.lockbadge').count())
    pg.keyboard.press('KeyV'); pg.wait_for_timeout(100)
    pg.locator('.lockbadge').first.click(); pg.wait_for_timeout(100)
    print('after badge click: locked =', pg.evaluate('() => [...window.__doska.items.values()].find(i => i.type==="image").locked'), 'selected', sel(pg))

    # 9. частичное выделение рамкой
    pg.keyboard.press('Escape')
    img = pg.evaluate('''() => { const d = window.__doska; const it = [...d.items.values()].find(i => i.type==='image'); const [x,y] = d.toScreen(it.x, it.y); return [x, y]; }''')
    pg.mouse.move(img[0] - 40, img[1] - 40); pg.mouse.down(); pg.mouse.move(img[0] + 20, img[1] + 20, steps=4); pg.mouse.up()
    print('partial box selects image:', sel(pg))

    # 10. фигуры: куб щелчком, цилиндр протяжкой, многоугольник по точкам
    pg.evaluate('() => window.__doska.setTool("fig:cube")'); pg.mouse.click(900, 300)
    pg.evaluate('() => window.__doska.setTool("fig:cylinder")'); pg.mouse.move(1100, 220); pg.mouse.down(); pg.mouse.move(1220, 400, steps=4); pg.mouse.up()
    pg.evaluate('() => window.__doska.setTool("fig:pyramid")'); pg.mouse.click(900, 560)
    pg.evaluate('() => window.__doska.setTool("fig:rtriangle")'); pg.mouse.click(1150, 560)
    pg.keyboard.press('KeyY')
    for x, y in [(300, 600), (480, 520), (560, 680), (380, 720)]: pg.mouse.click(x, y); pg.wait_for_timeout(400)
    pg.mouse.click(301, 601)
    print('figures:', pg.evaluate('() => [...window.__doska.items.values()].filter(i => i.type==="fig").map(i => i.kind)'),
          'polygon:', pg.evaluate('() => [...window.__doska.items.values()].filter(i => i.type==="poly").map(i => [i.pts.length, i.closed])'))

    # 11. E несколько раз — одна подсказка
    for i in range(5): pg.keyboard.press('KeyE')
    print('toasts after 5×E:', pg.locator('.toast').count())

    # 12. панель не двигается
    pos = set()
    for k in ['KeyV', 'KeyP', 'KeyE', 'KeyL', 'KeyT', 'KeyG', 'KeyM', 'KeyH']:
        pg.keyboard.press(k); pg.wait_for_timeout(30); pos.add(tb(pg))
    pg.evaluate('() => window.__doska.hub.setPeer("error", "очень длинное сообщение об ошибке сервера знакомства")'); pg.wait_for_timeout(50); pos.add(tb(pg))
    print('toolbar positions:', pos)

    # 13/14. колесо и тачпад
    pg.keyboard.press('Escape')
    v0 = pg.evaluate('() => ({...window.__doska.S.view})')
    pg.mouse.move(700, 450); pg.mouse.wheel(0, 100); pg.wait_for_timeout(50)
    v1 = pg.evaluate('() => ({...window.__doska.S.view})')
    pg.mouse.wheel(37.5, -22.25); pg.wait_for_timeout(50)
    v2 = pg.evaluate('() => ({...window.__doska.S.view})')
    pg.keyboard.down('Shift'); pg.mouse.wheel(0, 100); pg.keyboard.up('Shift'); pg.wait_for_timeout(50)
    v3 = pg.evaluate('() => ({...window.__doska.S.view})')
    pg.keyboard.down('Control'); pg.mouse.wheel(0, -100); pg.keyboard.up('Control'); pg.wait_for_timeout(50)
    v4 = pg.evaluate('() => ({...window.__doska.S.view})')
    f = lambda a, b: (round(b['x'] - a['x'], 1), round(b['y'] - a['y'], 1), round(b['z'] / a['z'], 3))
    print('wheel down (dx,dy,zoom):', f(v0, v1), '| touchpad diagonal:', f(v1, v2), '| shift:', f(v2, v3), '| ctrl:', f(v3, v4))

    pg.keyboard.press('Shift+Digit1'); pg.wait_for_timeout(200)
    pg.screenshot(path=OUT + 'v2-figs.png')
    # меню фигур
    pg.keyboard.press('KeyL'); pg.locator('.tbtn.grp').first.click(); pg.wait_for_timeout(150)
    pg.screenshot(path=OUT + 'v2-shapes-pop.png')
    pg.keyboard.press('Escape'); pg.mouse.click(1300, 800)
    # выход в список
    pg.click('.tr .tbtn[data-tip^="К списку"]'); pg.wait_for_selector('.start-card')
    pg.screenshot(path=OUT + 'v2-start.png')
    print('list:', pg.locator('.bname').all_text_contents())
    b.close()
print('ERRORS', errors)
