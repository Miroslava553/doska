// Безопасный разбор математических выражений (без eval).
// Поддержка: + - * / ^, скобки, |x|, неявное умножение (2x, 3sin(x), (x+1)(x-1)),
// функции sin cos tg/tan ctg/cot arcsin arccos arctg sqrt cbrt abs exp ln lg log floor ceil sign,
// константы pi/π, e; переменные x (t — синоним) и y, десятичная запятая "0,5".
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
      throw new Error('Неизвестное имя: ' + s.slice(i).match(/^[a-z]+/)[0]);
    }
    if ((c === '<' || c === '>') && s[i + 1] === '=') { out.push({ t: c + '=' }); i += 2; continue; }
    if ('+-*/^()|<>='.includes(c)) { out.push({ t: c }); i++; continue; }
    throw new Error('Лишний символ: ' + c);
  }
  return out;
}

function parseExpr(text) {
  if (!text.trim()) throw new Error('Пустое выражение');
  const tk = tokenize(text);
  let p = 0;
  let absDepth = 0;
  const peek = () => tk[p];
  const eat = (t) => { if (tk[p] && tk[p].t === t) { p++; return true; } return false; };
  const startsAtom = (k) => k && (k.t === 'num' || k.t === 'var' || k.t === 'vary' || k.t === 'fn' || k.t === '(' || (k.t === '|' && absDepth === 0));

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
  return { fn, hasY: tk.some((k) => k.t === 'vary') };
}
// Условие: цепочка сравнений «x >= -1», «-1 < x <= 2»
function parseCond(text) {
  const parts = text.split(/(<=|>=|<|>)/).map((t) => t.trim());
  if (parts.length < 3) throw new Error('Условие должно быть сравнением, например x >= 0');
  const vals = [], ops = [];
  for (let i = 0; i < parts.length; i++) (i % 2 ? ops : vals).push(i % 2 ? parts[i] : parseExpr(parts[i]).fn);
  const cmp = { '<': (a, b) => a < b, '<=': (a, b) => a <= b + 1e-12, '>': (a, b) => a > b, '>=': (a, b) => a >= b - 1e-12 };
  return (x, y) => { for (let i = 0; i < ops.length; i++) if (!cmp[ops[i]](vals[i](x, y), vals[i + 1](x, y))) return false; return true; };
}
// Одна строка: функция y = f(x) или уравнение F(x, y) = G(x, y), по желанию с условием после запятой.
export function compile(src) {
  let text = src.trim(), cond = null;
  // условие — после последней запятой вне скобок (запятая между цифрами — десятичная)
  let depth = 0, cut = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++; else if (c === ')') depth--;
    else if (c === ',' && depth === 0 && !(/\d/.test(text[i - 1] || '') && /\d/.test(text[i + 1] || ''))) cut = i;
  }
  if (cut >= 0) { cond = parseCond(text.slice(cut + 1)); text = text.slice(0, cut).trim(); }
  const eq = text.split(/(?<![<>])=(?!=)/);
  if (eq.length > 2) throw new Error('Знак «=» должен быть один');
  if (eq.length === 2) {
    const L = eq[0].trim(), R = eq[1].trim();
    if (/^(y|f\s*\(\s*[xt]\s*\))$/i.test(L)) { const r = parseExpr(R); if (!r.hasY) return { kind: 'fn', fn: (x) => r.fn(x, 0), cond }; }
    const a = parseExpr(L), b = parseExpr(R);
    return { kind: 'imp', F: (x, y) => a.fn(x, y) - b.fn(x, y), cond };
  }
  const r = parseExpr(text);
  if (r.hasY) throw new Error('Для кривой с y нужен знак «=», например x^2 + y^2 = 9');
  return { kind: 'fn', fn: (x) => r.fn(x, 0), cond };
}


// Несколько функций через ";" или с новой строки.
export function compileMany(src) {
  return src.split(/[;\n]/).map((s) => s.trim()).filter(Boolean).map((s) => ({ src: s, ...compile(s) }));
}
