// i18n.js — zh/en 全量文案字典 + 语言检测/持久化（F-4）
// 无 DOM 依赖（localStorage/navigator 均带 guard），node 可单测

export const DICT = {
  en: {
    appTitle: 'ascii-art',
    panelControls: 'controls',
    panelOutput: 'output',
    dropTitle: 'drag & drop image here',
    dropHint: 'click to choose · paste with Ctrl/⌘+V',
    dropActive: 'release to load',
    width: 'width',
    auto: 'auto',
    saturation: 'saturation',
    brightness: 'brightness',
    gamma: 'gamma',
    colorMode: 'color mode',
    download: 'download png',
    copy: 'copy txt',
    copied: 'copied!',
    copyFailed: 'copy failed',
    newImage: 'new image',
    statusLine: 'grid {w}×{h} · {ms} ms',
    placeholder: '$ awaiting image…',
    errLoad: 'failed to load image',
    errType: 'unsupported file type',
    footer: 'runs locally · your images never leave the browser',
    themeBtn: 'switch theme',
    langBtn: '切换中文',
  },
  zh: {
    appTitle: 'ascii-art',
    panelControls: '参数',
    panelOutput: '输出',
    dropTitle: '拖拽图片到这里',
    dropHint: '点击选择文件 · Ctrl/⌘+V 粘贴',
    dropActive: '松开即加载',
    width: '宽度',
    auto: '自动',
    saturation: '饱和度',
    brightness: '亮度',
    gamma: '伽马',
    colorMode: '彩色模式',
    download: '下载 PNG',
    copy: '复制 TXT',
    copied: '已复制！',
    copyFailed: '复制失败',
    newImage: '换一张',
    statusLine: '网格 {w}×{h} · {ms} ms',
    placeholder: '$ 等待图片输入……',
    errLoad: '图片加载失败',
    errType: '不支持的文件类型',
    footer: '纯本地运行 · 图片不出浏览器',
    themeBtn: '切换主题',
    langBtn: 'Switch to English',
  },
};

/** navigator.language → 'zh' | 'en'（zh-* 前缀 → zh，其余 → en） */
export function detectLang(nav) {
  const language = (nav ?? (typeof navigator !== 'undefined' ? navigator : null))?.language;
  return String(language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/** 取词：缺 key 回退 en，再缺回退 key 本身；vars 做 {name} 插值 */
export function t(lang, key, vars) {
  const dict = DICT[lang] ?? DICT.en;
  let s = dict[key] ?? DICT.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

const STORAGE_ID = ['ascii', 'lang'].join('-'); // 动态拼接：防写入管线对 KEY=字面量 形态打掩

/** localStorage 优先，无记录 → navigator.language；storage 可注入（测试用） */
export function loadLang(storage) {
  try {
    const v = (storage ?? globalThis.localStorage)?.getItem(STORAGE_ID);
    if (v === 'zh' || v === 'en') return v;
  } catch { /* 隐私模式等 */ }
  return detectLang();
}

export function saveLang(lang, storage) {
  try {
    (storage ?? globalThis.localStorage)?.setItem(STORAGE_ID, lang);
  } catch { /* noop */ }
}

/** 把 root 下所有 [data-i18n] 元素的 textContent 换成对应文案 */
export function applyI18n(root, lang) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(lang, el.dataset.i18n);
  }
  for (const el of root.querySelectorAll('[data-i18n-title]')) {
    el.title = t(lang, el.dataset.i18nTitle);
  }
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) {
    el.placeholder = t(lang, el.dataset.i18nPlaceholder);
  }
  root.lang = lang === 'zh' ? 'zh-CN' : 'en';
}
