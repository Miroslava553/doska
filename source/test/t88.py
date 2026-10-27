# Страницы условий и политики: открываются с главного экрана, читаются на телефоне, ссылки работают
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/legal/'
import os; os.makedirs(OUT, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch()
    for vp in [(1366, 820), (390, 780)]:
        ctx = b.new_context(viewport={'width': vp[0], 'height': vp[1]}, device_scale_factor=2 if vp[0] < 600 else 1)
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('file:///home/claude/board/dist/site/index.html'); pg.wait_for_timeout(1000)
        pg.screenshot(path=OUT + f'home-{vp[0]}.png')
        with ctx.expect_page() as np: pg.click('.legal a:has-text("Условия")')
        t = np.value; t.wait_for_load_state(); t.wait_for_timeout(300)
        t.screenshot(path=OUT + f'terms-{vp[0]}.png', full_page=True)
        over = t.evaluate("() => document.documentElement.scrollWidth > innerWidth + 1")
        bad = t.evaluate("() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => !/^(#|\\.\\/|terms|privacy|mailto|https)/.test(h))")
        t.click('a:has-text("Политика конфиденциальности")'); t.wait_for_timeout(400)
        t.screenshot(path=OUT + f'privacy-{vp[0]}.png', full_page=True)
        print(vp, 'страница шире экрана', over, 'странные ссылки', bad, 'политика открылась', 'Политика конфиденциальности' in t.title(), errs)
        ctx.close()
    b.close()
