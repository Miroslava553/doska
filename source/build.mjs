// Сборка в один самодостаточный HTML-файл: никаких внешних CDN.
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import { RELEASE } from './src/changelog.js';

fs.mkdirSync('src/gen', { recursive: true });
fs.copyFileSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'src/gen/pdfworker.txt');

// Версия сборки: по ней открытая доска узнаёт, что вышло обновление
const d = new Date(); const pad = (n) => String(n).padStart(2, '0');
const VERSION = `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
const res = await esbuild.build({
  entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify: true, write: false,
  target: ['chrome100', 'firefox100', 'safari15'], loader: { '.txt': 'text' }, legalComments: 'none',
  logLevel: 'warning', define: { 'import.meta.url': '""', __VERSION__: JSON.stringify(VERSION) }, supported: { 'top-level-await': false },
});
const js = res.outputFiles[0].text;
const mathjax = fs.readFileSync('node_modules/mathjax/es5/tex-svg-full.js', 'utf8');
const css = fs.readFileSync('src/style.css', 'utf8');
const esc = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const mjConfig = `window.MathJax={loader:{load:[]},startup:{typeset:false},options:{enableMenu:false,enableAssistiveMml:false,enableEnrichment:false},svg:{fontCache:'none'},tex:{packages:{'[+]':['ams','physics','mhchem','cancel','color','boldsymbol']}}};`;

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<title>Доска для занятий</title>
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
fs.writeFileSync('dist/doska.html', html);
// Сайт для GitHub Pages: та же доска + файл версии
fs.mkdirSync('dist/site', { recursive: true });
fs.writeFileSync('dist/site/index.html', html);
fs.writeFileSync('dist/site/version.json', JSON.stringify({ v: VERSION, notes: RELEASE }));
fs.writeFileSync('dist/site/.nojekyll', '');
console.log('version', VERSION, '| dist/doska.html', (html.length / 1024 / 1024).toFixed(2), 'MB; app js', (js.length / 1024).toFixed(0), 'KB');
