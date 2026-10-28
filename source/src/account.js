// Аккаунт и тариф «Про».
// Вход — по почте и коду, без пароля. Регистрация не обязательна: без входа доска работает как раньше.
// Пока нет сервера, в тестовой сборке (ACCOUNTS) письмо и оплата — понарошку, всё хранится в этом браузере.
// В сборке для сайта ACCOUNTS = false: входа и подписки нет, все возможности открыты бесплатно.
import { ICONS } from './icons.js';
import { SERVER, api } from './cloud.js';

export const ACCOUNTS = typeof __ACCOUNTS__ !== 'undefined' ? __ACCOUNTS__ : false;
// TEST: тестовый файл без сервера, письма и оплата понарошку. SERVER: настоящий сайт с сервером и ЮKassa.
const TEST = ACCOUNTS && !SERVER;
// Сайт до подключения ЮKassa: кнопка Про, описание, цены и оформление видны, но оплата ещё не принимается
export const SHOP = !ACCOUNTS;

// Условия. Цена, по которой человек оформил Про, остаётся за ним, пока подписка действует.
// raise: когда и до скольких поднимется цена для новых подписчиков. Дату и цену обязательно выполнить.
export const PLAN = {
  price: { month: 199, year: 1990 }, // год = 10 месяцев: два в подарок
  raise: null, // например { date: '2027-01-01', month: 299, year: 2990 } — объявление вверху окна Про
  proMaterialsGB: 10,
};

const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
};
// append без «null» в тексте: пропускаем пустые части
const put = (node, ...kids) => node.append(...kids.flat().filter((k) => k != null && k !== false && k !== ''));
const ic = (name, cls = 'ic') => el('span', { class: cls, html: ICONS[name] || '' });
const LS = {
  get(k, d) { try { const v = localStorage.getItem('doska:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { if (v == null) localStorage.removeItem('doska:' + k); else localStorage.setItem('doska:' + k, JSON.stringify(v)); } catch {} },
};
export const rub = (n) => n.toLocaleString('ru-RU') + ' ₽';
const day = (t) => new Date(t).toLocaleDateString('ru-RU', new Date(t).getFullYear() === new Date().getFullYear() ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' });
const DAY = 24 * 3600 * 1000;
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ---------- состояние ----------
const listeners = new Set();
export const onAccount = (f) => { listeners.add(f); return () => listeners.delete(f); };
const emit = () => { for (const f of [...listeners]) { try { f(); } catch (e) { console.error(e); } } };
window.addEventListener('storage', (e) => { if (e.key === 'doska:account') emit(); }); // вошли или оформили Про в другой вкладке
export function account() { return ACCOUNTS ? LS.get('account', null) : null; }
function saveAccount(a) { LS.set('account', a); emit(); }
// Ответ сервера переводим в тот же вид, что хранит тестовый режим, чтобы окна работали одинаково
const fromServer = (me) => (!me || me.anon ? null : {
  email: me.email, since: 0, used: me.used, quota: me.quota,
  pro: me.pro ? { period: me.pro.period, until: me.pro.until, started: me.pro.started, canceled: me.pro.canceled, method: me.pro.method,
    active: me.pro.active, autopay: me.pro.autopay, nextPeriod: me.pro.nextPeriod, failing: me.pro.failing, price: me.pro.price, title: me.pro.title } : null,
});
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export async function refreshAccount() {
  if (!SERVER) return account();
  try { const a = fromServer(await api('GET', '/me')); if (!sameJson(a, account())) saveAccount(a); return a; } catch { return account(); }
}
if (SERVER) {
  refreshAccount();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshAccount(); });
  setInterval(refreshAccount, 10 * 60000);
}
// Про действует, пока не кончился оплаченный (или пробный) период; без отмены продлевается сам
// Про владельца доски: отмечается на самой доске, чтобы ученик мог смотреть повтор урока без своей подписки
export const proUntil = () => (isPro() ? (account()?.pro?.until || 0) : 0);
export function isPro() {
  if (!ACCOUNTS) return true;
  const p = account()?.pro;
  if (SERVER) return !!(p && p.active && Date.now() < p.until + 3 * DAY); // сервер считает и три дня на повтор списания
  return !!(p && (!p.canceled || Date.now() < p.until));
}
const proInfo = () => account()?.pro || null;
// Доски, созданные в этом браузере (владелец — я). Доски, открытые по ссылке, в лимит не входят.
export function ownedBoards() {
  const out = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('doska:created:')) out.push(k.slice(14)); } } catch {}
  return out;
}
// После входа все доски (свои и открытые по ссылке) сохраняются в аккаунте и открываются на любом устройстве.
// Это бесплатно. Платное облако — это Материалы (файлы по папкам). null: значок не показываем (без входа).
export function inCloud() { return ACCOUNTS && account() ? true : null; }

// ---------- окна ----------
const sheets = [];
function sheet(card, { onClose, dark = false } = {}) {
  const back = el('div', { class: 'am-back' + (dark ? ' dark' : '') });
  // окно поверх другого окна: нижнее прячется, чтобы не просвечивать; уходящее окно убираем сразу, чтобы два не смешивались
  document.querySelectorAll('.am-back.out').forEach((x) => x.remove());
  const below = sheets[sheets.length - 1]; below?.back.classList.add('under');
  const close = () => {
    if (!back.isConnected) return;
    back.classList.add('out');
    window.removeEventListener('keydown', onKey, true);
    const i = sheets.indexOf(api); if (i >= 0) sheets.splice(i, 1);
    if (below && sheets.includes(below) && sheets[sheets.length - 1] === below) below.back.classList.remove('under');
    setTimeout(() => back.remove(), 180);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape' && sheets[sheets.length - 1] === api) { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
  let downOnBack = false;
  back.addEventListener('pointerdown', (e) => { downOnBack = e.target === back; });
  back.addEventListener('click', (e) => { if (downOnBack && e.target === back) close(); downOnBack = false; });
  back.addEventListener('keydown', (e) => e.stopPropagation());
  back.append(card);
  document.body.append(back);
  window.addEventListener('keydown', onKey, true);
  const api = { close, back, card };
  sheets.push(api);
  return api;
}
const xBtn = (close) => el('button', { class: 'am-x', title: 'Закрыть', onclick: close }, ic('plus', 'ic am-x-ic'));
function testNote(text) { return TEST ? el('div', { class: 'am-test' }, el('span', { class: 'am-test-dot' }), el('span', {}, text)) : null; }
function brandMark(size = 'md') { return el('div', { class: 'am-mark ' + size, html: '<svg viewBox="0 0 32 32"><path d="M8 22l3-1 11-11-2-2-11 11z" fill="#fff"/></svg>' }); }
function proMark(size = 'md') { return el('div', { class: 'pro-mark ' + size }, ic('sparkle')); }
export function proTag() { return ACCOUNTS && !isPro() ? el('span', { class: 'pro-tag' }, 'Про') : null; }

// ---------- вход по почте ----------
export function openLogin({ reason = '', then = null } = {}) {
  if (!ACCOUNTS) return;
  const card = el('div', { class: 'am-card am-login' });
  const s = sheet(card);
  const shell = (...kids) => { card.innerHTML = ''; put(card, xBtn(s.close), ...kids); };

  // Частые опечатки в адресах почты: предлагаем исправить одним нажатием
  const FIX_DOMAIN = { 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.ru': 'gmail.com', 'gmal.com': 'gmail.com',
    'yandex.r': 'yandex.ru', 'yandx.ru': 'yandex.ru', 'yadex.ru': 'yandex.ru', 'yandex.com.ru': 'yandex.ru', 'ya.r': 'ya.ru', 'mail.r': 'mail.ru', 'mai.ru': 'mail.ru', 'mail.ry': 'mail.ru', 'maill.ru': 'mail.ru', 'mial.ru': 'mail.ru',
    'inbox.r': 'inbox.ru', 'bk.r': 'bk.ru', 'list.r': 'list.ru', 'rambler.r': 'rambler.ru', 'icloud.co': 'icloud.com', 'outlok.com': 'outlook.com' };
  const askEmail = (value = '') => {
    // поле в форме и с name="email": так браузер узнаёт поле почты и правильно подставляет сохранённый адрес
    const inp = el('input', { class: 'am-inp', type: 'email', name: 'email', id: 'doska-email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'off', autocorrect: 'off', placeholder: 'Почта', spellcheck: 'false' });
    inp.value = value;
    const err = el('div', { class: 'am-err' });
    const hintFix = el('button', { type: 'button', class: 'am-fix', hidden: true });
    const checkTypo = () => {
      const v = inp.value.trim().toLowerCase(), at = v.lastIndexOf('@'), dom = at > 0 ? v.slice(at + 1) : '';
      const fix = FIX_DOMAIN[dom];
      hintFix.hidden = !fix;
      if (fix) { const good = v.slice(0, at + 1) + fix; hintFix.textContent = `Возможно, вы имели в виду ${good}?`; hintFix.onclick = () => { inp.value = good; hintFix.hidden = true; inp.focus(); }; }
    };
    const go = () => {
      const v = inp.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { err.textContent = 'Проверьте адрес почты'; card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); inp.focus(); return; }
      if (!SERVER) { askCode(v); return; }
      if (sendBtn.disabled) return;
      sendBtn.disabled = true; sendBtn.classList.add('loading');
      api('POST', '/login/start', { email: v })
        .then(() => askCode(v))
        .catch((e) => { if (e.status === 429 && e.data.wait) askCode(v, e.data.wait); else { err.textContent = e.message; sendBtn.disabled = false; sendBtn.classList.remove('loading'); } });
    };
    const sendBtn = el('button', { type: 'submit', class: 'am-btn primary' }, 'Получить код');
    const form = el('form', { class: 'am-form', autocomplete: 'on', novalidate: true },
      inp, hintFix, err, sendBtn);
    form.addEventListener('submit', (e) => { e.preventDefault(); go(); });
    for (const ev of ['input', 'change']) inp.addEventListener(ev, () => { err.textContent = ''; checkTypo(); });
    shell(
      brandMark('lg'),
      el('h2', { class: 'am-h' }, 'Вход в Lodl'),
      el('p', { class: 'am-sub' }, reason || 'Ваши доски сохранятся в аккаунте и будут открываться на любом устройстве.'),
      form,
      el('p', { class: 'am-fine' }, 'Нажимая «Получить код», вы соглашаетесь на ', el('a', { href: 'privacy.html', target: '_blank', rel: 'noopener' }, 'обработку адреса почты'), '.'));
    setTimeout(() => inp.focus(), 60);
  };

  const askCode = (email, waitSec = 59) => {
    const code = SERVER ? '' : String(Math.floor(100000 + Math.random() * 900000));
    const boxes = Array.from({ length: 6 }, (_, i) => el('input', { class: 'am-digit', inputmode: 'numeric', maxlength: 1, autocomplete: i ? 'off' : 'one-time-code', 'aria-label': 'Цифра ' + (i + 1) }));
    const err = el('div', { class: 'am-err' });
    const value = () => boxes.map((b) => b.value).join('');
    let tries = 0;
    let checking = false;
    const wrong = (msg) => { err.textContent = msg; card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); boxes.forEach((b) => { b.value = ''; b.disabled = false; }); boxes[0].focus(); };
    const check = () => {
      if (value().length < 6) return;
      if (SERVER) {
        if (checking) return; checking = true; boxes.forEach((b) => { b.disabled = true; });
        api('POST', '/login/verify', { email, code: value() })
          .then((me) => { boxes.forEach((b) => b.classList.add('ok')); setTimeout(() => done(email, fromServer(me)), 380); })
          .catch((e) => {
            checking = false;
            if (e.data.expired) { wrong(e.message); boxes.forEach((b) => { b.disabled = true; }); clearInterval(timer); resend.disabled = false; resend.textContent = 'Отправить новый код'; }
            else wrong(e.message);
          });
        return;
      }
      if (value() === code) { boxes.forEach((b) => { b.disabled = true; b.classList.add('ok'); }); setTimeout(() => done(email), 380); }
      else if (++tries >= 5) { boxes.forEach((b) => { b.value = ''; b.disabled = true; }); err.textContent = 'Код введён неверно 5 раз. Отправьте новый код.'; resend.disabled = false; resend.textContent = 'Отправить новый код'; clearInterval(timer); }
      else { err.textContent = 'Неверный код'; card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); boxes.forEach((b) => { b.value = ''; }); boxes[0].focus(); }
    };
    const fill = (str, from = 0) => { const d = str.replace(/\D/g, '').slice(0, 6 - from); [...d].forEach((c, k) => { boxes[from + k].value = c; }); boxes[Math.min(5, from + d.length)].focus(); check(); };
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => { err.textContent = ''; const v = b.value.replace(/\D/g, ''); if (v.length > 1) { b.value = ''; fill(v, i); return; } b.value = v; if (v && i < 5) boxes[i + 1].focus(); check(); });
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !b.value && i > 0) { boxes[i - 1].value = ''; boxes[i - 1].focus(); e.preventDefault(); }
        else if (e.key === 'ArrowLeft' && i > 0) boxes[i - 1].focus();
        else if (e.key === 'ArrowRight' && i < 5) boxes[i + 1].focus();
      });
      b.addEventListener('paste', (e) => { e.preventDefault(); fill(e.clipboardData.getData('text'), i); });
      b.addEventListener('focus', () => b.select());
    });
    let left = waitSec;
    const resend = el('button', { class: 'am-link', disabled: true, onclick: () => {
      if (!SERVER) { askCode(email); return; }
      resend.disabled = true;
      api('POST', '/login/start', { email }).then(() => askCode(email)).catch((e) => { if (e.status === 429 && e.data.wait) askCode(email, e.data.wait); else { err.textContent = e.message; resend.disabled = false; } });
    } });
    const tick = () => { if (!resend.isConnected) return clearInterval(timer); left--; resend.textContent = left > 0 ? `Отправить ещё раз через 0:${String(left).padStart(2, '0')}` : 'Отправить код ещё раз'; resend.disabled = left > 0; if (left <= 0) clearInterval(timer); };
    const timer = setInterval(tick, 1000); resend.textContent = `Отправить ещё раз через 0:${String(left).padStart(2, '0')}`;
    shell(
      el('div', { class: 'am-ico-circle' }, ic('mail')),
      el('h2', { class: 'am-h' }, 'Введите код'),
      el('p', { class: 'am-sub' }, 'Отправили его на ', el('b', {}, email)),
      SERVER ? el('p', { class: 'am-fine' }, 'Если письма нет пару минут, загляните в папку «Спам».') : null,
      testNote(['Тестовый режим. Письмо не приходит, ваш код ', el('b', { class: 'am-code' }, code.slice(0, 3) + ' ' + code.slice(3))]),
      el('div', { class: 'am-digits' }, boxes), err,
      el('div', { class: 'am-row-links' }, el('button', { class: 'am-link', onclick: () => askEmail(email) }, 'Изменить почту'), resend));
    setTimeout(() => boxes[0].focus(), 60);
  };

  const done = (email, fromSrv) => {
    const prev = LS.get('account', null);
    saveAccount(SERVER ? fromSrv : prev && prev.email === email ? prev : { email, since: Date.now() });
    shell(
      el('div', { class: 'am-ok-anim', html: '<svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-15"/></svg>' }),
      el('h2', { class: 'am-h' }, 'Вы вошли'),
      el('p', { class: 'am-sub' }, 'Теперь ваши доски открываются на любом устройстве, где вы войдёте по этой почте.'),
      el('button', { class: 'am-btn primary', onclick: () => { s.close(); then?.(); } }, then ? 'Продолжить' : 'Готово'));
  };
  askEmail();
  return s;
}

export function logout() { if (SERVER) api('POST', '/logout').catch(() => {}); saveAccount(null); }
// Удаление аккаунта: почта и подписка стираются, доски на этом устройстве остаются
function deleteAccount() {
  const a = account(); if (!a) return;
  const card = el('div', { class: 'am-card am-confirm' });
  const s = sheet(card);
  put(card,
    el('h2', { class: 'am-h' }, 'Удалить аккаунт?'),
    el('p', { class: 'am-sub' }, `Мы удалим аккаунт ${a.email}${a.pro && isPro() ? ' и отменим подписку Про' : ''}. Доски на этом устройстве останутся, но на других устройствах они больше не откроются.`),
    el('div', { class: 'am-btns' },
      el('button', { class: 'am-btn ghost danger-t', onclick: async (e) => {
        if (SERVER) {
          const b = e.currentTarget; b.disabled = true;
          try { await api('POST', '/account/delete'); } catch (er) { b.disabled = false; put(card, el('div', { class: 'am-err' }, er.message)); return; }
        }
        s.close(); saveAccount(null);
      } }, 'Удалить'),
      el('button', { class: 'am-btn primary', onclick: () => s.close() }, 'Оставить')));
}

// ---------- тарифы ----------
// Пишем просто и по делу: сначала ситуация, знакомая репетитору, потом что меняется с Про.
const FEATURES = {
  materials: ['folder', 'Материалы в облаке', `Задачи, чертежи и PDF лежат в облаке по папкам, и на уроке вы за несколько секунд перетаскиваете нужное на доску. Вам доступно ${PLAN.proMaterialsGB} ГБ.`],
  templates: ['copy', 'Шаблоны уроков', 'Вы готовите урок один раз, сохраняете его как шаблон и одним нажатием создаёте из него доску для каждого ученика.'],
  answer: ['eyeOff', 'Скрытый ответ', 'Вы заранее пишете решение и закрываете его, а открываете, когда ученик решит задачу сам.'],
  history: ['history', 'История доски', 'Доска записывает последние 10 часов работы, и запись можно посмотреть как видео. Если ученик стёр решение или вы удалили не тот лист, перемотайте запись на нужную минуту и верните лист на доску.'],
};
const FEATURE_ASK = { materials: 'Материалы в облаке', history: 'История доски', templates: 'Шаблоны уроков', answer: 'Скрытый ответ' };
const per = (period) => (period === 'month' ? 'в месяц' : 'в год');
const periodMs = (period) => (period === 'month' ? 30 : 365) * DAY;
// календарный месяц или год, как на сервере: 31 января + месяц = 28 (29) февраля
function addPeriod(t, period) { const d = new Date(t), dd = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + (period === 'year' ? 12 : 1)); d.setDate(Math.min(dd, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return d.getTime(); }
const CFG = { autopay: true };
if (SERVER) api('GET', '/config').then((c) => Object.assign(CFG, c)).catch(() => {});
const raiseAt = () => (PLAN.raise ? new Date(PLAN.raise.date + 'T00:00:00').getTime() : 0);
const daysLeft = () => Math.max(0, Math.ceil((raiseAt() - Date.now()) / DAY));
const daysWord = (n) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'день' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'дня' : 'дней'; };

export function requirePro(feature, f) { if (isPro()) return f(); openPro({ feature }); }

export function openPro({ feature = '' } = {}) {
  let period = LS.get('proPeriod', 'month');
  const card = el('div', { class: 'am-card am-pro' });
  const s = sheet(card);
  const paint = () => {
    const pro = ACCOUNTS && isPro(), p = proInfo();
    const price = PLAN.price[period];
    const seg = el('div', { class: 'am-seg' },
      el('button', { class: 'am-seg-b' + (period === 'month' ? ' on' : ''), onclick: () => { period = 'month'; LS.set('proPeriod', period); paint(); } }, 'Месяц'),
      el('button', { class: 'am-seg-b' + (period === 'year' ? ' on' : ''), onclick: () => { period = 'year'; LS.set('proPeriod', period); paint(); } }, 'Год', el('span', { class: 'am-save' }, '2 месяца в подарок')));
    const buy = () => {
      if (SHOP) { s.close(); openCheckout(period); }
      else if (!account()) { s.close(); openLogin({ reason: 'Подписка привязывается к почте. Так Про будет работать на всех ваших устройствах.', then: () => openCheckout(period) }); }
      else { s.close(); openCheckout(period); }
    };
    const cta = pro
      ? el('button', { class: 'am-btn pro big', onclick: () => { s.close(); manageSub(); } }, 'Подписка и оплата')
      : el('button', { class: 'am-btn pro big', onclick: buy }, `${p ? 'Возобновить' : 'Оформить'} Про за ${rub(price)}`);
    const order = feature && FEATURES[feature] ? [feature, ...Object.keys(FEATURES).filter((k) => k !== feature)] : Object.keys(FEATURES);
    const raising = !pro && Date.now() < raiseAt();
    card.innerHTML = '';
    put(card, xBtn(s.close),
      el('div', { class: 'pw-top' }, proMark('md'), el('div', {}, el('h2', { class: 'pw-title' }, 'Lodl Про'), el('div', { class: 'pw-for' }, 'Подписка для репетиторов'))),
      raising ? el('div', { class: 'pw-raise' },
        el('div', { class: 'pw-raise-h' }, `С ${day(raiseAt())} Про будет стоить ${rub(PLAN.raise.month)} в месяц`),
        el('div', { class: 'pw-raise-t' }, `Если вы оформите подписку до этой даты, для вас цена останется ${rub(PLAN.price.month)}, пока подписка действует. До повышения осталось ${daysLeft()} ${daysWord(daysLeft())}.`)) : null,
      feature && FEATURE_ASK[feature] && !pro ? el('div', { class: 'am-ask' }, `«${FEATURE_ASK[feature]}» входит в Про`) : null,
      el('ul', { class: 'pw-list' }, order.map((k) => { const [icn, t, d] = FEATURES[k]; return el('li', { class: k === feature ? 'hl' : '' },
        el('span', { class: 'pw-ic' }, ic(icn)), el('div', {}, el('b', {}, t), el('span', { class: 'pw-d' }, d))); })),
      el('div', { class: 'pw-price' },
        seg,
        el('div', { class: 'pw-num' }, el('span', {}, rub(price)), el('span', { class: 'pw-per' }, per(period))),
        el('div', { class: 'pw-note' }, period === 'year' ? `Около ${rub(Math.round(price / 12))} в месяц` : 'При оплате за год два месяца бесплатно'),
        cta,
        el('div', { class: 'pw-guarantee' }, ic('check', 'ic g-ic'), el('span', {}, 'Отменить подписку можно в любой момент.'))),
      el('details', { class: 'am-terms' }, el('summary', {}, 'Условия подписки'), termsList(period)),
      testNote('Тестовый режим. Оплата понарошку, деньги не списываются.'));
  };
  paint();
  return s;
}
function termsList(period) {
  const price = PLAN.price[period];
  return el('ul', { class: 'am-terms-list' },
    el('li', {}, `Подписка стоит ${rub(price)} ${per(period)}${period === 'year' ? ', это цена десяти месяцев' : ''}, деньги списываются в день оформления, а за три дня до продления мы пришлём напоминание на почту.`),
    el('li', {}, 'Цена, по которой вы оформили Про, остаётся за вами, пока подписка действует.'),
    el('li', {}, 'Отменить подписку можно в любой момент в разделе «Подписка и оплата». После оформления он открывается кнопкой справа вверху на главной странице. Про будет работать до конца оплаченного периода, а доски и материалы останутся у вас.'),
    el('li', {}, 'Оплата картой или через СБП. Данные карты обрабатывает платёжный сервис, мы их не храним.'),
    el('li', {}, el('a', { href: 'terms.html#offer', target: '_blank', rel: 'noopener' }, 'Полный текст оферты и реквизиты')));
}

// ---------- оформление ----------
function openCheckout(period = 'month') {
  const card = el('div', { class: 'am-card am-checkout' });
  const s = sheet(card);
  let method = 'card';
  const cur = proInfo(), activeNow = SERVER && isPro();
  // цена, по которой оформили, остаётся, пока подписка действует; продление вручную добавляет срок к текущему
  const price = activeNow && cur?.price && cur.period === period ? cur.price : PLAN.price[period];
  const start = Date.now(), next = SERVER ? addPeriod(activeNow ? cur.until : start, period) : start + periodMs(period);
  const autoRenew = !SERVER || CFG.autopay;
  // на сайте почту спрашиваем здесь: на неё придёт чек, и к ней привяжется подписка
  let email = '';
  const mailInp = SHOP ? el('input', { class: 'am-inp', type: 'email', name: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Почта' }) : null;
  const mailErr = el('div', { class: 'am-err' }), payErr = el('div', { class: 'am-err' });
  if (mailInp) mailInp.addEventListener('input', () => { email = mailInp.value; mailErr.textContent = ''; });
  const paint = () => {
    const pay = el('button', { class: 'am-btn pro big', onclick: () => submit(pay) }, `Оплатить ${rub(price)}`);
    if (mailInp) mailInp.value = email;
    card.innerHTML = '';
    put(card, xBtn(s.close),
      el('button', { class: 'am-back-btn', onclick: () => { s.close(); openPro(); } }, ic('left'), 'Назад'),
      el('h2', { class: 'am-h' }, 'Оформление Про'),
      el('div', { class: 'co-sum' },
        el('div', { class: 'co-row' }, el('span', {}, 'Lodl Про, ' + (period === 'month' ? 'на месяц' : 'на 12 месяцев')), el('span', {}, rub(period === 'year' ? PLAN.price.month * 12 : price))),
        period === 'year' ? el('div', { class: 'co-row' }, el('span', {}, 'Два месяца в подарок'), el('span', { class: 'co-green' }, '−' + rub(PLAN.price.month * 2))) : null,
        el('div', { class: 'co-line' }),
        el('div', { class: 'co-row total' }, el('span', {}, 'К оплате'), el('span', {}, rub(price))),
        el('div', { class: 'co-next' }, autoRenew ? `Следующее списание ${day(next)}. Мы напомним за три дня.` : `Подписка будет действовать до ${day(next)}. Перед окончанием мы напомним о продлении.`)),
      SHOP ? el('div', { class: 'co-h' }, 'Почта для чека и подписки') : null,
      mailInp, SHOP ? mailErr : null,
      SERVER ? el('p', { class: 'co-how' }, 'После нажатия откроется защищённая страница ЮKassa. Там можно оплатить банковской картой или через СБП, данные карты мы не видим и не храним.') : null,
      SERVER ? payErr : null,
      SERVER ? null : el('div', { class: 'co-h' }, 'Способ оплаты'),
      SERVER ? null : el('div', { class: 'co-methods' },
        ...[['card', 'card', 'Карта'], ['sbp', 'sbp', 'СБП']].map(([id, icn, t]) => el('button', { class: 'co-m' + (method === id ? ' on' : ''), onclick: () => { method = id; paint(); } }, ic(icn), t, el('span', { class: 'co-radio' })))),
      testNote('Тестовый режим. Данные карты не нужны, деньги не списываются.'),
      pay,
      el('p', { class: 'am-fine' }, 'Нажимая кнопку, вы соглашаетесь с ', el('a', { href: 'terms.html#offer', target: '_blank', rel: 'noopener' }, 'условиями подписки'), autoRenew ? ' и автоматическим продлением.' : '.'));
  };
  const submit = (btn) => {
    if (btn.disabled) return;
    if (SHOP) {
      const v = (mailInp.value || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { mailErr.textContent = 'Проверьте адрес почты'; card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); mailInp.focus(); return; }
      card.innerHTML = '';
      put(card, xBtn(s.close),
        el('div', { class: 'am-ico-circle' }, ic('card')),
        el('h2', { class: 'am-h' }, 'Оплата скоро заработает'),
        el('p', { class: 'am-sub' }, 'Мы подключаем приём платежей через ЮKassa. Когда подключение закончится, эта кнопка будет открывать защищённую страницу ЮKassa, где можно оплатить картой или через СБП.'),
        el('p', { class: 'am-sub' }, 'Сейчас деньги не списываются, а доска работает бесплатно.'),
        el('button', { class: 'am-btn primary', onclick: () => s.close() }, 'Понятно'));
      return;
    }
    if (SERVER) {
      btn.disabled = true; btn.classList.add('loading'); btn.textContent = ''; btn.append(el('span', { class: 'am-spin' })); payErr.textContent = '';
      api('POST', '/pay', { period })
        .then((r) => { LS.set('payFrom', location.hash || ''); location.href = r.url; })
        .catch((e) => {
          btn.disabled = false; btn.classList.remove('loading'); btn.textContent = `Оплатить ${rub(price)}`;
          if (e.status === 401) { s.close(); openLogin({ reason: 'Войдите ещё раз, чтобы оформить подписку.', then: () => openCheckout(period) }); return; }
          if (e.status === 409) { refreshAccount().then(() => { s.close(); if (isPro()) manageSub(); }); return; }
          payErr.textContent = e.message;
        });
      return;
    }
    btn.disabled = true; btn.classList.add('loading'); btn.textContent = '';
    btn.append(el('span', { class: 'am-spin' }));
    setTimeout(() => {
      btn.classList.remove('loading'); btn.classList.add('done'); btn.innerHTML = ''; btn.append(ic('check'));
      const a = account(); if (!a) { s.close(); return; } // вышли из аккаунта, пока шла оплата
      a.pro = { period, started: start, until: next, canceled: false, method };
      saveAccount(a);
      setTimeout(() => { s.close(); celebrate(); }, 520);
    }, TEST ? 1100 : 0);
  };
  paint();
}

// ---------- праздник после оплаты ----------
export function celebrate() {
  const p = proInfo();
  const card = el('div', { class: 'am-card am-celebrate' });
  const s = sheet(card, { dark: true });
  const items = [FEATURES.materials, FEATURES.templates, FEATURES.answer, FEATURES.history].map(([icn, t]) => [icn, t]);
  put(card, 
    el('div', { class: 'cel-badge' }, el('div', { class: 'cel-ring' }), el('div', { class: 'cel-ring r2' }), proMark('xl')),
    el('div', { class: 'cel-kicker' }, 'Добро пожаловать'),
    el('h2', { class: 'cel-h' }, 'Теперь у вас ', el('span', { class: 'cel-pro' }, 'Про')),
    el('p', { class: 'am-sub' }, 'Спасибо, что поддерживаете Lodl.'),
    el('ul', { class: 'cel-list' }, items.map(([icn, t], i) => el('li', { style: `--d:${0.55 + i * 0.12}s` }, el('span', { class: 'pw-ic' }, ic(icn)), el('b', {}, t), el('span', { class: 'cel-check' }, ic('check'))))),
    el('button', { class: 'am-btn pro big', onclick: () => s.close() }, 'Начать'),
    p ? el('p', { class: 'am-fine' }, SERVER && !p.autopay ? `Подписка действует до ${day(p.until)}` : `Следующее списание ${day(p.until)}`) : null);
  if (!reduced()) { confetti(); setTimeout(() => s.back.isConnected && confetti(0.5), 650); }
  return s;
}
function confetti(power = 1) {
  const c = el('canvas', { class: 'confetti' });
  document.body.append(c);
  const dpr = window.devicePixelRatio || 1, W = innerWidth, H = innerHeight;
  c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  const COLORS = ['#4c6ef5', '#1f2328', '#fab005', '#20c997', '#ff6b6b', '#74c0fc', '#ffffff'];
  const P = [];
  const burst = (x, y, ang, spread, n, sp) => {
    for (let i = 0; i < n; i++) {
      const a = ang + (Math.random() - 0.5) * spread, v = sp * (0.55 + Math.random() * 0.65);
      P.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35, w: 6 + Math.random() * 6, h: 3 + Math.random() * 5,
        c: COLORS[(Math.random() * COLORS.length) | 0], s: Math.random() < 0.25 ? 1 : 0, wob: Math.random() * 6, life: 1 });
    }
  };
  const n = Math.round(90 * power);
  burst(0, H * 0.95, -Math.PI / 3.2, 0.7, n, 22);
  burst(W, H * 0.95, -Math.PI + Math.PI / 3.2, 0.7, n, 22);
  if (power === 1) burst(W / 2, H * 0.36, -Math.PI / 2, Math.PI * 1.6, 70, 13);
  let last = performance.now(); const t0 = last;
  const step = (now) => {
    const dt = Math.min(2.5, (now - last) / 16.7); last = now;
    g.clearRect(0, 0, W, H);
    let alive = 0;
    for (const q of P) {
      q.vx *= Math.pow(0.985, dt); q.vy = q.vy * Math.pow(0.985, dt) + 0.32 * dt;
      q.x += (q.vx + Math.sin((now / 260) + q.wob) * 0.6) * dt; q.y += q.vy * dt; q.r += q.vr * dt;
      if (now - t0 > 2200) q.life -= 0.02 * dt;
      if (q.y > H + 40 || q.life <= 0) continue;
      alive++;
      g.save(); g.globalAlpha = Math.max(0, q.life); g.translate(q.x, q.y); g.rotate(q.r); g.fillStyle = q.c;
      if (q.s) { g.beginPath(); g.arc(0, 0, q.h * 0.6, 0, Math.PI * 2); g.fill(); }
      else { g.scale(1, Math.cos(now / 140 + q.wob)); g.fillRect(-q.w / 2, -q.h / 2, q.w, q.h); }
      g.restore();
    }
    if (alive && now - t0 < 6000) requestAnimationFrame(step); else c.remove();
  };
  requestAnimationFrame(step);
}

// ---------- управление подпиской ----------
export function manageSub() {
  const card = el('div', { class: 'am-card am-manage' });
  const s = sheet(card);
  const err = el('div', { class: 'am-err' });
  // действие на сервере: кнопка ждёт ответа, ошибка видна в окне
  const act = async (btn, path, body, local) => {
    if (!SERVER) { local(); paint(); return; }
    btn.disabled = true; err.textContent = '';
    try { saveAccount(fromServer(await api('POST', path, body))); paint(); }
    catch (e) { btn.disabled = false; err.textContent = e.message; }
  };
  const paint = () => {
    const p = proInfo(), pro = isPro();
    card.innerHTML = '';
    put(card, xBtn(s.close), el('h2', { class: 'am-h left' }, 'Подписка и оплата'));
    if (!pro) {
      put(card, el('div', { class: 'sub-card free' }, el('div', { class: 'sub-plan' }, 'Базовый'), el('div', { class: 'sub-meta' }, p && p.until ? `Про закончился ${day(p.until)}. Доски и материалы остались у вас.` : 'Бесплатно, навсегда')),
        el('button', { class: 'am-btn pro', onclick: () => { s.close(); openPro(); } }, p && p.until ? 'Оформить Про снова' : 'Перейти на Про'));
      return;
    }
    const price = p.price || PLAN.price[p.nextPeriod || p.period];
    const auto = !SERVER || p.autopay; // продлевается сама
    const state = p.failing ? ['Не получилось продлить', ' off'] : p.canceled || !auto ? ['Не продлевается', ' off'] : ['Активна', ''];
    const meta = p.failing ? `Банк не провёл оплату. Мы попробуем ещё раз, а Про пока работает. Можно оплатить с другой карты.`
      : p.canceled ? `Про работает до ${day(p.until)}. После этого всё созданное останется.`
      : !auto ? `Подписка действует до ${day(p.until)}. Чтобы Про продолжил работать, продлите её.`
      : p.nextPeriod === 'year' ? `${day(p.until)} подписка станет годовой: ${rub(PLAN.price.year)} в год.`
      : p.nextPeriod === 'month' ? `${day(p.until)} подписка станет помесячной: ${rub(PLAN.price.month)} в месяц.`
      : `Следующее списание ${day(p.until)}.`;
    const pay = (period) => el('button', { class: 'am-btn pro', onclick: () => { s.close(); openCheckout(period); } }, p.failing ? 'Оплатить с другой карты' : `Продлить за ${rub(PLAN.price[period])}`);
    put(card,
      el('div', { class: 'sub-card' },
        el('div', { class: 'sub-top' }, proMark('sm'), el('div', { class: 'sub-plan' }, 'Lodl Про'), el('span', { class: 'sub-state' + state[1] }, state[0])),
        el('div', { class: 'sub-price' }, `${rub(p.price && !p.nextPeriod ? p.price : PLAN.price[p.period])} ${per(p.period)}`),
        el('div', { class: 'sub-meta' }, meta)),
      el('div', { class: 'sub-rows' },
        el('div', { class: 'sub-row' }, el('span', {}, 'Аккаунт'), el('span', {}, account().email)),
        el('div', { class: 'sub-row' }, el('span', {}, 'Способ оплаты'), el('span', {}, p.title || (p.method === 'sbp' ? 'СБП' : 'Карта') + (TEST ? ' · тест' : ''))),
        el('div', { class: 'sub-row' }, el('span', {}, 'Цена'), el('span', {}, 'Не меняется, пока подписка действует'))),
      err,
      p.failing ? pay(p.period)
        : p.canceled && auto ? el('button', { class: 'am-btn pro', onclick: (e) => act(e.currentTarget, '/sub/resume', {}, () => { const a = account(); a.pro.canceled = false; saveAccount(a); }) }, 'Возобновить подписку')
        : !auto ? pay(p.period)
        : p.period === 'month' && p.nextPeriod !== 'year'
          ? el('button', { class: 'am-btn ghost', onclick: (e) => act(e.currentTarget, '/sub/period', { period: 'year' }, () => { const a = account(); a.pro.period = 'year'; saveAccount(a); }) }, `Перейти на год за ${rub(PLAN.price.year)}, два месяца в подарок`)
          : p.nextPeriod ? el('button', { class: 'am-btn ghost', onclick: (e) => act(e.currentTarget, '/sub/period', { period: p.period }, () => {}) }, p.period === 'month' ? 'Оставить помесячную оплату' : 'Оставить годовую оплату')
          : null,
      p.canceled || !auto ? null : el('button', { class: 'am-btn ghost danger-t', onclick: () => confirmCancel(paint) }, 'Отменить подписку'));
  };
  paint();
  if (SERVER) refreshAccount().then(() => { if (card.isConnected) paint(); });
  return s;
}
function confirmCancel(after) {
  const p = proInfo();
  const card = el('div', { class: 'am-card am-confirm' });
  const s = sheet(card);
  const err = el('div', { class: 'am-err' });
  put(card,
    el('h2', { class: 'am-h' }, 'Отменить Про?'),
    el('p', { class: 'am-sub' }, `Про будет работать до ${day(p.until)}, после этого списаний не будет.`),
    el('ul', { class: 'am-keep' },
      el('li', {}, ic('check', 'ic li-ic'), 'Все доски и материалы останутся у вас, их можно открыть и сохранить в файл'),
      el('li', {}, ic('check', 'ic li-ic'), 'Возобновить можно в любой момент по той же цене')),
    err,
    el('div', { class: 'am-btns' },
      el('button', { class: 'am-btn ghost', onclick: async (e) => {
        if (SERVER) {
          const b = e.currentTarget; b.disabled = true;
          try { saveAccount(fromServer(await api('POST', '/sub/cancel'))); } catch (er) { b.disabled = false; err.textContent = er.message; return; }
        } else { const a = account(); a.pro.canceled = true; saveAccount(a); }
        s.close(); after?.();
      } }, 'Отменить подписку'),
      el('button', { class: 'am-btn primary', onclick: () => s.close() }, 'Оставить Про')));
}

// ---------- возврат со страницы оплаты ----------
// ЮKassa возвращает на сайт с ?pay=метка. Узнаём у сервера, чем кончилась оплата, и показываем результат.
function payReturn() {
  const sp = new URLSearchParams(location.search);
  const id = sp.get('pay'), sub = sp.get('sub');
  if (!id && !sub) return;
  history.replaceState(null, '', location.pathname + (LS.get('payFrom', '') || location.hash)); LS.set('payFrom', null);
  if (sub) { refreshAccount().then((a) => (a ? manageSub() : openLogin({ reason: 'Войдите, чтобы открыть подписку и оплату.', then: () => manageSub() }))); return; }
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return;
  const card = el('div', { class: 'am-card am-confirm' });
  const s = sheet(card);
  const show = (...kids) => { card.innerHTML = ''; put(card, xBtn(s.close), ...kids); };
  show(el('div', { class: 'am-spin big' }), el('h2', { class: 'am-h' }, 'Проверяем оплату'), el('p', { class: 'am-sub' }, 'Это займёт несколько секунд.'));
  const t0 = Date.now();
  const poll = async () => {
    if (!card.isConnected) return;
    let r = null;
    try { r = await api('GET', '/pay/' + id); } catch (e) { if (e.status === 401 || e.status === 404) { s.close(); return; } }
    if (r?.status === 'succeeded') { saveAccount(fromServer(r.me)); s.close(); celebrate(); return; }
    if (r?.status === 'canceled') {
      show(el('div', { class: 'am-ico-circle' }, ic('card')), el('h2', { class: 'am-h' }, 'Оплата не прошла'),
        el('p', { class: 'am-sub' }, 'Деньги не списаны. Попробуйте ещё раз или выберите другой способ оплаты.'),
        el('div', { class: 'am-btns' }, el('button', { class: 'am-btn ghost', onclick: () => s.close() }, 'Закрыть'), el('button', { class: 'am-btn pro', onclick: () => { s.close(); openPro(); } }, 'Оплатить снова')));
      return;
    }
    if (Date.now() - t0 > 90000) {
      show(el('div', { class: 'am-ico-circle' }, ic('card')), el('h2', { class: 'am-h' }, 'Платёж ещё обрабатывается'),
        el('p', { class: 'am-sub' }, 'Как только банк подтвердит оплату, Про включится сам, и мы пришлём письмо. Обычно это занимает несколько минут.'),
        el('button', { class: 'am-btn primary', onclick: () => s.close() }, 'Хорошо'));
      return;
    }
    setTimeout(poll, 2000);
  };
  poll();
}
if (SERVER) setTimeout(payReturn, 0);

// ---------- кнопки на главном экране ----------
function avatar(a, cls = '') {
  const letter = (a.email || '?')[0].toUpperCase();
  return el('span', { class: 'avatar ' + cls + (isPro() ? ' pro' : '') }, el('span', { class: 'av-in' }, letter));
}
export function accountControls() {
  const wrap = el('div', { class: 'acc-ctl' });
  if (!ACCOUNTS) { wrap.append(el('button', { class: 'pro-pill', onclick: () => openPro() }, ic('sparkle'), 'Про')); return wrap; }
  const paint = () => {
    if (!wrap.isConnected && wrap._painted) { off(); return; }
    wrap._painted = true;
    wrap.innerHTML = '';
    const a = account();
    wrap.append(isPro()
      ? el('button', { class: 'pro-pill on', onclick: () => manageSub() }, ic('sparkle'), el('span', { class: 'pp-long' }, 'Подписка и оплата'), el('span', { class: 'pp-short' }, 'Подписка'))
      : el('button', { class: 'pro-pill', onclick: () => openPro() }, ic('sparkle'), 'Про'));
    if (!a) wrap.append(el('button', { class: 'acc-login', onclick: () => openLogin() }, 'Войти'));
    else { const b = el('button', { class: 'acc-btn', title: a.email, onclick: () => accountMenu(b) }, avatar(a)); wrap.append(b); }
  };
  const off = onAccount(paint);
  paint();
  return wrap;
}
function accountMenu(anchor) {
  document.querySelector('.acc-menu')?.remove();
  const a = account(); if (!a) return;
  const p = proInfo(), pro = isPro();
  const close = () => { m.remove(); document.removeEventListener('pointerdown', outside, true); };
  const outside = (e) => { if (!m.contains(e.target) && !anchor.contains(e.target)) close(); };
  const item = (icn, t, f, cls = '') => el('button', { class: 'acc-mi ' + cls, onclick: () => { close(); f(); } }, ic(icn), t);
  const m = el('div', { class: 'acc-menu' },
    el('div', { class: 'acc-head' }, avatar(a, 'lg'), el('div', { class: 'acc-who' }, el('b', {}, a.email.split('@')[0]), el('span', {}, a.email))),
    el('div', { class: 'acc-plan' + (pro ? ' pro' : '') },
      pro ? [proMark('sm'), el('div', {}, el('b', {}, 'Про'), el('span', {}, p.canceled ? `до ${day(p.until)}` : `продлится ${day(p.until)}`))]
        : [el('div', {}, el('b', {}, 'Базовый'), el('span', {}, 'бесплатный тариф')), el('button', { class: 'am-btn pro small', onclick: () => { close(); openPro(); } }, 'Про')]),
    item('card', 'Подписка и оплата', manageSub),
    item('exit', 'Выйти', logout),
    item('trash', 'Удалить аккаунт', () => deleteAccount(), 'danger'),
    TEST ? el('div', { class: 'acc-test' }, 'Тестовый режим') : null);
  document.body.append(m);
  const r = anchor.getBoundingClientRect();
  m.style.top = Math.round(r.bottom + 8) + 'px';
  m.style.right = Math.round(Math.max(8, innerWidth - r.right)) + 'px';
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
}
