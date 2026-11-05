# Повтор урока: скорость до 32×, приближение и перемещение картинки, мгновенные кнопки, слежение за рукой, перемотка
from playwright.sync_api import sync_playwright
import time
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/rp/'
res = []
def r(n, v): res.append((n, v)); print(('✓ ' if v else '✗ ') + n)
def run(w, h, touch=False, tag=''):
    with sync_playwright() as p:
        b = p.chromium.launch(); errs = []
        pg = b.new_page(viewport={'width': w, 'height': h}, has_touch=touch); pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));")
        pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=' + ('rp01-aaaa-bbbb' if tag == 'pc' else 'rp02-aaaa-bbbb')); pg.wait_for_timeout(1500)
        D = lambda js, *a: pg.evaluate(js, *a)
        # урок: 120 мелких «букв» и пара фигур
        D("""() => { const D = window.__doska; D.doc.transact(() => { for (let i = 0; i < 120; i++) { const ox = 60 + (i % 20) * 42, oy = 80 + Math.floor(i / 20) * 60; const pts = [];
          for (let j = 0; j < 24; j++) pts.push(Math.round((ox + j * 1.2) * 10), Math.round((oy + Math.sin(j / 3) * 9) * 10), 50);
          D.addItem({ id: 'w' + i, type: 'stroke', page: D.S.page, z: i + 1, x: 0, y: 0, s: 1, color: '#1e1e1e', size: 2, kind: 'pen', v: 2, thin: 0, pts }); }
          D.addItem({ id: 'rc', type: 'rect', page: D.S.page, z: 500, x: 100, y: 500, s: 1, w: 300, h: 120, color: '#1971c2', size: 3 }); }, 'noundo'); }""")
        pg.wait_for_timeout(200)
        pg.click('button[data-tip="Меню"]'); pg.wait_for_timeout(250); pg.click('text=Повтор урока'); pg.wait_for_timeout(700)
        st = lambda: D("() => window.__replay.state()")
        r('[%s] повтор открылся и идёт' % tag, pg.locator('.rp').count() == 1 and st()['playing'])
        pg.screenshot(path=OUT + 'open%s.png' % tag)
        # скорость: меню, 32×
        pg.locator('.rp-speed').click(); pg.wait_for_timeout(150)
        opts = pg.locator('.rp-mi').all_inner_texts()
        r('[%s] в меню скорости есть 8×, 16×, 32×' % tag, all(x in opts for x in ['8×', '16×', '32×']))
        pg.screenshot(path=OUT + 'speed%s.png' % tag)
        pg.locator('.rp-mi', has_text='32×').click(); pg.wait_for_timeout(100)
        r('[%s] скорость 32×' % tag, st()['speed'] == 32 and pg.inner_text('.rp-speed') == '32×' and pg.locator('.rp-menu').count() == 0)
        # пауза мгновенно: нажали — и сразу стоит (кнопка не перерисовывается каждый кадр)
        pg.locator('.rp-b.play').click(); p1 = st()['pos']; pg.wait_for_timeout(300); p2 = st()['pos']
        r('[%s] пауза срабатывает с первого нажатия' % tag, not st()['playing'] and p1 == p2)
        hits = 0
        for i in range(10):
            pg.locator('.rp-b.play').click(); pg.wait_for_timeout(60); hits += 1 if st()['playing'] == (i % 2 == 0) else 0
        r('[%s] 10 быстрых нажатий подряд — все 10 сработали' % tag, hits == 10)
        if st()['playing']: pg.locator('.rp-b.play').click()
        # перемотка: середина шкалы
        tr = pg.locator('.rp-range').bounding_box()
        pg.mouse.click(tr['x'] + tr['width'] * 0.5, tr['y'] + tr['height'] / 2); pg.wait_for_timeout(150)
        s = st(); r('[%s] щелчок по шкале — сразу в середину' % tag, abs(s['pos'] / s['TOTAL'] - 0.5) < 0.03)
        # быстрая перемотка туда-сюда: каждое положение отрабатывается без задержки
        t0 = time.time()
        pg.mouse.move(tr['x'] + tr['width'] * 0.5, tr['y'] + tr['height'] / 2); pg.mouse.down()
        for k in range(30): pg.mouse.move(tr['x'] + tr['width'] * (0.9 if k % 2 else 0.1), tr['y'] + tr['height'] / 2)
        pg.mouse.up(); el_ = time.time() - t0
        r('[%s] 30 рывков перемотки за %.2f с, положение верное' % (tag, el_), abs(st()['pos'] / st()['TOTAL'] - 0.9) < 0.07)
        # кнопки ±10 секунд
        before = st()['pos']; pg.locator('.rp-b[aria-label="Вперёд на 10 секунд"]').click(); pg.wait_for_timeout(80)
        r('[%s] «вперёд на 10 секунд» (при 32× это 320 секунд записи)' % tag, abs(st()['pos'] - min(st()['TOTAL'], before + 320000)) < 50)
        # приближение колесом к точке и перемещение
        v0 = st()['view']; fz = st()['fit']['z']
        if not touch:
            pg.mouse.move(w * 0.4, h * 0.35); pg.mouse.wheel(0, -100); pg.wait_for_timeout(100); pg.mouse.wheel(0, -100); pg.wait_for_timeout(100)
            v1 = st()['view']
            # точка под курсором стоит на месте
            wx0 = (w * 0.4 - v0['x']) / v0['z']; wx1 = (w * 0.4 - v1['x']) / v1['z']
            r('[%s] колесо приближает к курсору (×%.2f), точка под курсором на месте' % (tag, v1['z'] / v0['z']), v1['z'] > v0['z'] * 1.3 and abs(wx0 - wx1) < 0.5)
            pg.mouse.move(w * 0.5, h * 0.4); pg.mouse.down(); pg.mouse.move(w * 0.5 + 120, h * 0.4 + 60, steps=6); pg.mouse.up(); pg.wait_for_timeout(100)
            v2 = st()['view']
            r('[%s] перетаскивание двигает картинку' % tag, abs(v2['x'] - v1['x'] - 120) < 2 and abs(v2['y'] - v1['y'] - 60) < 2)
            r('[%s] перетаскивание не включило воспроизведение' % tag, not st()['playing'])
            pg.screenshot(path=OUT + 'zoomed%s.png' % tag)
            # двойной щелчок: приблизить, ещё раз — весь лист
            pg.mouse.dblclick(w * 0.3, h * 0.3); pg.wait_for_timeout(450)
            z3 = st()['view']['z']
            pg.mouse.dblclick(w * 0.3, h * 0.3); pg.wait_for_timeout(450)
            r('[%s] двойной щелчок приближает, второй — весь лист' % tag, z3 > fz * 2.2 and abs(st()['view']['z'] - fz) < 1e-6)
            r('[%s] двойной щелчок не ставит на паузу/воспроизведение' % tag, not st()['playing'])
            # одиночный щелчок — смотреть/пауза
            pg.mouse.click(w * 0.6, h * 0.3); pg.wait_for_timeout(450)
            r('[%s] одиночный щелчок по картинке — смотреть' % tag, st()['playing'])
            pg.mouse.click(w * 0.6, h * 0.3); pg.wait_for_timeout(450)
        else:
            # щипок двумя пальцами
            cdp = pg.context.new_cdp_session(pg)
            def touch(pts, typ):
                cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, (x, y) in enumerate(pts)]})
            cx, cy = w * 0.5, h * 0.35
            touch([(cx - 40, cy), (cx + 40, cy)], 'touchStart')
            for k in range(1, 8): touch([(cx - 40 - k * 12, cy), (cx + 40 + k * 12, cy)], 'touchMove')
            touch([], 'touchEnd'); pg.wait_for_timeout(150)
            r('[%s] щипок двумя пальцами приближает' % tag, st()['view']['z'] > v0['z'] * 1.6)
        # кнопки масштаба
        pg.locator('.rp-zl').click(); pg.wait_for_timeout(400)
        r('[%s] кнопка процентов возвращает весь лист' % tag, abs(st()['view']['z'] - fz) < 1e-6 and pg.inner_text('.rp-zl') == '100%')
        pg.locator('.rp-b[aria-label="Приблизить"]').click(); pg.wait_for_timeout(100)
        r('[%s] «+» приближает, проценты 140%%' % tag, pg.inner_text('.rp-zl') == '140%')
        # слежение за рукой: сначала, приближено, камера едет за рукой
        D("() => window.__replay.state()")
        pg.keyboard.press('Home'); pg.locator('.rp-speed').click(); pg.locator('.rp-mi', has_text='4×').click()
        pg.locator('.rp-b.follow').click(); pg.wait_for_timeout(400)
        if not st()['playing']: pg.keyboard.press('Space')
        pg.wait_for_timeout(2500)
        s = st(); v = s['view']
        r('[%s] слежение включено, приближено, камера двигалась' % tag, s['follow'] and v['z'] > fz * 1.3 and pg.locator('.rp-b.follow.on').count() == 1)
        pg.screenshot(path=OUT + 'follow%s.png' % tag)
        # клавиши
        pg.keyboard.press('Space'); pg.wait_for_timeout(50); pl = st()['playing']
        pg.keyboard.press('>'); r('[%s] клавиша > ускоряет' % tag, st()['speed'] == 8)
        pg.keyboard.press('0'); pg.wait_for_timeout(400); r('[%s] клавиша 0 — весь лист' % tag, abs(st()['view']['z'] - fz) < 1e-6)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
        r('[%s] Esc закрывает повтор' % tag, pg.locator('.rp').count() == 0)
        r('[%s] на доске ничего не изменилось' % tag, D("() => window.__doska.items.size") == 121)
        r('[%s] без ошибок' % tag, not errs)
        if errs: print(errs[:3])
        b.close()
run(1366, 820, False, 'pc')
run(390, 844, True, 'phone')
print('ИТОГ', sum(1 for _, v in res if v), 'из', len(res))
