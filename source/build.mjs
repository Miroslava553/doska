// Сборка в один самодостаточный HTML-файл: никаких внешних CDN.
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import { RELEASE, releaseFor } from './src/changelog.js';

fs.mkdirSync('src/gen', { recursive: true });
fs.copyFileSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'src/gen/pdfworker.txt');

// Версия сборки: по ней открытая доска узнаёт, что вышло обновление
const d = new Date(); const pad = (n) => String(n).padStart(2, '0');
const VERSION = `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
const bundle = async (accounts, server = false) => (await esbuild.build({
  entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify: true, write: false,
  target: ['chrome100', 'firefox100', 'safari15'], loader: { '.txt': 'text' }, legalComments: 'none',
  logLevel: 'warning', define: { 'import.meta.url': '""', __VERSION__: JSON.stringify(VERSION), __ACCOUNTS__: String(accounts), __SERVER__: String(server) }, supported: { 'top-level-await': false },
})).outputFiles[0].text;
// Тестовый файл — со входом и подпиской «понарошку». Сайт — без них, пока нет сервера (все возможности открыты).
const ACC_TEST = process.env.NO_ACCOUNTS ? false : true;
const jsTest = await bundle(ACC_TEST), jsSite = await bundle(false), jsLodl = await bundle(true, true);
const js = jsTest;
const mathjax = fs.readFileSync('node_modules/mathjax/es5/tex-svg-full.js', 'utf8');
const css = fs.readFileSync('src/style.css', 'utf8') + '\n' + fs.readFileSync('src/pro.css', 'utf8');
const esc = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const mjConfig = `window.MathJax={loader:{load:[]},startup:{typeset:false},options:{enableMenu:false,enableAssistiveMml:false,enableEnrichment:false},svg:{fontCache:'none'},tex:{packages:{'[+]':['ams','physics','mhchem','cancel','color','boldsymbol']}}};`;

const page = (js) => `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<title>Lodl · онлайн-доска для занятий</title>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#4c6ef5"/><path d="M8 22l3-1 11-11-2-2-11 11z" fill="#fff"/></svg>')}">
<style>${css}</style>
</head>
<body>
<script>${esc(mjConfig)}</script>
<script>${esc(mathjax)}</script>
<script>${esc(js)}</script>
</body>
</html>`;
fs.mkdirSync('dist', { recursive: true });
const html = page(jsTest);
fs.writeFileSync('dist/doska.html', html);
// Сайт для GitHub Pages: та же доска + файл версии
fs.mkdirSync('dist/site', { recursive: true });
fs.writeFileSync('dist/site/index.html', page(jsSite));
fs.writeFileSync('dist/site/version.json', JSON.stringify({ v: VERSION, notes: releaseFor(false) }));
fs.writeFileSync('dist/site/.nojekyll', '');
// страницы с условиями, реквизитами и политикой конфиденциальности
for (const f of ['terms.html', 'privacy.html']) { fs.copyFileSync('src/pages/' + f, 'dist/site/' + f); fs.copyFileSync('src/pages/' + f, 'dist/' + f); }
// Сайт на своём домене с сервером: настоящий вход, оплата через ЮKassa и облако. Лежит в папке lodl/ репозитория, сервер берёт его оттуда.
fs.mkdirSync('dist/lodl', { recursive: true });
fs.writeFileSync('dist/lodl/index.html', page(jsLodl));
fs.writeFileSync('dist/lodl/version.json', JSON.stringify({ v: VERSION, notes: releaseFor(true) }));
for (const f of ['terms.html', 'privacy.html', 'logo.png', 'robots.txt']) if (fs.existsSync('src/pages/' + f)) fs.copyFileSync('src/pages/' + f, 'dist/lodl/' + f);
// Когда домен заработает: MOVE_TO=https://lodl.ru node build.mjs — старый адрес на GitHub переносит доски и ведёт на новый
if (process.env.MOVE_TO) {
  const to = process.env.MOVE_TO.replace(/\/$/, '');
  fs.writeFileSync('dist/site/index.html', fs.readFileSync('src/pages/move.html', 'utf8').replaceAll('%TARGET%', to).replaceAll('%HOST%', new URL(to).host));
  fs.writeFileSync('dist/site/version.json', JSON.stringify({ v: VERSION, notes: [], moved: to }));
  console.log('старый адрес ведёт на', to);
}
console.log('version', VERSION, '| dist/doska.html', (html.length / 1024 / 1024).toFixed(2), 'MB; app js', (js.length / 1024).toFixed(0), 'KB');
