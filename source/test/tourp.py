# Экскурсия по экранам на телефоне
from playwright.sync_api import sync_playwright
import os
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/tourp/'
os.makedirs(OUT, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 390, 'height': 780}, device_scale_factor=2, has_touch=True, is_mobile=True)
    ctx.add_init_script("""if (!localStorage.getItem('doska:prefs')) localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));""")
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    shot = lambda n: pg.screenshot(path=OUT + n + '.png')
    pg.goto('file:///home/claude/board/dist/doska.html'); pg.wait_for_timeout(1200); shot('01-home')
    pg.click('button:has-text("Войти")'); pg.wait_for_timeout(500); shot('02-login')
    pg.fill('input[name=email]', 'mira@mail.ru'); pg.click('button[type=submit]'); pg.wait_for_timeout(500); shot('03-code')
    code = pg.inner_text('.am-code').replace(' ', ''); pg.keyboard.type(code); pg.wait_for_timeout(900); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.click('button:has-text("Про")'); pg.wait_for_timeout(500); shot('04-paywall')
    pg.click('.am-btn.pro.big'); pg.wait_for_timeout(500); shot('05-checkout')
    pg.click('.am-btn.pro.big'); pg.wait_for_timeout(2400); shot('06-celebrate'); pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
    pg.fill('input[placeholder="Название новой доски"]', 'Физика'); pg.click('text=Создать'); pg.wait_for_timeout(1800); shot('07-board')
    pg.evaluate("() => window.__doska.setTool('pen')"); pg.mouse.move(80, 300); pg.mouse.down(); pg.mouse.move(250, 380, steps=8); pg.mouse.up()
    pg.evaluate("() => window.__doska.setTool('hw')"); pg.mouse.click(200, 480); pg.wait_for_timeout(500)
    pg.evaluate("() => window.__doska.setTool('select')"); pg.mouse.click(160, 340); pg.wait_for_timeout(300); shot('08-selbar')
    pg.click('[data-tip="Меню"]'); pg.wait_for_timeout(300); shot('09-menu'); pg.keyboard.press('Escape')
    pg.click('.hw-set'); pg.wait_for_timeout(300); shot('10-hwpanel'); pg.keyboard.press('Escape')
    pg.click('[data-tip^="Материалы"]'); pg.wait_for_timeout(500); shot('11-materials'); pg.keyboard.press('Escape'); pg.mouse.click(30, 600)
    pg.evaluate("() => window.__doska.setTool('tex')"); pg.mouse.click(150, 600); pg.wait_for_timeout(400); shot('12-formula'); pg.keyboard.press('Escape')
    pg.evaluate("() => window.__doska.hist().open()"); pg.wait_for_timeout(900); shot('13-history'); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    print(errs); b.close()
