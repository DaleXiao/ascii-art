// seo.test.mjs — SPEC-423 SEO 资产断言（纯 fs 读，无 sharp 依赖）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DICT } from '../js/i18n.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const robots = readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
const sitemap = readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const css = readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
const app = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');

test('seo: title 中英关键词齐', () => {
  const m = html.match(/<title>([^<]+)<\/title>/);
  assert.ok(m, 'title tag');
  assert.ok(m[1].includes('ASCII Art Converter'), 'en 关键词');
  assert.ok(m[1].includes('图片转 ASCII 字符画'), 'zh 关键词');
});

test('seo: description 双语', () => {
  const m = html.match(/<meta name="description" content="([^"]+)"/);
  assert.ok(m && m[1].includes('字符画') && m[1].toLowerCase().includes('ascii art'));
});

test('seo: canonical 指向线上域', () => {
  assert.ok(html.includes('<link rel="canonical" href="https://ascii.openclawd.co/">'));
});

test('seo: OG 核心标签齐', () => {
  for (const p of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:url',
    'og:image', 'og:image:width', 'og:image:height', 'og:image:alt', 'og:locale']) {
    assert.ok(html.includes(`property="${p}"`), p);
  }
  assert.ok(html.includes('content="https://ascii.openclawd.co/og-image.png"'));
});

test('seo: twitter card summary_large_image', () => {
  assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
  assert.ok(html.includes('name="twitter:image"'));
});

test('seo: JSON-LD WebApplication 合法 JSON 且字段齐', () => {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'ld+json block');
  const ld = JSON.parse(m[1]);
  assert.equal(ld['@context'], 'https://schema.org');
  assert.equal(ld['@type'], 'WebApplication');
  assert.equal(ld.url, 'https://ascii.openclawd.co/');
  assert.ok(ld.inLanguage.includes('en') && ld.inLanguage.includes('zh-CN'));
  assert.equal(ld.offers.price, '0');
  assert.ok(Array.isArray(ld.featureList) && ld.featureList.length >= 4);
});

test('seo: sr-only h1 存在且 CSS 有工具类', () => {
  assert.match(html, /<h1 class="sr-only">[^<]*ASCII Art Converter[^<]*<\/h1>/);
  assert.ok(css.includes('.sr-only'));
  assert.ok(css.includes('.footer-desc'));
});

test('seo: footer 扩展 + i18n 双字典含新 key', () => {
  assert.ok(html.includes('data-i18n="footerDesc"'));
  for (const lang of ['en', 'zh']) {
    assert.ok(DICT[lang].footerDesc?.length > 40, `${lang}.footerDesc`);
    assert.ok(DICT[lang].seoTitle?.includes('ASCII'), `${lang}.seoTitle`);
  }
});

test('seo: applyLang 切换 document.title（seoTitle）', () => {
  assert.match(app, /document\.title\s*=\s*t\(\s*state\.lang,\s*['"]seoTitle['"]\s*\)/);
});

test('seo: robots.txt allow all + sitemap 指向', () => {
  assert.ok(robots.includes('User-agent: *'));
  assert.ok(robots.includes('Allow: /'));
  assert.ok(robots.includes('Sitemap: https://ascii.openclawd.co/sitemap.xml'));
});

test('seo: sitemap.xml 结构完整', () => {
  assert.ok(sitemap.startsWith('<?xml'));
  assert.ok(sitemap.includes('<loc>https://ascii.openclawd.co/</loc>'));
  assert.ok(sitemap.includes('</urlset>'));
});

test('seo: og-image.png 为 1200×630 PNG（IHDR 字节校验）', () => {
  const p = path.join(ROOT, 'og-image.png');
  assert.ok(existsSync(p), 'og-image.png 存在');
  const buf = readFileSync(p);
  assert.deepEqual(buf.subarray(1, 4), Buffer.from('PNG'));
  assert.equal(buf.readUInt32BE(16), 1200);
  assert.equal(buf.readUInt32BE(20), 630);
});

test('seo: 运行期资源仍零外链（css/js/png 引用全相对，兼容 ?v= 版本串）', () => {
  const refs = [...html.matchAll(/(?:src|href)="([^"]+\.(?:css|js|png)(?:\?[^"]*)?)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 3, '至少 favicon/stylesheet/app.js');
  for (const u of refs) assert.ok(!/^https?:/.test(u), `外链资源: ${u}`);
});

test('cache: 资源 URL 版本化（SPEC-424 偏斜防复发）', () => {
  assert.ok(html.includes('href="css/style.css?v='), 'stylesheet 带版本号');
  assert.ok(html.includes('src="js/app.js?v='), 'app.js 带版本号');
  const appSrc = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  for (const m of ['./ascii-core.js', './render.js', './i18n.js', './input.js']) {
    assert.ok(appSrc.includes(`from '${m}?v=`), `app.js import ${m} 带版本号`);
  }
  const renderSrc = readFileSync(path.join(ROOT, 'js/render.js'), 'utf8');
  assert.ok(renderSrc.includes("from './ascii-core.js?v="), 'render.js import 带版本号');
});

test('cache: _headers 全站 no-cache（CF Pages 偏斜根修）', () => {
  const headers = readFileSync(path.join(ROOT, '_headers'), 'utf8');
  assert.match(headers, /^\/\*/m);
  assert.match(headers, /Cache-Control:\s*no-cache/);
});
