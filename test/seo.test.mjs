// seo.test.mjs — SPEC-423 SEO asset assertions (pure fs reads, no sharp dependency)
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

test('seo: title carries both Chinese and English keywords', () => {
  const m = html.match(/<title>([^<]+)<\/title>/);
  assert.ok(m, 'title tag');
  assert.ok(m[1].includes('ASCII Art Converter'), 'en keyword present');
  assert.ok(m[1].includes('图片转 ASCII 字符画'), 'zh keyword present');
});

test('seo: description is bilingual', () => {
  const m = html.match(/<meta name="description" content="([^"]+)"/);
  assert.ok(m && m[1].includes('字符画') && m[1].toLowerCase().includes('ascii art'));
});

test('seo: canonical points to the production domain', () => {
  assert.ok(html.includes('<link rel="canonical" href="https://ascii.openclawd.co/">'));
});

test('seo: core OG tags present', () => {
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

test('seo: JSON-LD WebApplication is valid JSON with all fields', () => {
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

test('seo: sr-only h1 exists and the CSS utility class is present', () => {
  assert.match(html, /<h1 class="sr-only">[^<]*ASCII Art Converter[^<]*<\/h1>/);
  assert.ok(css.includes('.sr-only'));
  assert.ok(css.includes('.footer-desc'));
});

test('seo: footer extension + both i18n dictionaries contain the new keys', () => {
  assert.ok(html.includes('data-i18n="footerDesc"'));
  for (const lang of ['en', 'zh']) {
    assert.ok(DICT[lang].footerDesc?.length > 40, `${lang}.footerDesc`);
    assert.ok(DICT[lang].seoTitle?.includes('ASCII'), `${lang}.seoTitle`);
  }
});

test('seo: applyLang switches document.title (seoTitle)', () => {
  assert.match(app, /document\.title\s*=\s*t\(\s*state\.lang,\s*['"]seoTitle['"]\s*\)/);
});

test('seo: robots.txt allows all + sitemap reference', () => {
  assert.ok(robots.includes('User-agent: *'));
  assert.ok(robots.includes('Allow: /'));
  assert.ok(robots.includes('Sitemap: https://ascii.openclawd.co/sitemap.xml'));
});

test('seo: sitemap.xml structure is complete', () => {
  assert.ok(sitemap.startsWith('<?xml'));
  assert.ok(sitemap.includes('<loc>https://ascii.openclawd.co/</loc>'));
  assert.ok(sitemap.includes('</urlset>'));
});

test('seo: og-image.png is a 1200×630 PNG (IHDR byte check)', () => {
  const p = path.join(ROOT, 'og-image.png');
  assert.ok(existsSync(p), 'og-image.png exists');
  const buf = readFileSync(p);
  assert.deepEqual(buf.subarray(1, 4), Buffer.from('PNG'));
  assert.equal(buf.readUInt32BE(16), 1200);
  assert.equal(buf.readUInt32BE(20), 630);
});

test('seo: runtime assets still have zero external links (css/js/png refs all relative, ?v= version strings tolerated)', () => {
  const refs = [...html.matchAll(/(?:src|href)="([^"]+\.(?:css|js|png)(?:\?[^"]*)?)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 3, 'at least favicon/stylesheet/app.js');
  for (const u of refs) assert.ok(!/^https?:/.test(u), `external asset: ${u}`);
});

test('cache: asset URLs are versioned (SPEC-424 skew-regression guard)', () => {
  assert.ok(html.includes('href="css/style.css?v='), 'stylesheet carries a version');
  assert.ok(html.includes('src="js/app.js?v='), 'app.js carries a version');
  const appSrc = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  for (const m of ['./ascii-core.js', './render.js', './i18n.js', './input.js']) {
    assert.ok(appSrc.includes(`from '${m}?v=`), `app.js import ${m} carries a version`);
  }
  const renderSrc = readFileSync(path.join(ROOT, 'js/render.js'), 'utf8');
  assert.ok(renderSrc.includes("from './ascii-core.js?v="), 'render.js import carries a version');
});

test('cache: _headers site-wide no-cache (root fix for CF Pages skew)', () => {
  const headers = readFileSync(path.join(ROOT, '_headers'), 'utf8');
  assert.match(headers, /^\/\*/m);
  assert.match(headers, /Cache-Control:\s*no-cache/);
});
