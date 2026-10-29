// Письма Lodl. Вёрстка таблицами и стили в атрибутах: так письмо одинаково выглядит в Gmail, Яндекс Почте, Mail.ru и Outlook.
'use strict';
const env = process.env;
let transport = null;
function tr() {
  if (transport || !env.SMTP_HOST) return transport;
  const nodemailer = require('nodemailer');
  const port = +env.SMTP_PORT || 465;
  transport = nodemailer.createTransport({ host: env.SMTP_HOST, port, secure: port === 465, auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined, pool: true, maxConnections: 3 });
  return transport;
}
const ready = () => !!env.SMTP_HOST;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function layout({ site, title, pre, blocks }) {
  const p = (t, extra = '') => `<tr><td style="font-size:16px;line-height:24px;color:#15171a;padding:0 0 14px;${extra}">${t}</td></tr>`;
  const body = blocks.map((b) => {
    if (b.code) return `<tr><td style="background:#f1f3f9;border-radius:12px;padding:18px 20px;"><span style="font-family:'SF Mono',Menlo,Consolas,'Courier New',monospace;font-size:32px;line-height:36px;font-weight:700;letter-spacing:8px;color:#15171a;">${esc(b.code)}</span></td></tr><tr><td style="height:16px;"></td></tr>`;
    if (b.button) return `<tr><td style="padding:6px 0 20px;"><a href="${esc(b.href)}" style="display:inline-block;background:#4c6ef5;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;line-height:20px;padding:13px 22px;border-radius:10px;">${esc(b.button)}</a></td></tr>`;
    if (b.muted) return p(esc(b.muted), 'color:#6c727f;font-size:14px;line-height:21px;');
    return p(esc(b.text));
  }).join('');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#ffffff;">${esc(pre)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;"><tr><td align="center" style="padding:40px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:460px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#15171a;">
<tr><td style="padding:0 0 28px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="vertical-align:middle;"><img src="${esc(site)}/logo.png" width="40" height="40" alt="" style="display:block;border:0;border-radius:11px;"></td><td style="vertical-align:middle;padding-left:12px;font-size:20px;font-weight:700;color:#15171a;">Lodl</td></tr></table></td></tr>
<tr><td style="font-size:24px;line-height:30px;font-weight:700;padding:0 0 20px;">${esc(title)}</td></tr>
${body}
<tr><td style="font-size:13px;line-height:19px;color:#9aa0ab;padding:18px 0 0;border-top:1px solid #eceef3;">Это письмо от онлайн-доски Lodl, ${esc(site.replace(/^https?:\/\//, ''))}. Если вы не пользуетесь Lodl, просто удалите его.</td></tr>
</table></td></tr></table></body></html>`;
}
const per = (p) => (p === 'year' ? 'год' : 'месяц');

const T = {
  code: (d) => ({ subject: `Код для входа в Lodl: ${d.code}`, title: 'Код для входа', pre: 'Код действует 10 минут.',
    blocks: [{ code: d.code }, { muted: 'Код действует 10 минут. Если вы не входили в Lodl, ничего делать не нужно.' }] }),
  paid: (d) => ({ subject: 'Подписка Lodl Про оформлена', title: 'Спасибо, Про включён', pre: `Оплата ${d.amount} прошла.`,
    blocks: [{ text: `Оплата ${d.amount} прошла, подписка Про оформлена на ${per(d.period)}. Она действует до ${d.until}.` },
      { text: d.autopay ? `${d.until} подписка продлится сама, а за три дня до списания мы пришлём напоминание. Отменить продление можно в любой момент в разделе «Подписка и оплата».` : 'Перед окончанием подписки мы пришлём напоминание, и её можно будет продлить.' },
      { button: 'Открыть Lodl', href: d.site }, { muted: 'Чек об оплате придёт отдельным письмом.' }] }),
  renewed: (d) => ({ subject: 'Подписка Lodl Про продлена', title: 'Подписка продлена', pre: `Списали ${d.amount}.`,
    blocks: [{ text: `Мы списали ${d.amount} и продлили Про ещё на ${per(d.period)}. Теперь подписка действует до ${d.until}.` },
      { text: 'Отменить продление можно в любой момент в разделе «Подписка и оплата». Он открывается кнопкой справа вверху на главной странице.' },
      { button: 'Подписка и оплата', href: d.site + '/?sub=1' }, { muted: 'Чек об оплате придёт отдельным письмом.' }] }),
  reminder: (d) => ({ subject: `${d.date} подписка Lodl Про продлится`, title: 'Скоро продление подписки', pre: `${d.date} спишем ${d.amount}.`,
    blocks: [{ text: `${d.date} подписка Про продлится ещё на ${per(d.period)}, и мы спишем ${d.amount} с той же карты или счёта.` },
      { text: 'Если подписка больше не нужна, отмените её до этой даты. Про будет работать до конца оплаченного периода, а доски и материалы останутся у вас.' },
      { button: 'Подписка и оплата', href: d.site + '/?sub=1' }] }),
  failed: (d) => ({ subject: 'Не получилось продлить Lodl Про', title: 'Не получилось продлить подписку', pre: 'Оплатите подписку, чтобы Про продолжил работать.',
    blocks: [{ text: 'Мы попробовали продлить подписку Про, но банк не провёл платёж. Такое бывает, если на карте не хватило денег или она перестала работать.' },
      { text: `Про будет работать до ${d.until}. Мы попробуем списать оплату ещё раз завтра. Можно не ждать и оплатить подписку с другой карты.` },
      { button: 'Оплатить подписку', href: d.site + '/?sub=1' }] }),
};
T.feedback = (d) => ({ subject: `Lodl: ${d.kind.toLowerCase()} от пользователя`, title: `${d.kind} от пользователя`, pre: d.text.slice(0, 80),
  blocks: [{ text: d.text }, { muted: `Почта для ответа: ${d.contact}` }, { muted: d.info }] });
const textOf = (m) => [m.title, '', ...m.blocks.map((b) => b.code || b.text || b.muted || (b.button ? `${b.button}: ${b.href}` : '')).filter(Boolean)].join('\n\n');

async function send(to, kind, data) {
  const m = T[kind](data);
  const t = tr();
  if (!t) { console.log(`[письмо не отправлено: почта не настроена] ${to}: ${m.subject}`); return; }
  await t.sendMail({ from: env.MAIL_FROM || `Lodl <no-reply@${new URL(data.site).hostname}>`, to, ...(data.replyTo ? { replyTo: data.replyTo } : {}), subject: m.subject, text: textOf(m), html: layout({ site: data.site, ...m }) });
}
module.exports = { send, ready, preview: (kind, data) => layout({ site: data.site, ...T[kind](data) }) };
