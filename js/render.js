// render.js — canvas 字符渲染 + PNG/TXT 输出 + 浏览器侧取样（F-2，DOM 侧，不进 node 单测）
import { resultToTxt } from './ascii-core.js';

// 系统等宽字体栈（零外链，F-5）
export const FONT_STACK = '"DejaVu Sans Mono", ui-monospace, "Cascadia Mono", Menlo, Consolas, "Liberation Mono", monospace';

// 主题渲染参数（F-3）：bg 画布底色 · ink 单色模式字色 · glow 磷光辉光
// invert：单色深底时 亮→密（发光墨水在暗底上密度=亮度；ramp 字符串仍是经典序）
// 彩色模式恒为纸白底 + 经典映射（亮→稀疏），复刻 spike 已确认的 Dale 审美
export const THEMES = {
  dark:  { bg: '#0a0a0a', ink: '#00ff41', glow: true,  invert: true  },
  light: { bg: '#f5f2e9', ink: '#2a2620', glow: false, invert: false },
};
export const COLOR_BG = '#ffffff';

// 浏览器 canvas 边长硬限（Chrome 实测 65535 ✓ / 65536 ✗：超限 getImageData 全 0、toBlob null → 静默白屏）
export const MAX_CANVAS_SIDE = 65535;

/** 画布单元格度量：adv=字符步进宽，lh=行高（adv:lh ≈ 1:2，与采样纵横比 0.5 一致） */
function metrics(ctx, fontSize) {
  ctx.font = `bold ${fontSize}px ${FONT_STACK}`;
  const adv = ctx.measureText('M').width || fontSize * 0.602;
  return { adv, lh: fontSize * 1.2 };
}

/**
 * 渲染 ASCII 结果到 canvas。
 * @param {HTMLCanvasElement} canvas
 * @param {{W,H,chars,colors}} result convertCells 输出
 * @param {{theme,colorMode,fontSize,fitWidth,pad}} opts
 *   fitWidth>0 时自动缩小 fontSize 让画面适配该 CSS 宽度
 * @returns {{cssW,cssH,fontSize,adv,lh}}
 */
export function renderAscii(canvas, result, opts = {}) {
  const { theme = 'dark', colorMode = true, pad = 20, fitWidth = 0 } = opts;
  const th = THEMES[theme] ?? THEMES.dark;
  const bg = colorMode ? COLOR_BG : th.bg;
  const ctx = canvas.getContext('2d');

  // 字号：默认 14px；fitWidth 时按可用宽度收缩（3–28px）
  let fontSize = opts.fontSize ?? 14;
  if (fitWidth > 0) {
    const probe = metrics(ctx, 100).adv / 100; // 该字体的 advance 比例
    fontSize = Math.max(3, Math.min(28, Math.floor((fitWidth - pad * 2) / (result.W * probe))));
  }

  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  // 极端纵横比守卫（T-719 必改 2）：cssH 超画布硬限时降 fontSize（lh=1.2×fontSize）；
  // 降到 1px 仍放不下则 throw，由 UI 报错，不静默白屏
  const maxCssSide = MAX_CANVAS_SIDE / dpr;
  if (result.H > 0 && fontSize * 1.2 > (maxCssSide - pad * 2) / result.H) {
    fontSize = Math.max(1, Math.floor((maxCssSide - pad * 2) / result.H / 1.2));
  }
  const { adv, lh } = metrics(ctx, fontSize);

  const cssW = Math.ceil(result.W * adv + pad * 2);
  const cssH = Math.ceil(result.H * lh + pad * 2);
  if (cssW * dpr > MAX_CANVAS_SIDE || cssH * dpr > MAX_CANVAS_SIDE) {
    throw new Error(`canvas overflow: ${cssW}x${cssH} css px @dpr${dpr} > ${MAX_CANVAS_SIDE}`);
  }
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.font = `bold ${fontSize}px ${FONT_STACK}`;
  ctx.textBaseline = 'alphabetic';

  if (!colorMode && th.glow) {
    ctx.shadowColor = 'rgba(0, 255, 65, 0.55)';
    ctx.shadowBlur = fontSize * 0.5;
  }

  let lastColor = '';
  for (let y = 0; y < result.H; y++) {
    const line = result.chars[y];
    const ty = pad + (y + 0.82) * lh; // spike 验证过的基线偏移
    for (let x = 0; x < result.W; x++) {
      const c = line[x];
      if (c === ' ') continue; // 空字符 = 底色透出
      if (colorMode) {
        const i = (y * result.W + x) * 3;
        const col = `rgb(${result.colors[i]},${result.colors[i + 1]},${result.colors[i + 2]})`;
        if (col !== lastColor) { ctx.fillStyle = col; lastColor = col; }
      } else if (lastColor !== th.ink) {
        ctx.fillStyle = th.ink; lastColor = th.ink;
      }
      ctx.fillText(c, pad + x * adv, ty);
    }
  }
  ctx.shadowBlur = 0;
  return { cssW, cssH, fontSize, adv, lh };
}

/** 源图 → W×H 每格一像素的 RGBA（canvas 降采样，浏览器侧 F-1 输入） */
export function sampleImage(source, W, H) {
  const c = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(W, H)
    : Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, W, H);
  return ctx.getImageData(0, 0, W, H).data;
}

/** 小样（≤size px）用于颜色方差评分 → auto 宽度 */
export function previewSample(source, imgW, imgH, size = 64) {
  const scale = Math.min(1, size / Math.max(imgW, imgH));
  return sampleImage(source, Math.max(1, Math.round(imgW * scale)), Math.max(1, Math.round(imgH * scale)));
}

/** PNG 下载；toBlob 失败（画布超限等）走 onFail 回调，不静默吞掉（T-719 必改 2） */
export function downloadPng(canvas, filename = 'ascii-art.png', onFail) {
  canvas.toBlob((blob) => {
    if (!blob) { onFail?.(); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, 'image/png');
}

/** TXT 复制（clipboard API + execCommand 回退）；内容 = 屏幕实际渲染的字符序（单色+深底含 invert，所见即所得） */
export async function copyTxt(result) {
  const txt = resultToTxt(result);
  try {
    await navigator.clipboard.writeText(txt);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* noop */ }
    ta.remove();
    return ok;
  }
}
