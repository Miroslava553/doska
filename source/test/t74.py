from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1300, 'height': 850}, device_scale_factor=1.5)
    ctx.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}))")
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=tips-aaaa-bbbb'); pg.wait_for_timeout(2000)
    for k in range(3):
        pg.click('.toolbar [data-tip^="Метка"]'); pg.mouse.click(400 + k * 150, 400); pg.wait_for_timeout(150)
    pg.hover('.hw-set >> nth=1'); pg.wait_for_timeout(900); pg.screenshot(path=OUT + 'tip1.png')
    pg.hover('.toolbar [data-tip^="Перо"]'); pg.wait_for_timeout(900); pg.screenshot(path=OUT + 'tip2.png')
    print(errs); b.close()
