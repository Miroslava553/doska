# Быстрые линии мышью: целые координаты, ~125 Гц, рука немного «плывёт»
import math, random, sys
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/12fda196-4809-5a1d-8432-b3a634b3824b/scratchpad/'
tag = sys.argv[1]; random.seed(11)
def line(y0, speed, dirn=1):
    pts = []; x = 60 if dirn > 0 else 1140; t = 0
    while 50 <= x <= 1150:
        y = y0 + 0.012 * (x - 600) + 4 * math.sin(x / 210) + 1.5 * math.sin(x / 47)
        pts.append([round(x), round(y)]); x += dirn * speed * 0.008; t += 8
    return pts
def curve(cx, cy, r, speed):
    pts = []; n = int(2 * math.pi * r / (speed * 0.008))
    for i in range(n + 1):
        a = i / n * 2 * math.pi; pts.append([round(cx + r * math.cos(a)), round(cy + r * 0.7 * math.sin(a))])
    return pts
def zig(x0, y0, speed):  # галочка и зигзаг — острые углы должны остаться острыми
    pts = []; P = [(x0, y0), (x0 + 40, y0 + 50), (x0 + 130, y0 - 70), (x0 + 170, y0 + 30), (x0 + 210, y0 - 60), (x0 + 250, y0 + 30)]
    for (ax, ay), (bx, by) in zip(P, P[1:]):
        L = math.hypot(bx - ax, by - ay); n = max(1, int(L / (speed * 0.008)))
        for k in range(n): pts.append([round(ax + (bx - ax) * k / n), round(ay + (by - ay) * k / n)])
    pts.append(list(P[-1])); return pts
strokes = [line(120, 400), line(220, 1200), line(320, 2500, -1), curve(250, 520, 140, 1500), curve(620, 520, 140, 3000), zig(860, 520, 1500)]
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1200, 'height': 700})
    pg.add_init_script("localStorage.setItem('doska:prefs', JSON.stringify({name: 'Мира'}))")
    pg.goto('file:///home/claude/board/dist/doska.html?nopeer#r=mous-test-' + ('aaa1' if tag == 'before' else 'bbb2')); pg.wait_for_function('() => window.__doska'); pg.wait_for_timeout(200)
    pg.keyboard.press('KeyP'); pg.keyboard.press('Digit3')
    for s in strokes:
        pg.evaluate('''async (pts) => { const c = document.getElementById('cv-over');
          const mk = (t, [x, y], b) => new PointerEvent(t, {bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y, pressure: b ? 0.5 : 0, buttons: b, button: t === 'pointermove' ? -1 : 0});
          c.dispatchEvent(mk('pointerdown', pts[0], 1));
          for (const q of pts.slice(1)) { c.dispatchEvent(mk('pointermove', q, 1)); await new Promise(r => setTimeout(r, 8)); }
          c.dispatchEvent(mk('pointerup', pts[pts.length - 1], 0)); }''', s)
        pg.wait_for_timeout(100)
    pg.mouse.move(1190, 690); pg.wait_for_timeout(100)
    pg.screenshot(path=OUT + f'mouse-{tag}.png')
    b.close()
print('ok')
