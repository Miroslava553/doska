# Вандал по сценариям: пустые и странные вводы, крайние значения, плохие файлы, быстрые повторные нажатия
from playwright.sync_api import sync_playwright
import os, json
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/edge/'
os.makedirs(OUT, exist_ok=True)
BAD = OUT + 'bad.doska'; open(BAD, 'w').write('{"format":"doska","update":"!!!не base64"}')
TXT = OUT + 'notes.txt'; open(TXT, 'w').write('просто текст')
EMPTY = OUT + 'empty.png'; open(EMPTY, 'wb').write(b'')
FAKE = OUT + 'fake.png'; open(FAKE, 'wb').write(b'this is not a png at all' * 100)
res = []
def r(name, val): res.append((name, val)); print(name, '→', val)
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1366, 'height': 820}, accept_downloads=True)
    ctx.add_init_script("""localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));
      localStorage.setItem('doska:account', JSON.stringify({email:'m@e.ru', since:1, pro:{period:'month', started:Date.now(), until:Date.now()+30*864e5, canceled:false, method:'card'}}));""")
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:200])); pg.on('dialog', lambda d: (errs.append('native ' + d.message), d.accept()))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=vand-aaaa-bbbb'); pg.wait_for_timeout(1500)
    D = 'window.__doska'
    n = lambda: pg.evaluate("() => window.__doska.items.size")
    # 1. текст: пустой, огромный, эмодзи
    pg.keyboard.press('t'); pg.mouse.click(300, 300); pg.wait_for_timeout(150); pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    r('пустой текст не создаёт объект', n() == 0)
    pg.keyboard.press('t'); pg.mouse.click(300, 300); pg.wait_for_timeout(150)
    pg.evaluate("() => { const t = document.activeElement; t.value = 'Длинный текст '.repeat(400) + '😀🔥'; t.dispatchEvent(new Event('input', { bubbles: true })); }")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    r('длинный текст создан', n() == 1)
    pg.screenshot(path=OUT + 'v-text.png')
    # 2. формула: неверный LaTeX
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(100)
    pg.evaluate("() => { const dt = new DataTransfer(); dt.setData('text/plain', 'Длинный текст из буфера обмена. '.repeat(20)); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); }"); pg.wait_for_timeout(300)
    r('вставленный текст переносится по строкам', pg.evaluate("() => [...window.__doska.items.values()].find(i => i.type === 'text')?.text.split('\\n').length"))
    pg.screenshot(path=OUT + 'v-paste.png'); pg.keyboard.press('Escape')
    pg.keyboard.press('f'); pg.mouse.click(700, 500); pg.wait_for_timeout(300)
    pg.keyboard.type('\\frac{1}{'); pg.wait_for_timeout(400)
    r('ошибка формулы видна', pg.evaluate("() => !!document.querySelector('.floating') && /ошиб|Ошиб|не хватает|скобк/i.test(document.querySelector('.floating').innerText)"))
    pg.screenshot(path=OUT + 'v-formula.png')
    pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    r('неверная формула после Enter: объектов', n())
    pg.keyboard.press('Escape'); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    # 3. график: странные выражения
    for ex in ['1/0', 'x^1000', 'sin(1/x)', 'sqrt(-x)', 'log(0)', '', 'y=']:
        pg.keyboard.press('g'); pg.mouse.click(500, 400); pg.wait_for_timeout(300)
        pg.keyboard.type(ex); pg.wait_for_timeout(300); pg.keyboard.press('Control+Enter'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
        pg.keyboard.press('Escape'); pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    r('графики: ошибок нет', len(errs) == 0)
    pg.keyboard.press('Shift+1'); pg.wait_for_timeout(400); pg.screenshot(path=OUT + 'v-graphs.png')
    # 4. плохие файлы
    for f in (BAD, TXT, EMPTY, FAKE):
        with pg.expect_file_chooser() as fc: pg.keyboard.press('Control+o') if f.endswith('.doska') else pg.keyboard.press('KeyI')
        fc.value.set_files(f); pg.wait_for_timeout(900)
        r('файл ' + os.path.basename(f) + ': тост', pg.evaluate("() => [...document.querySelectorAll('.toast')].map(t => t.innerText).join(' | ')"))
        pg.keyboard.press('Escape')
    # 5. листы: удалить все подряд
    for i in range(3): pg.keyboard.press('Shift+N'); pg.wait_for_timeout(100)
    for i in range(6):
        pg.keyboard.press('Shift+Delete'); pg.wait_for_timeout(250)
        if pg.locator('.modal .btn.danger').count(): pg.click('.modal .btn.danger'); pg.wait_for_timeout(250)
    r('после удаления всех листов листов осталось', pg.evaluate("() => window.__doska.pages().length"))
    # 6. Д/З: пустое имя, крайние ползунки
    pg.keyboard.press('k'); pg.mouse.click(600, 400); pg.wait_for_timeout(300)
    hid = pg.evaluate("() => [...window.__doska.items.values()].find(i => i.type === 'hw')?.id")
    r('метка поставлена', bool(hid))
    if hid:
        pg.evaluate("(id) => window.__doska.S.sel = new Set([id])", hid); pg.keyboard.press('v'); pg.wait_for_timeout(300)
        inp = pg.locator('.hwp-name')
        if inp.count():
            inp.fill(''); inp.press('Enter'); pg.wait_for_timeout(200)
            r('пустое имя метки стало', pg.evaluate("(id) => window.__doska.items.get(id).name", hid))
    # 7. быстрые двойные нажатия на «Создать» шаблон, историю и т. п.
    pg.keyboard.press('Escape')
    pg.click('[data-tip="Меню"]'); pg.wait_for_timeout(150); pg.click('text=История доски'); pg.click('text=История доски') if pg.locator('text=История доски').count() else None
    pg.wait_for_timeout(800); r('окон истории открыто', pg.locator('.hp').count()); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    # 8. неверная ссылка на доску
    pg.goto('file:///home/claude/board/dist/doska.html#r=../../etc'); pg.wait_for_timeout(1500)
    r('неверная ссылка: главный экран', pg.evaluate("() => !window.__doska && !!document.querySelector('.start-card')"))
    pg.goto('file:///home/claude/board/dist/doska.html#r=<script>alert(1)</script>'); pg.wait_for_timeout(1500)
    r('ссылка со скриптом: главный экран', pg.evaluate("() => !window.__doska && !!document.querySelector('.start-card')"))
    # 9. главный экран: подключение по пустому и мусорному коду
    for code in ['', '   ', 'abc', 'https://evil.example/#r=zzzz-zzzz-zzzz', 'zzzz-zzzz-zzzz']:
        pg.goto('file:///home/claude/board/dist/doska.html'); pg.wait_for_timeout(800)
        pg.fill('input[placeholder^="Код или ссылка"]', code); pg.click('text=Подключиться'); pg.wait_for_timeout(700)
        r(f'код «{code[:30]}»', pg.evaluate("() => (window.__doska ? 'открылась доска ' + location.hash : 'осталась главная: ' + (document.querySelector('.err, .start-err, .home-err')?.innerText || ''))"))
    # 10. создание доски с пустым и длинным названием, двойной клик «Создать»
    pg.goto('file:///home/claude/board/dist/doska.html'); pg.wait_for_timeout(800)
    pg.fill('input[placeholder="Название новой доски"]', '   '); pg.dblclick('text=Создать'); pg.wait_for_timeout(1500)
    r('двойной клик «Создать»: открыта одна доска', pg.evaluate("() => !!window.__doska && JSON.parse(localStorage.getItem('doska:recent')).length"))
    r('название из пробелов', pg.evaluate("() => window.__doska && window.__doska.doc.getMap('meta').get('title')"))
    print('ошибки', errs)
    b.close()
