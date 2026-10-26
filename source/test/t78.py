# Шторка едет вместе с ответом: перетаскивание, часть ответа, масштаб, отмена, ластик, копия листа, удаление,
# открытая шторка, «на передний план», выгрузка в PNG. Ученик подключён по сети и не должен видеть ответ ни в какой момент.
from playwright.sync_api import sync_playwright
from PIL import Image
import io
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
URL = 'file:///home/claude/board/dist/doska.html?nopeer#r=shmv-test-room'
errs = []
def dark(pg, box):
    im = Image.open(io.BytesIO(pg.screenshot(clip={'x': box[0], 'y': box[1], 'width': box[2] - box[0], 'height': box[3] - box[1]}))).convert('L')
    return sum(1 for v in im.getdata() if v < 90)
with sync_playwright() as p:
    b = p.chromium.launch()
    cA = b.new_context(viewport={'width': 1200, 'height': 800})
    cA.add_init_script("""localStorage.setItem('doska:prefs', JSON.stringify({name:'Мира', role:'tutor', roleFirst: 1, roleAt: 0}));
      localStorage.setItem('doska:account', JSON.stringify({email:'m@e.ru', since:1, pro:{period:'month', started:Date.now(), until:Date.now()+30*864e5, canceled:false, method:'card'}}));""")
    cB = b.new_context(viewport={'width': 1200, 'height': 800})
    cB.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name:'Петя', role:'student', roleFirst: 1, roleAt: 0}))")
    A = cA.new_page(); B = cB.new_page()
    for pg in (A, B):
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.goto(URL); pg.wait_for_function('() => window.__doska'); pg.wait_for_timeout(1500)
    offer = A.evaluate('''async () => { const { hub } = window.__doska; const mc = new window.__MC(hub); window.__mc = mc; return await mc.createOffer(); }''')
    answer = B.evaluate('''async (o) => { const { hub } = window.__doska; const mc = new window.__MC(hub); window.__mc = mc; return await mc.acceptOffer(o); }''', offer)
    A.evaluate('async (a) => window.__mc.acceptAnswer(a)', answer)
    A.wait_for_function('() => window.__doska.hub.status().peers.length > 0', timeout=15000); A.wait_for_timeout(800)
    # одинаковый вид у обоих, чтобы сравнивать по пикселям
    for pg in (A, B): pg.evaluate("() => { const S = window.__doska.S; S.view.x = 0; S.view.y = 0; S.view.z = 1; }")
    def drag(pg, a, c, steps=14):
        pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move(*c, steps=steps); pg.mouse.up(); pg.wait_for_timeout(150)
    # репетитор пишет «10» двумя линиями
    A.keyboard.press('p'); A.evaluate("() => window.__doska.setTool('pen')")
    drag(A, (200, 300), (230, 420)); drag(A, (280, 300), (330, 420))
    A.keyboard.press('v'); drag(A, (150, 250), (400, 470)); A.wait_for_timeout(200)
    A.click('.selbar [data-tip^="Скрыть ответ"]'); A.wait_for_timeout(600)
    def shade(pg): return pg.evaluate("() => { const s = [...window.__doska.items.values()].find(i => i.type === 'shade'); return s && [Math.round(s.x), Math.round(s.y), Math.round(s.w), Math.round(s.h), s.open, (s.cover||[]).length]; }")
    def ok_student(tag, box):
        B.mouse.move(1150, 780); B.wait_for_timeout(500)
        d = dark(B, box); print(f'{tag}: у ученика тёмных точек в месте ответа', d); return d
    print('шторка', shade(A), 'у ученика', shade(B))
    ok_student('1 закрыто', (150, 260, 400, 460))
    # 1. репетитор тащит весь ответ, ученик смотрит в середине движения
    A.keyboard.press('v'); drag(A, (150, 250), (400, 470))   # выделяем снова (шторку не выделить)
    print('выделено', A.evaluate("() => [...window.__doska.S.sel].map(i => window.__doska.items.get(i).type)"))
    A.mouse.move(215, 360); A.mouse.down(); A.mouse.move(415, 360, steps=10); A.wait_for_timeout(300)
    A.screenshot(path=OUT + 'shm1-drag.png'); B.wait_for_timeout(300); B.screenshot(path=OUT + 'shm1-drag-b.png'); print('ученик во время перетаскивания, тёмных точек', dark(B, (100, 250, 700, 470)))
    print('шторка во время перетаскивания у репетитора', shade(A), '(сохранена старая, рисуется новая)')
    A.mouse.move(615, 360, steps=10); A.mouse.up(); A.wait_for_timeout(500)
    print('шторка после', shade(A), 'у ученика', shade(B))
    ok_student('2 после переноса', (550, 260, 800, 460))
    A.mouse.move(1150, 780); A.screenshot(path=OUT + 'shm2-after.png')
    # 2. тащим только одну линию далеко: шторка растягивается на обе
    A.keyboard.press('Escape'); A.mouse.click(1000, 700)
    A.evaluate("() => { const D = window.__doska; const s = [...D.items.values()].filter(i => i.type === 'stroke').sort((a,b)=>a.z-b.z); D.S.sel = new Set([s[0].id]); }")
    A.mouse.move(615, 360); A.mouse.down(); A.mouse.move(615, 600, steps=8); A.mouse.up(); A.wait_for_timeout(500)
    print('одна линия ниже: шторка', shade(A))
    ok_student('3 часть ответа унесли', (550, 480, 800, 720))
    # 3. отмена
    A.keyboard.press('Control+z'); A.wait_for_timeout(500); print('после отмены', shade(A), 'у ученика', shade(B))
    # 4. масштаб выделенного через ползунок не трогаем; ластиком режем линию пополам
    A.keyboard.press('Escape'); A.keyboard.press('e')
    before = A.evaluate("() => [...window.__doska.items.values()].filter(i => i.type === 'stroke').length")
    drag(A, (560, 360), (680, 360), 20); A.wait_for_timeout(500)
    after = A.evaluate("() => [...window.__doska.items.values()].filter(i => i.type === 'stroke').length")
    print('ластик: линий было', before, 'стало', after, 'шторка', shade(A), 'у ученика', shade(B))
    ok_student('4 после ластика', (500, 250, 860, 480))
    # 5. «На передний план» для ответа: ученик всё равно не видит
    A.keyboard.press('v')
    A.evaluate("() => { const D = window.__doska; D.S.sel = new Set([...D.items.values()].filter(i => i.type === 'stroke').map(i => i.id)); }")
    A.keyboard.press('Control+]'); A.evaluate("() => { const D = window.__doska; const top = Math.max(...[...D.items.values()].map(i => i.z)); D.act(() => { for (const id of D.S.sel) D.doc.getMap('items').get(id).set('z', top + 1); }); }")
    A.wait_for_timeout(400)
    ok_student('5 ответ поверх шторки', (500, 250, 860, 480))
    # 6. выгрузка PNG у репетитора: ответа не видно даже бледно
    png = A.evaluate("""() => new Promise(r => { const D = window.__doska; const it = [...D.items.values()]; r(it.length); })""")
    # 7. открыть шторку и подвинуть
    A.keyboard.press('Escape'); A.mouse.move(1150, 780); A.wait_for_timeout(300)
    A.click('.shadebar .shb'); A.wait_for_timeout(500)
    print('открыта', shade(A)[4], 'ученик видит открытый ответ:', dark(B, (500, 250, 860, 480)) > 50)
    A.click('.shadebar .shb'); A.wait_for_timeout(500); print('снова закрыта', not shade(A)[4])
    # 8. копия листа
    A.evaluate("() => { document.querySelector('.page-tab, [data-page]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 40 })); }"); A.wait_for_timeout(300)
    if A.locator('text=Дублировать лист').count(): A.click('text=Дублировать лист'); A.wait_for_timeout(700)
    cp = A.evaluate("() => { const D = window.__doska; const sh = [...D.items.values()].filter(i => i.type === 'shade'); return sh.map(s => [s.page === D.S.page, (s.cover||[]).every(id => D.items.get(id)?.page === s.page), s.cover.length]); }")
    print('копия листа: шторки', cp)
    B.evaluate("() => { const D = window.__doska; D.setPage(D.pages()[D.pages().length - 1].id); const S = D.S; S.view.x = 0; S.view.y = 0; S.view.z = 1; }"); B.wait_for_timeout(500)
    ok_student('8 на копии листа', (500, 250, 860, 480))
    # 9. удалить закрытое: шторка пропадает; отмена возвращает
    A.evaluate("() => { const D = window.__doska; D.S.sel = new Set([...D.items.values()].filter(i => i.type === 'stroke' && i.page === D.S.page).map(i => i.id)); }")
    A.keyboard.press('Delete'); A.wait_for_timeout(400)
    print('после удаления шторка пустая', A.evaluate("() => { const D = window.__doska; return [...D.items.values()].filter(i => i.type === 'shade' && i.page === D.S.page).map(s => s._empty); }"), 'кнопок', A.locator('.shadebar').count())
    A.keyboard.press('Control+z'); A.wait_for_timeout(400)
    print('после отмены', A.evaluate("() => { const D = window.__doska; return [...D.items.values()].filter(i => i.type === 'shade' && i.page === D.S.page).map(s => s._empty); }"), 'кнопок', A.locator('.shadebar').count())
    print(A.evaluate("() => { const D = window.__doska; return [JSON.stringify(D.S.view), D.pageItems().map(i => [i.type, Math.round(i.x), Math.round(i.y), i.w, i._empty])]; }"))
    A.mouse.move(1150, 780); A.screenshot(path=OUT + 'shm9.png'); B.screenshot(path=OUT + 'shm9b.png')
    A.evaluate("() => window.__doska.hist().open()"); A.wait_for_timeout(1200); A.screenshot(path=OUT + 'shm-hist.png')
    B.evaluate("() => window.__doska.hist().open()"); B.wait_for_timeout(1200)
    B.screenshot(path=OUT + 'shm-hist-b.png'); print('у ученика открылось', B.locator('.hp').count(), 'окно Про', B.locator('.pw-top, .am').count())
    print(errs); b.close()
