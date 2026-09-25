import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DICT, detectLang, t, loadLang, saveLang, applyI18n } from '../js/i18n.js';

const memStorage = (init = {}) => {
  const m = { ...init };
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    _m: m,
  };
};

// ---------- F-6: zh/en key sets identical ----------

test('i18n: zh/en key sets are exactly identical', () => {
  const en = Object.keys(DICT.en).sort();
  const zh = Object.keys(DICT.zh).sort();
  assert.deepEqual(zh, en);
  assert.ok(en.length >= 20, `copy key count ${en.length}; full UI copy should have ≥20 keys`);
});

test('i18n: all values are non-empty strings', () => {
  for (const lang of ['en', 'zh']) {
    for (const [k, v] of Object.entries(DICT[lang])) {
      assert.equal(typeof v, 'string', `${lang}.${k}`);
      assert.ok(v.trim().length > 0, `${lang}.${k} is empty`);
    }
  }
});

// ---------- t() lookup / interpolation / fallback ----------

test('t: lookup + {vars} interpolation', () => {
  assert.equal(t('en', 'dropTitle'), 'drag & drop image here');
  assert.equal(t('zh', 'dropTitle'), '拖拽图片到这里');
  assert.equal(t('en', 'statusLine', { w: 120, h: 60, ms: 43 }), 'grid 120×60 · 43 ms');
  assert.equal(t('zh', 'statusLine', { w: 120, h: 60, ms: 43 }), '网格 120×60 · 43 ms');
});

test('t: unknown lang falls back to en; unknown key falls back to the key itself', () => {
  assert.equal(t('fr', 'dropTitle'), DICT.en.dropTitle);
  assert.equal(t('en', 'noSuchKey'), 'noSuchKey');
  assert.equal(t('zh', 'noSuchKey'), 'noSuchKey');
});

// ---------- detectLang (F-4: default navigator.language) ----------

test('detectLang: zh-* → zh, everything else → en, missing → en', () => {
  assert.equal(detectLang({ language: 'zh-CN' }), 'zh');
  assert.equal(detectLang({ language: 'zh-TW' }), 'zh');
  assert.equal(detectLang({ language: 'ZH-hans' }), 'zh');
  assert.equal(detectLang({ language: 'en-US' }), 'en');
  assert.equal(detectLang({ language: 'ja' }), 'en');
  assert.equal(detectLang(null), 'en');
  assert.equal(detectLang({}), 'en');
});

// ---------- Persistence (F-4: localStorage) ----------

test('loadLang: stored zh → zh; invalid value → detectLang; empty storage → detectLang', () => {
  assert.equal(loadLang(memStorage({ 'ascii-lang': 'zh' })), 'zh');
  assert.equal(loadLang(memStorage({ 'ascii-lang': 'en' })), 'en');
  assert.equal(loadLang(memStorage({ 'ascii-lang': 'fr' })), 'en'); // invalid value falls back
  assert.equal(loadLang(memStorage({})), 'en'); // node has no navigator.language → en
});

test('saveLang: writes to storage, readable back via loadLang', () => {
  const s = memStorage();
  saveLang('zh', s);
  assert.equal(s._m['ascii-lang'], 'zh');
  assert.equal(loadLang(s), 'zh');
});

// ---------- applyI18n: <html lang> declaration (T-719 must-fix 1: document has no lang property; must write documentElement) ----------

test('applyI18n: sets the documentElement lang attribute (zh→zh-CN / en→en)', () => {
  const attrs = {};
  const root = {
    querySelectorAll: () => [],
    documentElement: { setAttribute: (k, v) => { attrs[k] = v; } },
  };
  applyI18n(root, 'zh');
  assert.equal(attrs.lang, 'zh-CN');
  applyI18n(root, 'en');
  assert.equal(attrs.lang, 'en');
});

test('applyI18n: root without documentElement (test stub) does not throw', () => {
  assert.doesNotThrow(() => applyI18n({ querySelectorAll: () => [] }, 'zh'));
});
