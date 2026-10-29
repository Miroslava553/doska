# Своё окно предложений на сайте с сервером, масштаб 10% и удержание кнопки, перо без мигания в конце
from playwright.sync_api import sync_playwright
import json, urllib.request, urllib.parse
C = 'http://127.0.0.1:4022'; S = 'http://127.0.0.1:4021/'
ctl = lambda p: json.loads(urllib.request.urlopen(C + p).read())
res = []
def r(n, v): res.append(bool(v)); print(('✓ ' if v else '✗ ') + n)
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    c = b.new_context(viewport={'width': 1366, 'height': 820})
    c.add_init_script("if (!localStorage.getItem('doska:prefs')) localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));")
    pg = c.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    pg.goto(S); pg.wait_for_timeout(1500)
    pg.click('.fbk-opt >> nth=1', force=True); pg.wait_for_timeout(300)
    r('открылось своё окно на вкладке «Проблема»', pg.locator('.fb-seg-b.on').inner_text() == 'Проблема')
    pg.click('.fb-send'); pg.wait_for_timeout(200)
    r('пустое не отправляется', 'пару слов' in pg.inner_text('.fb-dialog .err'))
    pg.click('.fb-seg-b >> nth=0'); pg.fill('.fb-ta', 'Хочу таблицы на доске'); pg.fill('.fb-dialog input[type=email]', 'ученик@mail.ru')
    pg.screenshot(path='/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/fbform.png')
    pg.click('.fb-send'); pg.wait_for_timeout(1200)
    r('спасибо после отправки', 'Спасибо' in pg.inner_text('.fb-dialog'))
    rows = ctl('/sql?q=' + urllib.parse.quote('select kind, text, contact, info from feedback'))
    r('сообщение сохранено на сервере', rows and rows[-1]['kind'] == 'idea' and rows[-1]['text'] == 'Хочу таблицы на доске' and 'экран' in rows[-1]['info'])
    r('письмо ушло владельцу', any('owner@lodl.test' in m for m in ctl('/mails')))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    r('Escape закрыл окно', pg.locator('.fb-dialog').count() == 0)
    # масштаб
    pg.fill('input[placeholder="Название новой доски"]', 'Масштаб'); pg.click('text=Создать'); pg.wait_for_timeout(1800)
    zp = pg.locator('[data-tip^="Приблизить"]'); zm = pg.locator('[data-tip^="Отдалить"]')
    z = lambda: pg.evaluate("() => window.__doska.S.view.z")
    zp.click(); pg.wait_for_timeout(100); r(f'щелчок по +: {z()*100:.0f}%', abs(z() - 1.1) < 1e-6)
    zm.click(); zm.click(); pg.wait_for_timeout(100); r(f'два щелчка по −: {z()*100:.0f}%', abs(z() - 0.9) < 1e-6)
    bb = zp.bounding_box(); pg.mouse.move(bb['x'] + 10, bb['y'] + 10); pg.mouse.down(); pg.wait_for_timeout(500); z1 = z(); pg.wait_for_timeout(700); z2 = z(); pg.wait_for_timeout(700); z3 = z(); pg.mouse.up(); pg.wait_for_timeout(300); z4 = z()
    r(f'удержание +: {z1*100:.0f}% → {z2*100:.0f}% → {z3*100:.0f}%, растёт всё быстрее', z1 < z2 < z3 and (z3 / z2) > (z2 / z1))
    r('отпустили — остановился', abs(z4 - z()) < 1e-9 and abs(z4 - z3) / z3 < 0.2)
    bb = zm.bounding_box(); pg.mouse.move(bb['x'] + 10, bb['y'] + 10); pg.mouse.down(); pg.wait_for_timeout(5000); pg.mouse.up()
    r(f'долгое удержание −: не меньше 10% ({z()*100:.0f}%)', z() >= 0.0999)
    pg.keyboard.down('Control'); pg.mouse.move(600, 400); pg.mouse.wheel(0, -100); pg.keyboard.up('Control'); pg.wait_for_timeout(100)
    r(f'Ctrl + колесо: шаг до ровных 10% ({z()*100:.0f}%)', abs(z() * 100 - round(z() * 10) * 10) < 1e-6)
    # конец линии: в кадре после отпускания линия видна (на верхнем слое или на основном)
    pg.evaluate("() => { window.__doska.S.view.z = 1; }")
    pg.keyboard.press('p')
    seen = pg.evaluate("""async () => {
      const cv = [...document.querySelectorAll('canvas')]; const out = [];
      const ink = () => cv.some(c => { const x = c.getContext('2d'); const k = c.width / innerWidth; const d = x.getImageData(Math.round(500 * k), Math.round(400 * k), 1, 1).data; return d[3] > 100 && d[0] < 120; });
      const el = cv[cv.length - 1], o = { bubbles: true, pointerId: 7, pointerType: 'mouse', isPrimary: true, buttons: 1, pressure: 0.5 };
      el.dispatchEvent(new PointerEvent('pointerdown', { ...o, clientX: 400, clientY: 400 }));
      for (let i = 1; i <= 20; i++) { el.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: 400 + i * 10, clientY: 400 })); await new Promise(r => requestAnimationFrame(r)); }
      el.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0, clientX: 600, clientY: 400 }));
      for (let f = 0; f < 12; f++) { await new Promise(r => requestAnimationFrame(r)); out.push(ink()); }
      return out; }""")
    r('после отпускания линия видна в каждом кадре: ' + ''.join('1' if v else '0' for v in seen), all(seen))
    r('ошибок нет', not errs); print(errs)
    b.close()
print('ИТОГ', sum(res), 'из', len(res))
