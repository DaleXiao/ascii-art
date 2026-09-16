// test/seo.test.mjs — SPEC-423 SEO 静态断言
// head 必备标签 / sr-only h1 / footer 双语 / robots / sitemap / og-image / 运行期零外链
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { DICT } from '../js/i18n.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const html = read('index.html');

test('head: title 含 ASCII + 字符画 双关键词', () => {
  const m = html.match(/<title>([^<]+)<\/title>/);
  assert.ok(m, 'has <title>');
  assert.match(m[1], /ASCII/);
  assert.match(m[1], /字符画/);
});

test('head: description 存在且含卖点关键词', () => {
  const m = html.match(/<meta name="description" content="([^"]+)">/);
  assert.ok(m && m[1].length > 40, 'description 非空');
  assert.match(m[1], /不上传/);
  assert.match(m[1], /免费/);
});

test('head: canonical 自指 https://ascii.openclawd.co/', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/ascii\.openclawd\.co\/">/);
});

test('head: og:* 齐全（type/site_name/title/description/url/image 1200x630+alt/locale×2）', () => {
  for (const p of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:url', 'og:image']) {
    assert.match(html, new RegExp(`<meta property="${p}" content="[^"]+"`), p);
  }
  assert.match(html, /property="og:image" content="https:\/\/ascii\.openclawd\.co\/og-image\.png"/);
  assert.match(html, /property="og:image:width" content="1200"/);
  assert.match(html, /property="og:image:height" content="630"/);
  assert.match(html, /property="og:image:alt" content="[^"]+"/);
  assert.match(html, /property="og:locale" content="en_US"/);
  assert.match(html, /property="og:locale:alternate" content="zh_CN"/);
});

test('head: twitter card summary_large_image + title/description/image', () => {
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<meta name="twitter:title" content="[^"]+"/);
  assert.match(html, /<meta name="twitter:description" content="[^"]+"/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/ascii\.openclawd\.co\/og-image\.png"/);
});

test('head: theme-color 双份 media（dark #0a0a0a / light #f5f2e9）', () => {
  assert.match(html, /<meta name="theme-color" media="\(prefers-color-scheme: dark\)" content="#0a0a0a">/);
  assert.match(html, /<meta name="theme-color" media="\(prefers-color-scheme: light\)" content="#f5f2e9">/);
});

test('head: 内联 JSON-LD WebApplication 可解析且字段齐', () => {
  const m = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
  assert.ok(m, 'has application/ld+json script');
  const ld = JSON.parse(m[1]);
  assert.equal(ld['@type'], 'WebApplication');
  assert.equal(ld.url, 'https://ascii.openclawd.co/');
  assert.ok(ld.name && ld.alternateName && ld.description);
  assert.equal(ld.applicationCategory, 'MultimediaApplication');
  assert.deepEqual(ld.inLanguage, ['en', 'zh-CN']);
  assert.equal(ld.offers.price, '0');
  assert.ok(Array.isArray(ld.featureList) && ld.featureList.some((f) => /100% client-side/i.test(f)));
});

test('body: sr-only h1 存在且含双关键词', () => {
  const m = html.match(/<h1 class="sr-only">([^<]+)<\/h1>/);
  assert.ok(m, 'has <h1 class="sr-only">');
  assert.match(m[1], /ASCII/);
  assert.match(m[1], /字符画/);
});

test('footer: 两行化结构 + CSS 工具类', () => {
  assert.match(html, /<span data-i18n="footer">/);
  assert.match(html, /<p class="footer-desc" data-i18n="footerDesc">/);
  const css = read('css/style.css');
  assert.match(css, /\.footer-desc\s*\{/);
  assert.match(css, /\.sr-only\s*\{/);
});

test('i18n: DICT.en/zh 均含 seoTitle + footerDesc；app.js title 跟随语言', () => {
  for (const lang of ['en', 'zh']) {
    assert.ok(DICT[lang].seoTitle, `${lang}.seoTitle`);
    assert.ok(DICT[lang].footerDesc, `${lang}.footerDesc`);
  }
  assert.match(read('js/app.js'), /document\.title = t\(state\.lang, 'seoTitle'\)/);
});

test('robots.txt: allow all + Sitemap 行', () => {
  const robots = read('robots.txt');
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Sitemap: https:\/\/ascii\.openclawd\.co\/sitemap\.xml/);
});

test('sitemap.xml: well-formed 单 URL 含 lastmod/priority', () => {
  const xml = read('sitemap.xml');
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<urlset') && xml.includes('</urlset>'));
  assert.equal((xml.match(/<url>/g) ?? []).length, 1);
  assert.equal((xml.match(/<\/url>/g) ?? []).length, 1);
  assert.match(xml, /<loc>https:\/\/ascii\.openclawd\.co\/<\/loc>/);
  assert.match(xml, /<lastmod>2026-09-16<\/lastmod>/);
  assert.match(xml, /<priority>1\.0<\/priority>/);
});

test('og-image.png: 存在且为 1200x630 PNG', async () => {
  const p = join(ROOT, 'og-image.png');
  assert.ok(existsSync(p), 'og-image.png 存在');
  const meta = await sharp(p).metadata();
  assert.equal(meta.format, 'png');
  assert.equal(meta.width, 1200);
  assert.equal(meta.height, 630);
});

test('运行期零外链: href/src 全相对或 ascii.openclawd.co 自指（SPEC-420 约束）', () => {
  const urls = [...html.matchAll(/(?:href|src)\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(urls.length > 0);
  for (const u of urls) {
    if (/^https?:\/\//i.test(u)) {
      assert.equal(new URL(u).host, 'ascii.openclawd.co', `运行期外链: ${u}`);
    }
  }
  assert.ok(!/<script[^>]+src\s*=\s*"https?:/i.test(html), '外部 script src');
  assert.ok(!/<link[^>]+href\s*=\s*"https?:\/\/(?!ascii\.openclawd\.co)/i.test(html), '外部 link href');
});
