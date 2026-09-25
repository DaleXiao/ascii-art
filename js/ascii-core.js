// ascii-core.js — Pure-function conversion core (no DOM dependencies, unit-testable in node)
// SPEC-420 F-1 · Character ramp '@%#*+=-:. ': dense(dark) → sparse(bright), classic light-background order
// Key parameters come from the 2026-09-10 spike (tmp/ascii-convert.mjs, aesthetics confirmed by Dale)

export const CHARS = '@%#*+=-:. ';

export const DEFAULTS = {
  width: 'auto',       // 40–200 or 'auto' (heuristic)
  aspect: 0.5,         // character cell aspect-ratio compensation: H = W × (h/w) × aspect
  saturation: 1.6,     // saturation boost 0–3 (around luminance)
  brightness: 1,       // brightness 0.5–1.5
  gamma: 1,            // gamma 0.5–2
  maxLum: 190,         // highlight clamp lum ≤ 190
  autoContrast: true,  // 2/98 percentile contrast stretch
  invert: false,       // for dark-background monochrome mode (bright → dense)
};

/** Upper bound for H: at extreme aspect ratios, compress vertically (skip sampled rows) instead of blowing up the canvas — hard canvas height limit is 65535; beyond it getImageData returns all zeros / toBlob returns null (T-719 review must-fix 2) */
export const MAX_ROWS = 2000;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => clamp(v, 0, 1);

/** Perceptual luminance (0–255), weights 0.299/0.587/0.114 */
export function lumFromRgb(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// ---------- Auto-width heuristic (F-1: size + color variance → W ∈ [60,160]) ----------

/**
 * Legibility = subject/background separation × output width; large or complex images automatically get more width.
 * sizeScore: longest side 256px→0, ≥2048px→1; variance: colorVarianceScore 0–1.
 */
export function autoWidth(imgW, imgH, variance = 0.5) {
  const dim = Math.max(imgW, imgH);
  const sizeScore = clamp01((dim - 256) / (2048 - 256));
  const w = 60 + sizeScore * 60 + clamp01(variance) * 40;
  return Math.round(clamp(w, 60, 160));
}

/**
 * Normalized color-variance score (0–1) from RGBA pixel data (downsample to ≤64px in the browser first).
 * Weighted: luminance std-dev (detail/contrast) + mean chroma (colorfulness).
 */
export function colorVarianceScore(rgba) {
  const n = rgba.length / 4;
  if (n <= 0) return 0;
  let sum = 0, sumSq = 0, chroma = 0;
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    const l = lumFromRgb(r, g, b);
    sum += l; sumSq += l * l;
    chroma += (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  }
  const mean = sum / n;
  const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  return clamp01(0.7 * (std / 64) + 0.6 * (chroma / n));
}

// ---------- Grid computation (F-1: W 40–200, default auto, 0.5 aspect-ratio compensation) ----------

export function computeGrid(imgW, imgH, width = 'auto', opts = {}) {
  const aspect = opts.aspect ?? DEFAULTS.aspect;
  let W = width === 'auto' || width == null
    ? autoWidth(imgW, imgH, opts.variance ?? 0.5)
    : Math.round(Number(width));
  if (!Number.isFinite(W)) W = autoWidth(imgW, imgH, opts.variance ?? 0.5);
  W = Math.round(clamp(W, 40, 200));
  const H = Math.round(clamp(W * (imgH / imgW) * aspect, 1, MAX_ROWS));
  return { W, H };
}

// ---------- Luminance → character (F-1) ----------

/** Normalized luminance l∈[0,1] → ramp character; 0 (darkest) → '@', 1 (brightest) → ' ' (classic light-background order) */
export function charForLum(l) {
  const i = Math.min(CHARS.length - 1, Math.floor(clamp01(l) * CHARS.length));
  return CHARS[i];
}

/** 2/98 percentile contrast bounds; falls back to the full 0–255 range when degenerate (hi-lo<1) */
export function percentileBounds(lums) {
  const sorted = Float64Array.from(lums).sort();
  const n = sorted.length;
  if (n === 0) return { lo: 0, hi: 255 };
  const lo = sorted[Math.floor(n * 0.02)];
  const hi = sorted[Math.min(n - 1, Math.floor(n * 0.98))];
  return hi - lo >= 1 ? { lo, hi } : { lo: 0, hi: 255 };
}

/** Luminance adjustment: multiply by brightness first, then gamma power; both clamped to [0,1] */
export function gradeLum(l, brightness = 1, gamma = 1) {
  return clamp01(Math.pow(clamp01(l * brightness), gamma));
}

// ---------- Color processing (F-1: saturation boost + highlight clamp) ----------

/** Saturation boost around luminance (amount=1 is identity; grayscale r=g=b is identity) */
export function boostSaturation(r, g, b, amount) {
  const lum = lumFromRgb(r, g, b);
  return [
    lum + (r - lum) * amount,
    lum + (g - lum) * amount,
    lum + (b - lum) * amount,
  ];
}

/** Highlight clamp: when composite luminance > maxLum, scale everything down proportionally (preserving hue) */
export function clampHighlight(r, g, b, maxLum = 190) {
  const lum = lumFromRgb(r, g, b);
  if (lum > maxLum && lum > 0) {
    const k = maxLum / lum;
    return [r * k, g * k, b * k];
  }
  return [r, g, b];
}

/** Per-cell color pick: saturation boost → highlight clamp → round and clamp to [0,255] */
export function cellColor(r, g, b, { saturation = 1.6, maxLum = 190 } = {}) {
  let [rr, gg, bb] = boostSaturation(r, g, b, saturation);
  [rr, gg, bb] = clampHighlight(rr, gg, bb, maxLum);
  return {
    r: Math.round(clamp(rr, 0, 255)),
    g: Math.round(clamp(gg, 0, 255)),
    b: Math.round(clamp(bb, 0, 255)),
  };
}

// ---------- Main pipeline ----------

/**
 * RGBA data already downsampled to one pixel per cell → character grid + per-cell colors.
 * @param {Uint8Array|Uint8ClampedArray} rgba length W*H*4
 * @returns {{W,H,chars:string[],colors:Uint8Array,lo:number,hi:number}}
 *   chars: H strings (W characters each); colors: W*H*3 (RGB)
 */
export function convertCells(rgba, W, H, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const n = W * H;
  const lums = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    lums[i] = lumFromRgb(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
  }
  let lo = 0, hi = 255;
  if (o.autoContrast) ({ lo, hi } = percentileBounds(lums));
  const range = Math.max(1, hi - lo);

  const chars = new Array(H);
  const colors = new Uint8Array(n * 3);
  for (let y = 0; y < H; y++) {
    let line = '';
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let l = gradeLum((lums[i] - lo) / range, o.brightness, o.gamma);
      if (o.invert) l = 1 - l;
      line += charForLum(l);
      const c = cellColor(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], {
        saturation: o.saturation,
        maxLum: o.maxLum,
      });
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    chars[y] = line;
  }
  return { W, H, chars, colors, lo, hi };
}

/** Plain-text ASCII art (classic light-background order, bright → sparse) */
export function resultToTxt(result) {
  return result.chars.join('\n') + '\n';
}
