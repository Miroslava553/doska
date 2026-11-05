# Толщина и цвет только что нарисованной фигуры из окна «Фигуры» и с палитры, пока никуда не нажали
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/jd/'
res = []
def r(n, v): res.append((n, v)); print(('✓ ' if v else '✗ ') + n)
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    pg = b.new_page(viewport={'width': 1366, 'height': 820}); pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0, penColor: '#1e1e1e', shapeSize: 2}));")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=jd01-aaaa-bbbb'); pg.wait_for_timeout(1500)
    D = lambda js, *a: pg.evaluate(js, *a)
    items = lambda: D("() => [...window.__doska.items.values()].map((i) => ({ id: i.id, type: i.type, size: i.size, color: i.color, kind: i.kind }))")
    last = lambda: items()[-1]
    prefs = lambda: D("() => JSON.parse(localStorage.getItem('doska:prefs'))")
    def draw(x0, y0, x1, y1):
        pg.mouse.move(x0, y0); pg.mouse.down(); pg.mouse.move(x1, y1, steps=6); pg.mouse.up(); pg.wait_for_timeout(150)
    def shapes_pop():
        pg.click('[data-grp="shapes"]'); pg.wait_for_timeout(350)
    def chip(v):
        pg.click('.sh-chip[data-v="%s"]' % v); pg.wait_for_timeout(150)
    def close_pop():
        pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    pg.keyboard.press('l'); pg.wait_for_timeout(100)
    draw(300, 300, 600, 320); L1 = last()
    r('линия нарисована тонкой', L1['type'] == 'line' and abs(L1['size'] - 1.8) < 1e-6)
    shapes_pop()
    r('окно открыто, нарисованная линия подсвечена', D("() => !!window.__doska.S.justDrawn") and pg.locator('.fig-pop').count() == 1)
    pg.screenshot(path=OUT + '1-highlight.png')
    chip(6)
    it = [i for i in items() if i['id'] == L1['id']][0]
    r('толщина из окна «Фигуры» поменяла только что нарисованную линию', abs(it['size'] - 5.4) < 1e-6)
    chip(4)
    it = [i for i in items() if i['id'] == L1['id']][0]
    r('можно менять несколько раз подряд', abs(it['size'] - 3.6) < 1e-6 and prefs()['shapeSize'] == 4)
    # цвет с палитры
    pg.click('.cbtn[style*="#e03131"]'); pg.wait_for_timeout(150)
    it = [i for i in items() if i['id'] == L1['id']][0]
    r('цвет с палитры поменял линию', it['color'] == '#e03131')
    r('у ручки цвет прежний, у фигур новый', prefs()['penColor'] == '#1e1e1e' and prefs()['shapeColor'] == '#e03131')
    close_pop()
    # прокрутка колесом не рвёт связь
    pg.keyboard.press('l'); pg.wait_for_timeout(50)
    pg.keyboard.press('l') if D("() => window.__doska.S.tool") != 'line' else None
    draw(300, 420, 600, 430); L2 = last()
    r('новая линия сразу красная и толщиной 4', L2['color'] == '#e03131' and abs(L2['size'] - 3.6) < 1e-6)
    pg.mouse.move(700, 500); pg.mouse.wheel(0, 120); pg.wait_for_timeout(200)
    shapes_pop(); chip(8)
    it = [i for i in items() if i['id'] == L2['id']][0]
    r('после прокрутки колесом толщина всё ещё меняет линию', abs(it['size'] - 7.2) < 1e-6)
    close_pop()
    # Escape рвёт связь
    shapes_pop(); chip(2)
    it2 = [i for i in items() if i['id'] == L2['id']][0]
    r('Escape закрыл окно и разорвал связь', abs(it2['size'] - 7.2) < 1e-6)
    # нажатие по доске рвёт связь
    D("() => { const D = window.__doska; }")
    pg.keyboard.press('l') if D("() => window.__doska.S.tool") != 'line' else None
    draw(300, 520, 600, 520); L3 = last()
    pg.mouse.click(1000, 650); pg.wait_for_timeout(150)  # щелчок по пустому месту
    shapes_pop(); chip(6)
    it3 = [i for i in items() if i['id'] == L3['id']][0]
    r('после щелчка по доске старая линия не меняется', abs(it3['size'] - 1.8) < 1e-6)
    close_pop()
    # отмена после смены толщины
    pg.keyboard.press('l') if D("() => window.__doska.S.tool") != 'line' else None
    draw(300, 600, 600, 600); L4 = last(); shapes_pop(); chip(8); close_pop()
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(200)
    it4 = [i for i in items() if i['id'] == L4['id']]
    r('Ctrl+Z возвращает прежнюю толщину, линия остаётся', it4 and abs(it4[0]['size'] - 5.4) < 1e-6)
    # прямоугольник (он сам выделяется)
    pg.keyboard.press('r'); pg.wait_for_timeout(100)
    draw(800, 200, 1000, 320); R1 = last()
    shapes_pop(); chip(12)
    rr = [i for i in items() if i['id'] == R1['id']][0]
    r('прямоугольник: толщина из окна меняет его', rr['type'] == 'rect' and abs(rr["size"] - 10.8) < 1e-6)
    pg.click('.cbtn[style*="#2f9e44"]'); pg.wait_for_timeout(150)
    rr = [i for i in items() if i['id'] == R1['id']][0]
    r('прямоугольник: цвет с палитры меняет его, ручка прежняя', rr['color'] == '#2f9e44' and prefs()['penColor'] == '#1e1e1e')
    close_pop()
    # горячие клавиши ] сразу после рисования
    pg.keyboard.press('l'); pg.wait_for_timeout(80)
    if D("() => window.__doska.S.tool") != 'line': pg.keyboard.press('l')
    draw(300, 680, 600, 690); L5 = last(); before = L5['size']
    pg.keyboard.press('['); pg.wait_for_timeout(150)
    l5 = [i for i in items() if i['id'] == L5['id']][0]; print('dbg', D("() => window.__doska.S.tool"), before, l5, D("() => window.__doska.S.justDrawn"))
    r('клавиша [ сразу после рисования делает линию тоньше', l5['size'] < before)
    # ручка: цвет и толщина не тронуты
    pg.keyboard.press('p'); pg.wait_for_timeout(100)
    r('ручка осталась чёрной', D("() => window.__doska.S.tool") == 'pen' and prefs()['penColor'] == '#1e1e1e')
    draw(100, 760, 250, 760); st = last()
    r('штрих ручкой чёрный', st['type'] == 'stroke' and st['color'] == '#1e1e1e')
    # после ручки окно фигур не меняет старую линию
    shapes_pop(); chip(2)
    l5b = [i for i in items() if i['id'] == L5['id']][0]
    r('после работы ручкой линия не меняется', l5b['size'] == l5['size'])
    close_pop()
    # многоугольник по точкам
    pg.keyboard.press('y'); pg.wait_for_timeout(100)
    for x, y in [(900, 450), (1100, 460), (1050, 600)]: pg.mouse.click(x, y); pg.wait_for_timeout(120)
    pg.mouse.click(900, 450); pg.wait_for_timeout(200); P1 = last()
    shapes_pop(); chip(8)
    pp = [i for i in items() if i['id'] == P1['id']][0]
    r('многоугольник: толщина меняется сразу после рисования', pp['type'] == 'poly' and abs(pp['size'] - 7.2) < 1e-6)
    # выбор другой фигуры в окне — это новое действие
    pg.click('.figbtn[data-tip^="Прямоугольник (R)"]'); pg.wait_for_timeout(150); shapes_pop(); chip(1)
    pp = [i for i in items() if i['id'] == P1['id']][0]
    r('выбрали в окне другую фигуру: многоугольник больше не меняется', abs(pp['size'] - 7.2) < 1e-6)
    close_pop()
    # рука: перетаскивание доски не рвёт связь
    pg.keyboard.press('l'); pg.wait_for_timeout(80)
    if D("() => window.__doska.S.tool") != 'line': pg.keyboard.press('l')
    draw(200, 150, 260, 230); L6 = last()
    pg.keyboard.down('Space'); pg.mouse.move(700, 700); pg.mouse.down(); pg.mouse.move(650, 650, steps=4); pg.mouse.up(); pg.keyboard.up('Space'); pg.wait_for_timeout(150)
    shapes_pop(); chip(3)
    l6 = [i for i in items() if i['id'] == L6['id']][0]
    r('сдвинули доску пробелом: линия всё ещё меняется', abs(l6['size'] - 2.7) < 1e-6)
    close_pop()
    # объёмное тело: связи нет, оно выделяется само
    stereo = ['Куб / параллелепипед']
    if stereo:
        shapes_pop(); pg.locator('.figbtn[data-tip="%s"]' % stereo[0]).scroll_into_view_if_needed(); pg.click('.figbtn[data-tip="%s"]' % stereo[0]); pg.wait_for_timeout(150)
        pg.mouse.click(1150, 700); pg.wait_for_timeout(300)
        r('объёмное тело: связь «только что нарисовано» не ставится', not D("() => !!window.__doska.S.justDrawn"))
    r('без ошибок', not errs)
    if errs: print(errs[:3])
    b.close()
print('ИТОГ', sum(1 for _, v in res if v), 'из', len(res))
