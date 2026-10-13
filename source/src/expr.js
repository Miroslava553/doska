// Безопасный разбор математических выражений (без eval).
// Поддержка: + - * / ^, скобки, |x|, неявное умножение (2x, 3sin(x), (x+1)(x-1)),
// функции sin cos tg/tan ctg/cot arcsin arccos arctg sqrt cbrt abs exp ln lg log floor ceil sign,
// константы pi/π, e; переменная x (t — синоним), десятичная запятая "0,5".

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
    .replace(/π/g, 'pi').replace(/√/g, 'sqrt').replace(/²/g, '^2').replace(/³/g, '^3')
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
      if (c === 'e') { out.push({ t: 'num', v: Math.E }); i++; continue; }
      throw new Error('Неизвестное имя: ' + s.slice(i).match(/^[a-z]+/)[0]);
    }
    if ('+-*/^()|'.includes(c)) { out.push({ t: c }); i++; continue; }
    throw new Error('Лишний символ: ' + c);
  }
  return out;
}

export function compile(src) {
  let text = src.trim().replace(/^\s*(y|f\s*\(\s*[xt]\s*\))\s*=/i, '');
  if (!text) throw new Error('Пустое выражение');
  const tk = tokenize(text);
  let p = 0;
  let absDepth = 0;
  const peek = () => tk[p];
  const eat = (t) => { if (tk[p] && tk[p].t === t) { p++; return true; } return false; };
  const startsAtom = (k) => k && (k.t === 'num' || k.t === 'var' || k.t === 'fn' || k.t === '(' || (k.t === '|' && absDepth === 0));

  function expr() {
    let a = term();
    for (;;) {
      if (eat('+')) { const l = a, r = term(); a = (x) => l(x) + r(x); }
      else if (eat('-')) { const l = a, r = term(); a = (x) => l(x) - r(x); }
      else return a;
    }
  }
  function term() {
    let a = unary();
    for (;;) {
      if (eat('*')) { const l = a, r = unary(); a = (x) => l(x) * r(x); }
      else if (eat('/')) { const l = a, r = unary(); a = (x) => l(x) / r(x); }
      else if (startsAtom(peek())) { const l = a, r = power(); a = (x) => l(x) * r(x); }
      else return a;
    }
  }
  function unary() {
    if (eat('-')) { const a = unary(); return (x) => -a(x); }
    if (eat('+')) return unary();
    return power();
  }
  function power() {
    const base = atom();
    if (eat('^')) { const ex = unary(); return (x) => Math.pow(base(x), ex(x)); }
    return base;
  }
  function atom() {
    const k = tk[p++];
    if (!k) throw new Error('Выражение оборвалось');
    if (k.t === 'num') { const v = k.v; return () => v; }
    if (k.t === 'var') return (x) => x;
    if (k.t === '(') { const a = expr(); if (!eat(')')) throw new Error('Не закрыта скобка'); return a; }
    if (k.t === '|') { absDepth++; const a = expr(); absDepth--; if (!eat('|')) throw new Error('Не закрыт модуль |…|'); return (x) => Math.abs(a(x)); }
    if (k.t === 'fn') {
      const f = FUNCS[k.v];
      let arg;
      if (eat('(')) { arg = expr(); if (!eat(')')) throw new Error('Не закрыта скобка'); }
      else arg = power(); // sin x, sin 2x
      if (eat('^')) { const ex = unary(); return (x) => Math.pow(f(arg(x)), ex(x)); } // sin(x)^2
      return (x) => f(arg(x));
    }
    throw new Error('Неожиданный символ: ' + k.t);
  }
  const fn = expr();
  if (p < tk.length) throw new Error('Не понимаю: ' + tk.slice(p).map((k) => k.v ?? k.t).join(''));
  return fn;
}

// Несколько функций через ";" или с новой строки.
export function compileMany(src) {
  return src.split(/[;\n]/).map((s) => s.trim()).filter(Boolean).map((s) => ({ src: s, fn: compile(s) }));
}
