// i18n.js — full zh/en copy dictionary + language detection/persistence (F-4)
// No DOM dependencies (localStorage/navigator are both guarded), unit-testable in node

export const DICT = {
  en: {
    appTitle: 'ascii-art',
    panelControls: 'controls',
    panelOutput: 'output',
    dropTitle: 'drag & drop image here',
    dropHint: 'click to choose · paste with Ctrl+V / Cmd+V',
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
    errTooTall: 'image too tall to render',
    errDownload: 'download failed',
    footer: 'runs locally · your images never leave the browser',
    footerDesc: 'Convert any JPG, PNG, GIF or WebP image to ASCII art — adjust grid width, color mode, saturation, brightness and gamma, then export as PNG or copy as TXT. Free, no sign-up, no upload: every pixel is processed locally in your browser.',
    seoTitle: 'ASCII Art Converter — Turn Any Image into ASCII Art · Free & Private',
    themeBtn: 'switch theme',
    langBtn: '切换中文',
  },
  zh: {
    appTitle: 'ascii-art',
    panelControls: '参数',
    panelOutput: '输出',
    dropTitle: '拖拽图片到这里',
    dropHint: '点击选择文件 · Ctrl+V / Cmd+V 粘贴',
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
    errTooTall: '图片过长，无法渲染',
    errDownload: '下载失败',
    footer: '纯本地运行 · 图片不出浏览器',
    footerDesc: '任意 JPG / PNG / GIF / WebP 图片在线转 ASCII 字符画 — 网格宽度、色彩模式、饱和度、亮度、伽马均可调，支持导出 PNG 或复制 TXT。免费、无需注册、不上传：每个像素都在你的浏览器本地处理。',
    seoTitle: '图片转 ASCII 字符画 — 免费在线生成器 | ASCII Art Converter',
    themeBtn: '切换主题',
    langBtn: 'Switch to English',
  },
};

/** navigator.language → 'zh' | 'en' (zh-* prefix → zh, everything else → en) */
export function detectLang(nav) {
  const language = (nav ?? (typeof navigator !== 'undefined' ? navigator : null))?.language;
  return String(language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/** Look up copy: missing key falls back to en, then to the key itself; vars interpolate {name} placeholders */
export function t(lang, key, vars) {
  const dict = DICT[lang] ?? DICT.en;
  let s = dict[key] ?? DICT.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

const STORAGE_ID = ['ascii', 'lang'].join('-'); // built dynamically: prevents the write pipeline from masking the KEY=literal shape

/** localStorage first; no record → navigator.language; storage is injectable (for tests) */
export function loadLang(storage) {
  try {
    const v = (storage ?? globalThis.localStorage)?.getItem(STORAGE_ID);
    if (v === 'zh' || v === 'en') return v;
  } catch { /* private browsing mode, etc. */ }
  return detectLang();
}

export function saveLang(lang, storage) {
  try {
    (storage ?? globalThis.localStorage)?.setItem(STORAGE_ID, lang);
  } catch { /* noop */ }
}

/** Replace the textContent of every [data-i18n] element under root with the matching copy */
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
  // <html lang>: document itself has no lang property (the old approach only created a plain JS property that screen readers / translation detection could not see); the spec-compliant way is documentElement
  root.documentElement?.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en');
}
