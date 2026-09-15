import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DICT, detectLang, t, loadLang, saveLang } from '../js/i18n.js';

const memStorage = (init = {}) => {
  const m = { ...init };
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    _m: m,
  };
};

// ---------- F-6: zh/en key 集合一致 ----------

test('i18n: zh/en key 集合完全一致', () => {
  const en = Object.keys(DICT.en).sort();
  const zh = Object.keys(DICT.zh).sort();
  assert.deepEqual(zh, en);
  assert.ok(en.length >= 20, `文案键数量 ${en.length}，全量 UI 文案应 ≥20`);
});

test('i18n: 所有值为非空字符串', () => {
  for (const lang of ['en', 'zh']) {
    for (const [k, v] of Object.entries(DICT[lang])) {
      assert.equal(typeof v, 'string', `${lang}.${k}`);
      assert.ok(v.trim().length > 0, `${lang}.${k} 为空`);
    }
  }
});

// ---------- t() 取词 / 插值 / 回退 ----------

test('t: 取词 + {vars} 插值', () => {
  assert.equal(t('en', 'dropTitle'), 'drag & drop image here');
  assert.equal(t('zh', 'dropTitle'), '拖拽图片到这里');
  assert.equal(t('en', 'statusLine', { w: 120, h: 60, ms: 43 }), 'grid 120×60 · 43 ms');
  assert.equal(t('zh', 'statusLine', { w: 120, h: 60, ms: 43 }), '网格 120×60 · 43 ms');
});

test('t: 未知 lang 回退 en；未知 key 回退 key 本身', () => {
  assert.equal(t('fr', 'dropTitle'), DICT.en.dropTitle);
  assert.equal(t('en', 'noSuchKey'), 'noSuchKey');
  assert.equal(t('zh', 'noSuchKey'), 'noSuchKey');
});

// ---------- detectLang（F-4: 默认 navigator.language） ----------

test('detectLang: zh-* → zh，其余 → en，缺失 → en', () => {
  assert.equal(detectLang({ language: 'zh-CN' }), 'zh');
  assert.equal(detectLang({ language: 'zh-TW' }), 'zh');
  assert.equal(detectLang({ language: 'ZH-hans' }), 'zh');
  assert.equal(detectLang({ language: 'en-US' }), 'en');
  assert.equal(detectLang({ language: 'ja' }), 'en');
  assert.equal(detectLang(null), 'en');
  assert.equal(detectLang({}), 'en');
});

// ---------- 持久化（F-4: localStorage） ----------

test('loadLang: 已存 zh → zh；非法值 → detectLang；空 storage → detectLang', () => {
  assert.equal(loadLang(memStorage({ 'ascii-lang': 'zh' })), 'zh');
  assert.equal(loadLang(memStorage({ 'ascii-lang': 'en' })), 'en');
  assert.equal(loadLang(memStorage({ 'ascii-lang': 'fr' })), 'en'); // 非法回退
  assert.equal(loadLang(memStorage({})), 'en'); // node 无 navigator.language → en
});

test('saveLang: 写入 storage，可被 loadLang 读回', () => {
  const s = memStorage();
  saveLang('zh', s);
  assert.equal(s._m['ascii-lang'], 'zh');
  assert.equal(loadLang(s), 'zh');
});
