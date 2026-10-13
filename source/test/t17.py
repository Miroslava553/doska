import json
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1200, 'height': 800}, accept_downloads=True); pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Мира'}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=recp-test-hhh8'); pg.wait_for_function('() => window.__doska')
    pg.locator('.tl .tbtn').first.click(); pg.click('text=Настройки пера и мыши')
    pg.click('text=Записать перо'); pg.wait_for_timeout(100)
    print('badge:', pg.locator('.rec-badge').count(), '| modal closed:', pg.locator('.modal').count() == 0)
    pg.keyboard.press('KeyP'); pg.mouse.move(300, 300); pg.mouse.down(); pg.mouse.move(500, 350, steps=10); pg.mouse.up()
    with pg.expect_download() as d: pg.click('.rec-badge')
    path = OUT + 'rec.json'; d.value.save_as(path)
    data = json.load(open(path)); types = {}
    for e in data['ev']: types[e['type']] = types.get(e['type'], 0) + 1
    print('recorded:', types, '| keys:', sorted(data['ev'][1].keys()))
    print('errors', errs)
    b.close()
