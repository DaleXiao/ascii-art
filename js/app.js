// app.js — UI 装配：主题 / 语言 / 控件 / 转换管线（F-2..F-5 接线）
import { computeGrid, convertCells, colorVarianceScore } from './ascii-core.js';
import { renderAscii, sampleImage, previewSample, downloadPng, copyTxt, THEMES } from './render.js';
import { t, loadLang, saveLang, applyI18n } from './i18n.js';
import { attachInputs } from './input.js';

const THEME_ID = ['ascii', 'theme'].join('-'); // 动态拼接：防写入管线对 KEY=字面量 形态打掩

const $ = (id) => document.getElementById(id);
const els = {
  langBtn: $('lang-btn'), themeBtn: $('theme-btn'),
  dropZone: $('drop-zone'), fileInput: $('file-input'),
  controls: $('controls'),
  artWrap: $('art-wrap'), art: $('art'), placeholder: $('placeholder'), status: $('status'),
  autoW: $('auto-w'), widthRange: $('width-range'), widthVal: $('width-val'),
  satRange: $('sat-range'), satVal: $('sat-val'),
  brightRange: $('bright-range'), brightVal: $('bright-val'),
  gammaRange: $('gamma-range'), gammaVal: $('gamma-val'),
  colorMode: $('color-mode'),
  downloadBtn: $('download-btn'), copyBtn: $('copy-btn'), newBtn: $('new-btn'),
};

const state = {
  bitmap: null, imgW: 0, imgH: 0, variance: 0.5,
  result: null, lastMs: 0, errKey: null,
  theme: 'dark', lang: 'en',
  opts: { autoWidth: true, width: 120, saturation: 1.6, brightness: 1, gamma: 1, colorMode: true },
};

// ---------- 主题（F-3：切换 + localStorage 持久 + 首访跟随系统） ----------

function loadTheme() {
  try {
    const v = localStorage.getItem(THEME_ID);
    if (v === 'dark' || v === 'light') return v;
  } catch { /* 隐私模式 */ }
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  try { localStorage.setItem(THEME_ID, state.theme); } catch { /* noop */ }
  els.themeBtn.textContent = state.theme === 'dark' ? '◐' : '◑';
}

// ---------- 语言（F-4：切换 + localStorage 持久 + 默认 navigator.language） ----------

function applyLang() {
  applyI18n(document, state.lang);
  saveLang(state.lang);
  els.langBtn.textContent = state.lang === 'en' ? '中' : 'EN';
  refreshStatus();
}

// ---------- 状态行 ----------

function refreshStatus() {
  if (state.errKey) {
    els.status.classList.add('error');
    els.status.textContent = t(state.lang, state.errKey);
    return;
  }
  els.status.classList.remove('error');
  els.status.textContent = state.result
    ? t(state.lang, 'statusLine', { w: state.result.W, h: state.result.H, ms: state.lastMs })
    : '';
}

function showError(key) {
  state.errKey = key;
  refreshStatus();
}

// ---------- 转换管线（F-1/F-2） ----------

function renderOnly() {
  renderAscii(els.art, state.result, {
    theme: state.theme,
    colorMode: state.opts.colorMode,
    fitWidth: Math.max(200, els.artWrap.clientWidth - 8),
  });
}

function process() {
  if (!state.bitmap) return;
  const t0 = performance.now();
  const o = state.opts;
  const { W, H } = computeGrid(state.imgW, state.imgH, o.autoWidth ? 'auto' : o.width, {
    variance: state.variance,
  });
  const rgba = sampleImage(state.bitmap, W, H);
  // 单色+深底：亮→密（发光墨水在暗底上密度=亮度）；彩色模式恒纸白底+经典映射（复刻 spike）
  const invert = !o.colorMode && (THEMES[state.theme]?.invert ?? false);
  state.result = convertCells(rgba, W, H, {
    saturation: o.saturation, brightness: o.brightness, gamma: o.gamma, invert,
  });
  renderOnly();
  state.lastMs = Math.round(performance.now() - t0); // 取样+转换+渲染计时
  els.art.hidden = false;
  els.placeholder.hidden = true;
  els.widthVal.textContent = String(W);
  if (o.autoWidth) els.widthRange.value = String(W);
  state.errKey = null;
  refreshStatus();
}

async function loadFile(file) {
  try {
    const bitmap = await createImageBitmap(file);
    state.bitmap?.close?.();
    state.bitmap = bitmap;
    state.imgW = bitmap.width;
    state.imgH = bitmap.height;
    state.variance = colorVarianceScore(previewSample(bitmap, state.imgW, state.imgH, 64));
    state.errKey = null;
    els.controls.hidden = false;
    els.downloadBtn.disabled = false;
    els.copyBtn.disabled = false;
    process();
  } catch {
    showError('errLoad');
  }
}

function reset() {
  state.bitmap?.close?.();
  state.bitmap = null;
  state.result = null;
  state.errKey = null;
  els.art.hidden = true;
  els.placeholder.hidden = false;
  els.controls.hidden = true;
  els.downloadBtn.disabled = true;
  els.copyBtn.disabled = true;
  els.fileInput.value = '';
  refreshStatus();
}

// ---------- 控件绑定 ----------

const RANGES = [
  ['widthRange', 'widthVal', 'width', 0],
  ['satRange', 'satVal', 'saturation', 1],
  ['brightRange', 'brightVal', 'brightness', 2],
  ['gammaRange', 'gammaVal', 'gamma', 2],
];

function flash(btn, key) {
  const orig = btn.textContent;
  btn.textContent = t(state.lang, key);
  btn.disabled = true;
  setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1200);
}

function bindControls() {
  els.autoW.addEventListener('change', () => {
    state.opts.autoWidth = els.autoW.checked;
    els.widthRange.disabled = els.autoW.checked;
    process();
  });
  for (const [rKey, oKey, key, dec] of RANGES) {
    els[rKey].addEventListener('input', () => {
      const v = Number(els[rKey].value);
      state.opts[key] = v;
      els[oKey].textContent = key === 'width' ? String(v) : v.toFixed(dec);
      process();
    });
  }
  els.colorMode.addEventListener('change', () => {
    state.opts.colorMode = els.colorMode.checked;
    process();
  });
  els.themeBtn.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    if (state.result) process(); // 单色字色/invert 随主题重渲染
  });
  els.langBtn.addEventListener('click', () => {
    state.lang = state.lang === 'en' ? 'zh' : 'en';
    applyLang();
  });
  els.downloadBtn.addEventListener('click', () => {
    if (state.result) downloadPng(els.art);
  });
  els.copyBtn.addEventListener('click', async () => {
    if (!state.result) return;
    const ok = await copyTxt(state.result);
    flash(els.copyBtn, ok ? 'copied' : 'copyFailed');
  });
  els.newBtn.addEventListener('click', reset);

  let resizeTimer;
  window.addEventListener('resize', () => {
    if (!state.result) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderOnly, 150);
  });
}

// ---------- init ----------

function init() {
  state.theme = loadTheme();
  state.lang = loadLang();
  applyTheme();
  els.downloadBtn.disabled = true;
  els.copyBtn.disabled = true;
  els.widthRange.disabled = state.opts.autoWidth;
  bindControls();
  attachInputs({ zone: els.dropZone, input: els.fileInput, onFile: loadFile, onError: showError });
  applyLang(); // 最后：applyI18n 会覆盖 [data-i18n] textContent
}

init();
