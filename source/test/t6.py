from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERR '+str(e)))
    pg.on('console', lambda m: m.type=='error' and errs.append(m.text[:120]))
    pg.on('dialog', lambda d: d.accept('X'))
    pg.goto('file:///home/claude/board/dist/doska.html#r=netw-test-room'); pg.wait_for_function('() => window.__doska')
    pg.wait_for_timeout(2000); print('2s:', pg.text_content('.status'))
    pg.wait_for_timeout(15000); print('17s:', pg.text_content('.status'), pg.evaluate('() => JSON.stringify(window.__doska.hub.status())'))
    b.close()
print([e for e in errs if 'PAGEERR' in e][:5]); print(len(errs), 'console errors (сетевые — ожидаемо в песочнице)')
