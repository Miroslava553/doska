// Безопасный разбор математических выражений (без eval).
// Поддержка: + - * / ^, скобки, |x|, неявное умножение (2x, 3sin(x), (x+1)(x-1)),
// функции sin cos tg/tan ctg/cot arcsin arccos arctg sqrt cbrt abs exp ln lg log floor ceil sign,
// константы pi/π, e; переменные x (t — синоним) и y, десятичная запятая "0,5".
// Любая другая латинская буква (a, b, k…) — параметр: его значение берётся из env.p (ползунок в окне графика).
// Уравнения с x и y (окружность (x-1)^2+(y+2)^2=9) и кусочные функции: "x^2+2, x >= -1; -2x+1, x < -1".

const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, tg: Math.tan,
  cot: (x) => 1 / Math.tan(x), ctg: (x) => 1 / Math.tan(x),
  asin: Math.asin, arcsin: Math.asin, acos: Math.acos, arccos: Math.acos,
  atan: Math.atan, arctan: Math.atan, arctg: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp,
  ln: Math.log, lg: Math.log10, log: Math.log10, floor: Math.floor, ceil: Math.ceil,
  sign: Math.sign, sgn: Math.sign,
};
const NAMES = [...Object.keys(FUNCS), 'pi'].sort((a, b) => b.length - a.length);

function tokenize(src) {
  const s = src
    .replace(/[−–—]/g, '-').replace(/[×·∙]/g, '*').replace(/÷/g, '/')
    .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/π/g, 'pi').replace(/√/g, 'sqrt').replace(/²/g, '^2').replace(/³/g, '^3')
    .replace(/(\d),(\d)/g, '$1.$2').toLowerCase();
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
      if (s[j] === 'e' && /[0-9+-]/.test(s[j + 1] || '') && /[0-9]/.test(s[j + 1] === '+' || s[j + 1] === '-' ? s[j + 2] || '' : s[j + 1])) {
        j += 2; while (j < s.length && /[0-9]/.test(s[j])) j++;
      }
      const v = parseFloat(s.slice(i, j));
      if (Number.isNaN(v)) throw new Error('Не понимаю число: ' + s.slice(i, j));
      out.push({ t: 'num', v }); i = j; continue;
    }
    if (/[a-z]/.test(c)) {
      const name = NAMES.find((n) => s.startsWith(n, i));
      if (name) { out.push(name === 'pi' ? { t: 'num', v: Math.PI } : { t: 'fn', v: name }); i += name.length; continue; }
      if (c === 'x' || c === 't') { out.push({ t: 'var' }); i++; continue; }
      if (c === 'y') { out.push({ t: 'vary' }); i++; continue; }
      if (c === 'e') { out.push({ t: 'num', v: Math.E }); i++; continue; }
      out.push({ t: 'par', v: c }); i++; continue; // параметр: a, b, k…
    }
    if ((c === '<' || c === '>') && s[i + 1] === '=') { out.push({ t: c + '=' }); i += 2; continue; }
    if ('+-*/^()|<>='.includes(c)) { out.push({ t: c }); i++; continue; }
    throw new Error('Лишний символ: ' + c);
  }
  return out;
}

function parseExpr(text, env = { p: {} }) {
  if (!text.trim()) throw new Error('Пустое выражение');
  const tk = tokenize(text);
  let p = 0;
  let absDepth = 0;
  const peek = () => tk[p];
  const eat = (t) => { if (tk[p] && tk[p].t === t) { p++; return true; } return false; };
  const startsAtom = (k) => k && (k.t === 'num' || k.t === 'var' || k.t === 'vary' || k.t === 'par' || k.t === 'fn' || k.t === '(' || (k.t === '|' && absDepth === 0));

  function expr() {
    let a = term();
    for (;;) {
      if (eat('+')) { const l = a, r = term(); a = (x, y) => l(x, y) + r(x, y); }
      else if (eat('-')) { const l = a, r = term(); a = (x, y) => l(x, y) - r(x, y); }
      else return a;
    }
  }
  function term() {
    let a = unary();
    for (;;) {
      if (eat('*')) { const l = a, r = unary(); a = (x, y) => l(x, y) * r(x, y); }
      else if (eat('/')) { const l = a, r = unary(); a = (x, y) => l(x, y) / r(x, y); }
      else if (startsAtom(peek())) { const l = a, r = power(); a = (x, y) => l(x, y) * r(x, y); }
      else return a;
    }
  }
  function unary() {
    if (eat('-')) { const a = unary(); return (x, y) => -a(x, y); }
    if (eat('+')) return unary();
    return power();
  }
  function power() {
    const base = atom();
    if (eat('^')) { const ex = unary(); return (x, y) => Math.pow(base(x, y), ex(x, y)); }
    return base;
  }
  function atom() {
    const k = tk[p++];
    if (!k) throw new Error('Выражение оборвалось');
    if (k.t === 'num') { const v = k.v; return () => v; }
    if (k.t === 'var') return (x) => x;
    if (k.t === 'vary') return (x, y) => y;
    if (k.t === 'par') { const n = k.v; return () => { const v = env.p[n]; return v == null ? 1 : v; }; }
    if (k.t === '(') { const a = expr(); if (!eat(')')) throw new Error('Не закрыта скобка'); return a; }
    if (k.t === '|') { absDepth++; const a = expr(); absDepth--; if (!eat('|')) throw new Error('Не закрыт модуль |…|'); return (x, y) => Math.abs(a(x, y)); }
    if (k.t === 'fn') {
      const f = FUNCS[k.v];
      let arg;
      if (eat('(')) { arg = expr(); if (!eat(')')) throw new Error('Не закрыта скобка'); }
      else arg = power(); // sin x, sin 2x
      if (eat('^')) { const ex = unary(); return (x, y) => Math.pow(f(arg(x, y)), ex(x, y)); } // sin(x)^2
      return (x, y) => f(arg(x, y));
    }
    throw new Error('Неожиданный символ: ' + k.t);
  }
  const fn = expr();
  if (p < tk.length) {
    if (tk.slice(p).some((k) => ['<', '>', '<=', '>='].includes(k.t))) throw new Error('Условие пишется после запятой: x^2, x > 0');
    if (tk.slice(p).some((k) => k.t === '=')) throw new Error('Знак «=» должен быть один');
    throw new Error('Не понимаю: ' + tk.slice(p).map((k) => k.v ?? k.t).join(''));
  }
  return { fn, hasY: tk.some((k) => k.t === 'vary'), hasX: tk.some((k) => k.t === 'var'), pars: [...new Set(tk.filter((k) => k.t === 'par').map((k) => k.v))] };
}
// Условие: цепочка сравнений «x >= -1», «-1 < x <= 2»
function parseCond(text, env) {
  const parts = text.split(/(<=|>=|<|>)/).map((t) => t.trim());
  if (parts.length < 3) throw new Error('Условие должно быть сравнением, например x >= 0');
  const vals = [], ops = [], info = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2) { ops.push(parts[i]); continue; }
    const r = parseExpr(parts[i], env); vals.push(r.fn); info.push({ isX: /^[xt]$/i.test(parts[i]), free: !r.hasX && !r.hasY });
  }
  const cmp = { '<': (a, b) => a < b, '<=': (a, b) => a <= b + 1e-12, '>': (a, b) => a > b, '>=': (a, b) => a >= b - 1e-12 };
  const test = (x, y) => { for (let i = 0; i < ops.length; i++) if (!cmp[ops[i]](vals[i](x, y), vals[i + 1](x, y))) return false; return true; };
  // концы промежутка по x (для точек на концах кусков): x >= -1 — конец входит, x < 2 — не входит
  test.ends = [];
  for (let i = 0; i < ops.length; i++) {
    const a = info[i], b = info[i + 1];
    const other = a.isX && b.free ? vals[i + 1] : b.isX && a.free ? vals[i] : null;
    if (other) test.ends.push({ at: () => other(0, 0), incl: ops[i].includes('=') });
  }
  return test;
}
// Область: цепочка сравнений. Если с одной стороны каждого сравнения стоит y (или x), а с другой — выражение без него,
// область рисуем по столбцам (по строкам) ровно; иначе — закрашиваем клетки, где неравенство выполнено.
function parseRegion(text, env) {
  const parts = text.split(/(<=|>=|<|>)/).map((t) => t.trim());
  if (parts.length < 3 || parts.some((t) => !t)) throw new Error('Неравенство записано не полностью, например y > x^2');
  const info = [], ops = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2) { ops.push(parts[i]); continue; }
    const r = parseExpr(parts[i], env); info.push({ ...r, isX: /^[xt]$/i.test(parts[i]), isY: /^y$/i.test(parts[i]) });
  }
  const test = parseCond(text, env);
  const pars = [...new Set(info.flatMap((r) => r.pars))];
  const bounds = (isV, freeOf) => {
    const out = [];
    for (let i = 0; i < ops.length; i++) {
      const a = info[i], b = info[i + 1], op = ops[i], strict = !op.includes('=');
      if (isV(a) && freeOf(b)) out.push({ fn: b.fn, side: op[0] === '<' ? 'hi' : 'lo', strict });
      else if (isV(b) && freeOf(a)) out.push({ fn: a.fn, side: op[0] === '<' ? 'lo' : 'hi', strict });
      else return null;
    }
    return out;
  };
  const yb = bounds((r) => r.isY, (r) => !r.hasY);
  if (yb) return { kind: 'ineq', mode: 'y', test, bounds: yb, pars };
  const xb = bounds((r) => r.isX, (r) => !r.hasX && !r.hasY);
  if (xb) return { kind: 'ineq', mode: 'x', test, bounds: xb, pars };
  const F = ops.length === 1 ? (x, y) => info[0].fn(x, y) - info[1].fn(x, y) : null;
  return { kind: 'ineq', mode: 'gen', test, F, strict: ops.length === 1 && !ops[0].includes('='), pars };
}

// Одна строка: функция y = f(x) или уравнение F(x, y) = G(x, y), по желанию с условием после запятой.
export function compile(src, env = { p: {} }) {
  let text = src.trim(), cond = null;
  // условие — после последней запятой вне скобок (запятая между цифрами — десятичная)
  let depth = 0, cut = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++; else if (c === ')') depth--;
    else if (c === ',' && depth === 0 && !(/\d/.test(text[i - 1] || '') && /\d/.test(text[i + 1] || ''))) cut = i;
  }
  if (cut >= 0) { cond = parseCond(text.slice(cut + 1), env); text = text.slice(0, cut).trim(); }
  // неравенство без «=» отдельно: область на плоскости (y > x^2, -1 < x <= 2, x^2 + y^2 < 9)
  if (/[<>]/.test(text) && !/(?<![<>])=/.test(text)) return { ...parseRegion(text, env), cond };
  const eq = text.split(/(?<![<>])=(?!=)/);
  if (eq.length > 2) throw new Error('Знак «=» должен быть один');
  if (eq.length === 2) {
    const L = eq[0].trim(), R = eq[1].trim();
    if (/^(y|[a-z]\s*\(\s*[xt]\s*\))$/i.test(L)) { const r = parseExpr(R, env); if (!r.hasY) return { kind: 'fn', fn: (x) => r.fn(x, 0), cond, ends: cond && cond.ends, pars: r.pars }; }
    const a = parseExpr(L, env), b = parseExpr(R, env);
    if (!a.hasY && !b.hasY && /^\s*x\s*$/i.test(L)) return { kind: 'vline', at: () => b.fn(0, 0), cond, pars: b.pars }; // x = 3 — вертикальная прямая
    return { kind: 'imp', F: (x, y) => a.fn(x, y) - b.fn(x, y), cond, pars: [...new Set([...a.pars, ...b.pars])] };
  }
  const r = parseExpr(text, env);
  if (r.hasY) throw new Error('Для кривой с y нужен знак «=», например x^2 + y^2 = 9');
  return { kind: 'fn', fn: (x) => r.fn(x, 0), cond, ends: cond && cond.ends, pars: r.pars };
}

// Точка: A(2; 3), (1,5; -2), B(a; a^2). Разделитель — точка с запятой; запятая — если её нельзя спутать с десятичной.
const PT_RE = /^\s*([A-Za-zА-ЯЁа-яё][A-Za-zА-ЯЁа-яё0-9_']*)?\s*\(\s*(.+)\s*\)\s*$/;
function splitPoint(inner) {
  if (inner.includes(';')) { const p = inner.split(';'); return p.length === 2 ? p : null; }
  let depth = 0, at = -1, n = 0;
  for (let i = 0; i < inner.length; i++) { const c = inner[i]; if (c === '(') depth++; else if (c === ')') depth--; else if (c === ',' && depth === 0) { n++; at = i; } }
  return n === 1 ? [inner.slice(0, at), inner.slice(at + 1)] : null;
}
function compilePoint(src, env) {
  const m = src.match(PT_RE); if (!m) return null;
  // f(x) = …, sin(x) и т. п. — не точки
  if (m[1] && /^(sin|cos|tg|tan|ctg|cot|ln|lg|log|sqrt|abs|exp|arcsin|arccos|arctg|f|g|h|y)$/i.test(m[1])) return null;
  const parts = splitPoint(m[2]); if (!parts) return null;
  const a = parseExpr(parts[0], env), b = parseExpr(parts[1], env);
  if (a.hasY || b.hasY || a.hasX || b.hasX) throw new Error('В координатах точки не может быть x или y: пишите числа, например A(2; 3)');
  return { kind: 'pt', name: m[1] || '', at: () => [a.fn(0, 0), b.fn(0, 0)], pars: [...new Set([...a.pars, ...b.pars])] };
}

// Окно графика: каждая строка — своя запись со своим цветом. В строке может быть кусочная функция (части через «;»),
// точка A(2; 3), вертикальная прямая x = 3, уравнение кривой. Ошибка в одной строке не мешает остальным.
export function compileRows(src, env = { p: {} }) {
  return String(src || '').split('\n').map((line) => {
    const text = line.trim();
    if (!text) return { src: line, empty: true };
    try {
      const pt = compilePoint(text, env);
      if (pt) return { src: text, ...pt };
      const pieces = text.split(';').map((s) => s.trim()).filter(Boolean).map((s) => ({ src: s, ...compile(s, env) }));
      if (!pieces.length) return { src: text, empty: true };
      return { src: text, kind: 'fns', pieces, pars: [...new Set(pieces.flatMap((q) => q.pars || []))] };
    } catch (e) { return { src: text, err: e.message }; }
  });
}


// Несколько функций через ";" или с новой строки.
export function compileMany(src, env) {
  return src.split(/[;\n]/).map((s) => s.trim()).filter(Boolean).map((s) => ({ src: s, ...compile(s, env) }));
}
