# «Вандал»: тысячи случайных действий по доске и главному экрану. Ловим ошибки и нарушения правил.
# Запуск: python3 test/fuzz.py <seed> <steps> <desktop|tablet|phone> [student]
import sys, random, json, time, os
from playwright.sync_api import sync_playwright

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 1
STEPS = int(sys.argv[2]) if len(sys.argv) > 2 else 600
DEV = sys.argv[3] if len(sys.argv) > 3 else 'desktop'
ROLE = 'student' if len(sys.argv) > 4 and sys.argv[4] == 'student' else 'tutor'
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/fuzz/'
os.makedirs(OUT, exist_ok=True)
R = random.Random(SEED)
IMG = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/fuzz/img.png'
if not os.path.exists(IMG):
    from PIL import Image; im = Image.new('RGB', (640, 420), (255, 255, 255))
    from PIL import ImageDraw; d = ImageDraw.Draw(im); d.ellipse((60, 60, 400, 380), outline=(30, 90, 200), width=8); d.rectangle((300, 50, 600, 300), outline=(200, 40, 40), width=6); im.save(IMG)

DEVICES = {
    'desktop': dict(viewport={'width': 1366, 'height': 820}),
    'tablet': dict(viewport={'width': 1024, 'height': 740}, has_touch=True, is_mobile=True, device_scale_factor=2),
    'phone': dict(viewport={'width': 390, 'height': 780}, has_touch=True, is_mobile=True, device_scale_factor=3),
}
KEYS = ['v', 'h', 'p', 'e', 't', 'r', 'o', 'l', 'a', 'f', 'g', 'i', 'm', 'k', 'x', 's', 'd', 'n', 'u', 'b', '1', '2', '3', '0',
        'Escape', 'Escape', 'Delete', 'Backspace', 'Enter', 'Tab', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageDown', 'PageUp',
        'Control+z', 'Control+z', 'Control+y', 'Control+Shift+z', 'Control+a', 'Control+d', 'Control+c', 'Control+v', 'Control+x', 'Control+s', 'Control+o',
        'Shift+N', 'Shift+1', 'Control+=', 'Control+-', 'Control+0', 'Control+]', 'Control+[', 'Shift+Delete', 'Alt+ArrowLeft', 'F2', '?', '+', '-']
TEXTS = ['x^2+1', '\\frac{a}{b}', 'Ответ: 5', '', ' ', 'привет', 'sin(x)', '2x+3=7', 'ыыыыыыыыыыыыыыыыыыыыыыыыыыыыыыыыыыыыыыыыыыы', '<b>x</b>', '😀', 'a' * 300, '1/0', 'NaN', '{{CODE}}']

problems = []
log = []
def note(kind, msg, pg=None):
    key = kind + ':' + msg[:160]
    if any(p['key'] == key for p in problems): return
    shot = ''
    if pg:
        shot = OUT + f'{DEV}-{SEED}-{len(problems)}.png'
        try: pg.screenshot(path=shot)
        except Exception: shot = ''
    problems.append({'key': key, 'kind': kind, 'msg': msg, 'last': log[-12:], 'shot': shot})

CHECK = r"""() => {
  const out = [];
  const D = window.__doska;
  // страница не должна прокручиваться и вылезать за экран
  const se = document.scrollingElement; if (se && (se.scrollTop > 2 || se.scrollLeft > 2)) out.push('страница прокрутилась ' + se.scrollTop + ',' + se.scrollLeft);
  if (document.documentElement.scrollWidth > innerWidth + 2 && !document.querySelector('.home, .start-card')) out.push('ширина страницы больше экрана ' + document.documentElement.scrollWidth);
  // окна
  const modals = [...document.querySelectorAll('.modal, .am-back:not(.out):not(.under), .hp, .rp')];
  const amv = document.querySelectorAll('.am-back:not(.out):not(.under)').length; if (amv > 1) out.push('видно сразу ' + amv + ' окна аккаунта');
  if (document.querySelectorAll('.modal').length > 2) out.push('открыто больше двух окон');
  const top = modals[modals.length - 1];
  if (top) {
    const pnl = top.querySelector('.panel, .am, .dialog') || top.firstElementChild;
    if (pnl) { const r = pnl.getBoundingClientRect(); const x = Math.min(innerWidth - 2, Math.max(1, r.left + r.width / 2)), y = Math.min(innerHeight - 2, Math.max(1, r.top + Math.min(30, r.height / 2)));
      const e = document.elementFromPoint(x, y); if (e && !top.contains(e) && !e.closest('.tip, .toasts, .confetti, .ttip, .undo-stack')) out.push('окно перекрыто элементом ' + (e.className || e.tagName)); }
  }
  // всплывающие меню не выходят за экран
  for (const m of document.querySelectorAll('.pop, .tpl-menu, .bf-menu, .mat-menu, .acc-menu, .hwq, .selbar, .floating, .why-pop')) {
    const cs = getComputedStyle(m); if (m.hidden || cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0 || m.classList.contains('away')) continue;
    const r = m.getBoundingClientRect(); if (!r.width) continue;
    if (r.right > innerWidth + 3 || r.bottom > innerHeight + 3 || r.left < -3 || r.top < -3) out.push('за краем экрана: ' + m.className.split(' ').slice(0, 2).join('.') + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
  }
  if (D) {
    const S = D.S;
    if (!isFinite(S.view.x) || !isFinite(S.view.y) || !isFinite(S.view.z) || S.view.z <= 0) out.push('вид сломан ' + JSON.stringify(S.view));
    if (S.view.z > 50 || S.view.z < 0.01) out.push('масштаб вне пределов ' + S.view.z);
    const ym = D.doc.getMap('items'); if (ym.size !== D.items.size) out.push('кэш и документ разошлись ' + ym.size + '/' + D.items.size);
    const pages = new Set(D.pages().map((p) => p.id));
    if (!pages.size) out.push('нет ни одного листа');
    if (!pages.has(S.page)) out.push('текущий лист не существует');
    for (const it of D.items.values()) {
      for (const k of ['x', 'y', 'w', 'h', 's', 'z', 'x1', 'y1', 'x2', 'y2', 'sz', 'op', 'fs', 'size', 'rot']) if (k in it && it[k] != null && typeof it[k] === 'number' && !isFinite(it[k])) { out.push('нечисловое ' + k + ' у ' + it.type); break; }
      if (it.type === 'stroke' && Array.isArray(it.pts) && it.pts.some((v) => !isFinite(v))) out.push('NaN в линии');
      if (!it.type) out.push('объект без типа');
      if (it.s != null && it.s <= 0) out.push('масштаб объекта <= 0 у ' + it.type);
      if ((it.type === 'rect' || it.type === 'image' || it.type === 'ellipse') && (it.w < 0 || it.h < 0)) out.push('отрицательный размер у ' + it.type);
    }
    for (const id of S.sel) if (!D.items.has(id)) out.push('выделен несуществующий объект');
  }
  return out;
}"""

def visible_targets(pg):
    return pg.evaluate(r"""() => {
      const sel = 'button, [role=button], .mi, .chip, .tpl-open, .tpl-del, .hw-item, .page-tab, [data-page], input[type=checkbox], input[type=range], select, .sw, a[href]';
      const out = [];
      for (const e of document.querySelectorAll(sel)) {
        if (e.disabled) continue; const r = e.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.right < 0 || r.left > innerWidth || r.top > innerHeight) continue;
        const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.pointerEvents === 'none' || +cs.opacity === 0) continue;
        const x = r.left + r.width / 2, y = r.top + r.height / 2; const t = document.elementFromPoint(x, y); if (!t || !(e === t || e.contains(t) || t.contains(e))) continue;
        out.push({ x, y, t: (e.getAttribute('data-tip') || e.textContent || e.className || '').trim().slice(0, 40), type: e.type || '' });
      }
      return out;
    }""")

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(**DEVICES[DEV], accept_downloads=True)
    ctx.add_init_script("""(() => { if (!localStorage.getItem('doska:prefs')) localStorage.setItem('doska:prefs', JSON.stringify({name:'Вандал', role:'%s', roleFirst: 1, roleAt: 0}));
      if (!localStorage.getItem('doska:account')) localStorage.setItem('doska:account', JSON.stringify({email:'v@e.ru', since:1, pro:{period:'month', started:Date.now(), until:Date.now()+30*864e5, canceled:false, method:'card'}}));
      window.alert = (m) => { (window.__native = window.__native || []).push('alert:' + m); }; window.confirm = (m) => { (window.__native = window.__native || []).push('confirm:' + m); return true; }; window.prompt = (m) => { (window.__native = window.__native || []).push('prompt:' + m); return 'x'; };
    })()""" % ROLE)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: note('ошибка JS', str(e)[:300], pg))
    pg.on('console', lambda m: m.type == 'error' and not any(s in m.text for s in ('net::', 'Failed to load resource', 'WebSocket', 'ERR_', 'stun', 'favicon', 'goatcounter', 'trystero', 'nostr', 'wss://', 'relay'))  and note('ошибка в консоли', m.text[:300]))
    pg.on('filechooser', lambda fc: fc.set_files(IMG) if not fc.is_multiple() else fc.set_files([IMG]))
    pg.on('download', lambda d: None)
    pg.on('dialog', lambda d: (note('системное окно браузера', d.message[:120]), d.accept()))
    BASE = 'file:///home/claude/board/dist/site/index.html' if os.environ.get('SITE') else 'file:///home/claude/board/dist/doska.html'
    url = f'{BASE}?nopeer#r=fz{SEED:02d}-{DEV[:4]}-room'
    pg.goto(url); pg.wait_for_timeout(1800)
    W = DEVICES[DEV]['viewport']['width']; H = DEVICES[DEV]['viewport']['height']
    touch = DEVICES[DEV].get('has_touch')
    t0 = time.time()
    for step in range(STEPS):
        act = R.random()
        try:
            if not pg.url.startswith(BASE):
                log.append('ушли со страницы ' + pg.url); pg.goto(url); pg.wait_for_timeout(1000); continue
            if act < 0.34:
                ts = visible_targets(pg)
                if ts:
                    t = R.choice(ts); log.append(f'клик «{t["t"]}»')
                    if t['type'] == 'range':
                        pg.mouse.click(t['x'] + R.uniform(-40, 40), t['y'])
                    elif touch and R.random() < 0.5: pg.touchscreen.tap(t['x'], t['y'])
                    else: pg.mouse.click(t['x'], t['y'])
            elif act < 0.52:
                k = R.choice(KEYS); log.append('клавиша ' + k); pg.keyboard.press(k)
            elif act < 0.78:
                x0, y0 = R.uniform(10, W - 10), R.uniform(60, H - 10); x1, y1 = x0 + R.uniform(-300, 300), y0 + R.uniform(-250, 250)
                log.append(f'тянем {int(x0)},{int(y0)} → {int(x1)},{int(y1)}')
                pg.mouse.move(x0, y0); pg.mouse.down(); pg.mouse.move(x1, y1, steps=R.randint(2, 18)); pg.mouse.up()
            elif act < 0.84:
                d = R.uniform(-600, 600); log.append(f'колесо {int(d)}' + (' с Ctrl' if R.random() < 0.5 else ''))
                pg.mouse.move(R.uniform(50, W - 50), R.uniform(80, H - 50))
                if R.random() < 0.5: pg.keyboard.down('Control'); pg.mouse.wheel(0, d); pg.keyboard.up('Control')
                else: pg.mouse.wheel(R.uniform(-100, 100), d)
            elif act < 0.9:
                f = pg.evaluate("() => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable) ? a.tagName : '' }")
                txt = R.choice(TEXTS); log.append(f'печатаем «{txt[:20]}» в {f or "доску"}'); pg.keyboard.type(txt, delay=0)
            elif act < 0.93:
                x, y = R.uniform(10, W - 10), R.uniform(60, H - 10); log.append(f'правый клик {int(x)},{int(y)}'); pg.mouse.click(x, y, button='right')
            elif act < 0.96:
                x, y = R.uniform(10, W - 10), R.uniform(60, H - 10); log.append(f'двойной клик {int(x)},{int(y)}'); pg.mouse.dblclick(x, y)
            elif act < 0.975 and touch:
                x, y = R.uniform(20, W - 20), R.uniform(80, H - 20); log.append(f'касание {int(x)},{int(y)}'); pg.touchscreen.tap(x, y)
            elif act < 0.985:
                log.append('перезагрузка'); pg.reload(); pg.wait_for_timeout(1200)
            else:
                log.append('Escape ×3'); [pg.keyboard.press('Escape') for _ in range(3)]
            pg.wait_for_timeout(R.choice([0, 20, 60, 150]))
            for m in pg.evaluate(CHECK): note('нарушение', m, pg)
            nat = pg.evaluate("() => { const a = window.__native || []; window.__native = []; return a; }")
            for m in nat: note('системное окно браузера', m[:150], pg)
        except Exception as e:
            s = str(e).split('\n')[0][:200]
            if 'Target page, context or browser has been closed' in s: break
            if 'Timeout' in s: note('зависание', s, pg)
            log.append('исключение ' + s)
    dt = time.time() - t0
    b.close()
print(json.dumps({'seed': SEED, 'dev': DEV, 'role': ROLE, 'steps': STEPS, 'sec': round(dt), 'problems': problems}, ensure_ascii=False, indent=1))
