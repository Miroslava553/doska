# Окна поверх меню: удаление шаблона, папки, Материалы, аккаунт — окно всегда сверху, меню не мешает
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
def top_is_dialog(pg):
    return pg.evaluate("""() => { const d = document.querySelector('.modal .panel'); if (!d) return 'нет окна'; const r = d.getBoundingClientRect();
      const pts = [[r.left + 20, r.top + 20], [r.right - 20, r.top + 20], [r.left + r.width / 2, r.top + r.height / 2], [r.left + 20, r.bottom - 20], [r.right - 20, r.bottom - 20]];
      return pts.every(([x, y]) => d.contains(document.elementFromPoint(x, y))) ? 'окно сверху' : 'окно перекрыто'; }""")
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1300, 'height': 800})
    ctx.add_init_script("""localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));
      localStorage.setItem('doska:account', JSON.stringify({email:'m@e.ru', since:1, pro:{period:'month', started:Date.now(), until:Date.now()+30*864e5, canceled:false, method:'card'}}));""")
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=tdel-aaaa-bbbb'); pg.wait_for_timeout(1500)
    pg.keyboard.press('p'); pg.mouse.move(300, 300); pg.mouse.down(); pg.mouse.move(500, 400, steps=5); pg.mouse.up()
    for k in range(3):
        pg.click('[data-tip="Меню"]'); pg.wait_for_timeout(150); pg.click('text=Сохранить как шаблон'); pg.wait_for_timeout(200)
        pg.keyboard.press('Control+a'); pg.keyboard.type(f'Урок {k+1}'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    pg.goto('file:///home/claude/board/dist/doska.html'); pg.wait_for_timeout(1200)
    pg.click('.tpl-btn'); pg.wait_for_timeout(300)
    pg.locator('.tpl-del').first.click(); pg.wait_for_timeout(300)
    print('удаление шаблона:', top_is_dialog(pg), 'меню открыто', pg.locator('.tpl-menu').count())
    pg.screenshot(path=OUT + 'tdel1.png')
    pg.click('.modal .btn:not(.danger)'); pg.wait_for_timeout(300)
    print('отмена: меню снова открыто', pg.locator('.tpl-menu').count(), 'шаблонов', pg.locator('.tpl-row').count())
    pg.locator('.tpl-del').first.click(); pg.wait_for_timeout(300); pg.click('.modal .btn.danger'); pg.wait_for_timeout(500)
    print('удалили: меню открыто', pg.locator('.tpl-menu').count(), 'шаблонов', pg.locator('.tpl-row').count())
    # Escape закрывает окно, а не всё сразу
    pg.locator('.tpl-del').first.click(); pg.wait_for_timeout(300); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    print('Escape: окно', pg.locator('.modal').count(), 'меню', pg.locator('.tpl-menu').count())
    # меню аккаунта → удалить аккаунт
    pg.keyboard.press('Escape'); pg.mouse.click(50, 700); pg.wait_for_timeout(200)
    pg.click('.acc-btn, .home-top .avatar, .home-top button:last-child'); pg.wait_for_timeout(300)
    if pg.locator('text=Удалить аккаунт').count():
        pg.click('text=Удалить аккаунт'); pg.wait_for_timeout(400)
        print('удаление аккаунта:', top_is_dialog(pg) if pg.locator('.modal').count() else ('окно Про/аккаунта' if pg.locator('.am-back').count() else 'нет окна'), 'меню', pg.locator('.acc-menu').count())
        pg.screenshot(path=OUT + 'tdel2.png'); pg.keyboard.press('Escape')
    print(errs); b.close()
