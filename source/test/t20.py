from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 900, 'height': 300}, device_scale_factor=2)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Мира'}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=curs-oros-tst1'); pg.wait_for_function('() => window.__doska')
    urls = []
    for k in ['KeyP', 'KeyD', 'KeyM', 'KeyE', 'KeyE']:
        pg.keyboard.press(k); pg.wait_for_timeout(50)
        urls.append(pg.evaluate('() => document.getElementById("cv-over").style.cursor'))
    pg.keyboard.press('KeyP'); pg.keyboard.press('Digit2'); urls.append(pg.evaluate('() => document.getElementById("cv-over").style.cursor'))
    print([u[:40] + '… ' + u[-22:] for u in urls])
    # показать картинки курсоров крупно
    pg.evaluate('''(urls) => { document.body.innerHTML = ''; document.body.style.background = '#fff';
      for (const u of urls) { const m = u.match(/url\\("(.*?)"\\)/); const img = new Image(); img.src = m[1]; img.style.cssText = 'width:96px;height:auto;margin:14px;image-rendering:pixelated;border:1px dashed #ddd'; document.body.append(img); } }''', urls)
    pg.wait_for_timeout(200); pg.screenshot(path=OUT + 'cursors-os.png')
    print('errors', errs)
    b.close()
