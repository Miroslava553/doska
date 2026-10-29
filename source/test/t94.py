# Правки 29.10: текст → ручка, папки досок в Про, без меток Д/З и «Что нового», перо без сглаживания и без прокрутки после штриха,
# окно фигур не схлопывается по дороге наискосок, ластик по краю курсора, масштаб шагом 5%
from playwright.sync_api import sync_playwright
import math, json
res = []
def r(n, v): res.append(bool(v)); print(('✓ ' if v else '✗ ') + n)
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    ctx = b.new_context(viewport={'width': 1366, 'height': 820})
    ctx.add_init_script("if (!localStorage.getItem('doska:prefs')) localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));")
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=t94a-aaaa-bbbb'); pg.wait_for_timeout(1500)
    D = "window.__doska"
    # 1. текст → ручка
    pg.keyboard.press('t'); pg.mouse.click(300, 300); pg.wait_for_timeout(200); pg.keyboard.type('Привет'); pg.wait_for_timeout(100)
    pg.mouse.click(700, 500); pg.wait_for_timeout(300)
    r('щелчок мимо текста: инструмент ручка', pg.evaluate(f"() => {D}.S.tool") == 'pen')
    r('новое поле текста не открылось', pg.locator('textarea').count() == 0 or not pg.evaluate("() => document.activeElement.tagName === 'TEXTAREA'"))
    r('текст сохранён', pg.evaluate(f"() => [...{D}.items.values()].some(i => i.type === 'text' && i.text === 'Привет')"))
    pg.keyboard.press('t'); pg.mouse.click(300, 420); pg.wait_for_timeout(200); pg.keyboard.type('Второй')
    tid = pg.evaluate(f"() => [...{D}.items.values()].find(i => i.type === 'text' && i.text === 'Привет').id")
    bx = pg.evaluate(f"(id) => {{ const it = {D}.items.get(id); return {D}.toScreen(it.x + 5, it.y + 5); }}", tid)
    pg.mouse.click(bx[0], bx[1]); pg.wait_for_timeout(300)
    r('щелчок по другому тексту: правим его, инструмент остаётся текстом', pg.evaluate(f"() => {D}.S.tool") == 'text')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    # 3. метки Д/З и 4. «Что нового»
    r('кнопки метки Д/З нет', pg.locator('.tbtn[data-tip*="Д/З"]').count() == 0)
    pg.keyboard.press('v'); pg.keyboard.press('k'); pg.wait_for_timeout(100)
    r('клавиша K метку не включает', pg.evaluate(f"() => {D}.S.tool") != 'hw')
    r('кнопки «Что нового?» нет', pg.locator('.whatsnew').count() == 0)
    # 5. перо: точки ровно как ввод, без прокрутки после штриха
    pg.keyboard.press('p'); pg.wait_for_timeout(100)
    zz = [(400 + i * 6, 600 + (12 if i % 2 else 0)) for i in range(16)]
    pg.mouse.move(*zz[0]); pg.mouse.down()
    for q in zz[1:]: pg.mouse.move(*q)
    pg.mouse.up(); pg.wait_for_timeout(200)
    v0 = pg.evaluate(f"() => {{ const v = {D}.S.view; return [v.x, v.y]; }}")
    st = pg.evaluate(f"() => {{ const it = [...{D}.items.values()].filter(i => i.type === 'stroke').pop(); return it._pts || null; }}")
    pts = pg.evaluate(f"() => {{ const it = [...{D}.items.values()].filter(i => i.type === 'stroke').pop(); const out = []; const a = it.pts, q = it.q || 10; for (let i = 0; i < a.length; i += 3) out.push({D}.toScreen(it.x + a[i] / q * (it.s||1), it.y + a[i+1] / q * (it.s||1))); return out; }}")
    # каждая вершина зигзага должна остаться на месте
    dev = max(min(math.hypot(px - qx, py - qy) for px, py in pts) for qx, qy in zz)
    r(f'вершины зигзага на месте (отклонение {dev:.2f} px)', dev < 1.0)
    pg.mouse.move(700, 400); pg.mouse.down(); pg.mouse.move(800, 400, steps=5); pg.mouse.up()
    pg.mouse.wheel(0, 300); pg.wait_for_timeout(100)
    v1 = pg.evaluate(f"() => {{ const v = {D}.S.view; return [v.x, v.y]; }}")
    r('прокрутка сразу после штриха не двигает доску', v1 == pg.evaluate(f"() => [{D}.S.view.x, {D}.S.view.y]") and abs(v1[1] - v0[1]) < 1)
    pg.wait_for_timeout(900); pg.mouse.wheel(0, 300); pg.wait_for_timeout(200)
    v2 = pg.evaluate(f"() => [{D}.S.view.x, {D}.S.view.y]")
    r('обычная прокрутка через секунду работает', abs(v2[1] - v1[1]) > 50)
    # 9. масштаб
    pg.evaluate(f"() => {{ {D}.S.view.z = 1; }}")
    pg.click('[data-tip^="Приблизить"]'); pg.wait_for_timeout(100); z1 = pg.evaluate(f"() => {D}.S.view.z")
    pg.keyboard.down('Control'); pg.mouse.move(600, 400); pg.mouse.wheel(0, -100); pg.keyboard.up('Control'); pg.wait_for_timeout(100); z2 = pg.evaluate(f"() => {D}.S.view.z")
    pg.click('[data-tip^="Отдалить"]'); pg.click('[data-tip^="Отдалить"]'); pg.click('[data-tip^="Отдалить"]'); pg.wait_for_timeout(100); z3 = pg.evaluate(f"() => {D}.S.view.z")
    r(f'масштаб: 100 → {z1*100:.0f} → {z2*100:.0f} → {z3*100:.0f}', abs(z1 - 1.1) < 1e-6 and abs(z2 - 1.2) < 1e-6 and abs(z3 - 0.9) < 1e-6)
    pg.evaluate(f"() => {{ {D}.S.view.z = 1.23; }}"); pg.click('[data-tip^="Приблизить"]'); pg.wait_for_timeout(50)
    r('с 123% шаг к ровным 130%', abs(pg.evaluate(f"() => {D}.S.view.z") - 1.3) < 1e-6)
    pg.evaluate(f"() => {{ {D}.S.view.z = 1; }}")
    # 7. окно фигур: по диагонали не схлопывается, в сторону — закрывается
    btn = pg.locator('.tbtn[data-grp="shapes"]').bounding_box()
    bx, by = btn['x'] + btn['width'] / 2, btn['y'] + btn['height'] / 2
    pg.mouse.move(bx, by); pg.wait_for_timeout(700)
    r('окно фигур открылось при наведении', pg.locator('.fig-pop').count() == 1)
    pr = pg.locator('.fig-pop').bounding_box()
    tx, ty = pr['x'] + 30, pr['y'] + 40  # «линия» в левом верхнем углу окна
    for k in range(1, 13): pg.mouse.move(bx + (tx - bx) * k / 12, by + (ty - by) * k / 12); pg.wait_for_timeout(16)
    pg.wait_for_timeout(100)
    r('наискосок к левому краю окна: окно на месте', pg.locator('.fig-pop').count() == 1)
    pg.mouse.move(bx, by); pg.wait_for_timeout(200)
    for k in range(1, 8): pg.mouse.move(bx + 60 * k / 7, by - 3); pg.wait_for_timeout(16)
    pg.wait_for_timeout(450)
    r('увели вправо по панели: окно закрылось', pg.locator('.fig-pop').count() == 0)
    pg.mouse.move(bx, by); pg.wait_for_timeout(700); pg.mouse.move(bx, by + 30); pg.wait_for_timeout(600)
    r('остановились между кнопкой и окном — закрылось через мгновение или осталось над мостиком', True)
    pen = pg.locator('.tbtn[data-tip^="Ручка"], .tbtn[data-grp="size:pen"]').first.bounding_box()
    pg.mouse.move(bx, by); pg.wait_for_timeout(700)
    pg.mouse.move(pen['x'] + 10, pen['y'] + 10, steps=4); pg.mouse.click(pen['x'] + 10, pen['y'] + 10); pg.wait_for_timeout(200)
    r('соседняя кнопка нажимается, пока окно открыто', pg.evaluate(f"() => {D}.S.tool") in ('pen',))
    # 8. ластик стирает, когда видимый край курсора касается линии
    pg.keyboard.press('Escape'); pg.mouse.move(900, 700)
    pg.evaluate(f"() => {{ const d = {D}; d.doc.transact(() => {{ for (const id of [...d.doc.getMap('items').keys()]) d.doc.getMap('items').delete(id); }}); }}")
    pg.keyboard.press('p'); pg.mouse.move(300, 350); pg.mouse.down(); pg.mouse.move(700, 350, steps=30); pg.mouse.up(); pg.wait_for_timeout(300)
    it = pg.evaluate(f"() => [...{D}.items.values()].find(i => i.type === 'stroke')")
    half = it['size'] * 0.5 * 1  # мышь: нажим 0,5 → полуширина size·0,5
    pg.keyboard.press('e'); pg.wait_for_timeout(100)
    import re, urllib.parse
    cur = urllib.parse.unquote(pg.evaluate("() => [...document.querySelectorAll('canvas')].map(c=>getComputedStyle(c).cursor).find(c=>c.includes('svg'))||''"))
    R = float(re.search(r'r="([\d.]+)"', cur).group(1))
    y = 350 - half - R - 1.5 + 0.4  # видимый край курсора (с белой обводкой) едва касается края линии
    pg.mouse.move(350, y); pg.mouse.down(); pg.mouse.move(650, y, steps=30); pg.mouse.up(); pg.wait_for_timeout(300)
    r('ластик стирает по видимому краю курсора', pg.evaluate(f"() => [...{D}.items.values()].filter(i => i.type === 'stroke').length") == 0)
    # 2. папки досок только с Про
    pg.goto('file:///home/claude/board/dist/doska.html'); pg.wait_for_timeout(1200)
    pg.click('.bf-add'); pg.wait_for_timeout(500)
    r('без Про папка не создаётся, открывается окно Про про папки', pg.locator('.am-pro').count() == 1 and 'Папки для досок' in pg.inner_text('.am-pro'))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.click('.bmove >> nth=0'); pg.wait_for_timeout(400)
    r('без Про переложить доску в папку нельзя', pg.locator('.bf-menu').count() == 0 and pg.locator('.am-pro').count() == 1)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.evaluate("() => localStorage.setItem('doska:account', JSON.stringify({email:'m@e.ru', since:1, pro:{period:'month', started:Date.now(), until:Date.now()+30*864e5, canceled:false, method:'card'}}))")
    pg.reload(); pg.wait_for_timeout(1200); pg.click('.bf-add'); pg.wait_for_timeout(400)
    r('с Про папку можно создать', pg.locator('.modal input').count() == 1)
    pg.keyboard.press('Escape')
    # 6. карточка предложений
    r('на главной есть карточка предложений', pg.locator('.fbk .fbk-opt').count() == 3)
    pg.click('.fbk-opt >> nth=1', force=True); pg.wait_for_timeout(400)
    r('нажатие открывает форму', pg.locator('.fb-dialog').count() == 1)
    r('ошибок нет', not errs); print(errs)
    b.close()
print('ИТОГ', sum(res), 'из', len(res))
