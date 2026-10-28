# Переезд со старого адреса: доски, нарисованные на старом сайте, появляются на новом
from playwright.sync_api import sync_playwright
import subprocess, os
OLD = 'http://localhost:4031/'; NEW = 'http://127.0.0.1:4021/'
def build(move):
    env = dict(os.environ); env.pop('MOVE_TO', None)
    if move: env['MOVE_TO'] = 'http://127.0.0.1:4021'
    subprocess.run(['node', 'build.mjs'], cwd='/home/claude/board', env=env, capture_output=True)
res = []
def r(n, v): res.append(v); print(('✓ ' if v else '✗ ') + n)
build(False)
with sync_playwright() as p:
    b = p.chromium.launch(); c = b.new_context(viewport={'width': 1366, 'height': 820})
    c.add_init_script("if (!localStorage.getItem('doska:prefs')) localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));")
    pg = c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    rooms = []
    for t in ('Геометрия', 'Физика'):
        pg.goto(OLD); pg.wait_for_timeout(1000)
        pg.fill('input[placeholder="Название новой доски"]', t); pg.click('text=Создать'); pg.wait_for_timeout(1500)
        pg.keyboard.press('p'); pg.mouse.move(300, 300); pg.mouse.down(); pg.mouse.move(500, 380, steps=10); pg.mouse.up(); pg.wait_for_timeout(800)
        rooms.append(pg.evaluate("() => location.hash.slice(3)"))
    pg.goto('about:blank')
    build(True)
    pg.goto(OLD + '#r=' + rooms[0]); pg.wait_for_timeout(6000)
    r('старый адрес перевёл на новый с той же доской', pg.url.startswith(NEW) and rooms[0] in pg.url and 'import' not in pg.url)
    pg.wait_for_timeout(2000)
    r('доска на новом адресе с рисунком', pg.evaluate("() => window.__doska && window.__doska.items.size") == 1)
    r('название доски сохранилось', pg.evaluate("() => window.__doska.doc.getMap('meta').get('title')") == 'Геометрия')
    pg.goto(NEW); pg.wait_for_timeout(1200)
    lst = pg.inner_text('.blist'); r('обе доски в списке', 'Геометрия' in lst and 'Физика' in lst)
    r('имя и роль перенеслись', pg.input_value('input[placeholder="Ваше имя"]') == 'Мира')
    pg.goto(OLD); pg.wait_for_timeout(3000)
    r('второй заход на старый адрес сразу ведёт на новый', pg.url.startswith(NEW))
    # чистый браузер без досок
    c2 = b.new_context(); p2 = c2.new_page(); p2.goto(OLD + '#r=abcd-efgh-ijkl'); p2.wait_for_timeout(4000)
    r('пустой браузер: сразу на новый адрес с той же ссылкой', p2.url.startswith(NEW) and 'abcd-efgh-ijkl' in p2.url)
    r('ошибок нет', not errs); print(errs)
    b.close()
build(False)
print('ИТОГ', sum(res), 'из', len(res))
