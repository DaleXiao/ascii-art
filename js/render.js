// render.js — canvas character rendering + PNG/TXT output + browser-side sampling (F-2, DOM side, not covered by node unit tests)
import { resultToTxt } from './ascii-core.js?v=424';

// System monospace font stack (zero external links, F-5)
export const FONT_STACK = '"DejaVu Sans Mono", ui-monospace, "Cascadia Mono", Menlo, Consolas, "Liberation Mono", monospace';

// Theme render parameters (F-3): bg canvas background · ink monochrome text color · glow phosphor glow
// invert: bright → dense for monochrome on dark backgrounds (glowing ink on dark: density = brightness; the ramp string stays in classic order)
// Color mode always uses a paper-white background + classic mapping (bright → sparse), replicating the spike-confirmed Dale aesthetics
export const THEMES = {
  dark:  { bg: '#0a0a0a', ink: '#00ff41', glow: true,  invert: true  },
  light: { bg: '#f5f2e9', ink: '#2a2620', glow: false, invert: false },
};
export const COLOR_BG = '#ffffff';

// Browser canvas side-length hard limit (measured in Chrome: 65535 ✓ / 65536 ✗; beyond it getImageData returns all zeros and toBlob returns null → silent white screen)
export const MAX_CANVAS_SIDE = 65535;

/** Canvas cell metrics: adv = character advance width, lh = line height (adv:lh ≈ 1:2, matching the 0.5 sampling aspect ratio) */
function metrics(ctx, fontSize) {
  ctx.font = `bold ${fontSize}px ${FONT_STACK}`;
  const adv = ctx.measureText('M').width || fontSize * 0.602;
  return { adv, lh: fontSize * 1.2 };
}

/**
 * Renders an ASCII result onto the canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {{W,H,chars,colors}} result convertCells output
 * @param {{theme,colorMode,fontSize,fitWidth,pad}} opts
 *   when fitWidth>0, fontSize shrinks automatically so the picture fits that CSS width
 * @returns {{cssW,cssH,fontSize,adv,lh}}
 */
export function renderAscii(canvas, result, opts = {}) {
  const { theme = 'dark', colorMode = true, pad = 20, fitWidth = 0 } = opts;
  const th = THEMES[theme] ?? THEMES.dark;
  const bg = colorMode ? COLOR_BG : th.bg;
  const ctx = canvas.getContext('2d');

  // Font size: default 14px; shrinks to the available width when fitWidth is set (3–28px)
  let fontSize = opts.fontSize ?? 14;
  if (fitWidth > 0) {
    const probe = metrics(ctx, 100).adv / 100; // advance ratio of this font
    fontSize = Math.max(3, Math.min(28, Math.floor((fitWidth - pad * 2) / (result.W * probe))));
  }

  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  // Extreme aspect-ratio guard (T-719 must-fix 2): when cssH exceeds the canvas hard limit, lower fontSize (lh=1.2×fontSize);
  // if it still doesn't fit at 1px, throw so the UI reports the error instead of a silent white screen
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
    const ty = pad + (y + 0.82) * lh; // baseline offset validated in the spike
    for (let x = 0; x < result.W; x++) {
      const c = line[x];
      if (c === ' ') continue; // blank character = background shows through
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

/** Source image → W×H RGBA with one pixel per cell (canvas downsampling, browser-side F-1 input) */
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

/** Small sample (≤size px) used for the color-variance score → auto width */
export function previewSample(source, imgW, imgH, size = 64) {
  const scale = Math.min(1, size / Math.max(imgW, imgH));
  return sampleImage(source, Math.max(1, Math.round(imgW * scale)), Math.max(1, Math.round(imgH * scale)));
}

/** PNG download; toBlob failures (canvas limit exceeded, etc.) go through the onFail callback instead of being silently swallowed (T-719 must-fix 2) */
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

/** TXT copy (clipboard API + execCommand fallback); content = the exact character sequence rendered on screen (monochrome + dark background includes invert, WYSIWYG) */
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
