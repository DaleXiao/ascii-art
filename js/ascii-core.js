// ascii-core.js — 纯函数转换核心（无 DOM 依赖，node 可单测）
// SPEC-420 F-1 · 字符 ramp '@%#*+=-:. '：dense(dark) → sparse(bright)，经典白底序
// 关键参数来自 2026-09-10 spike（tmp/ascii-convert.mjs，Dale 审美已确认）

export const CHARS = '@%#*+=-:. ';

export const DEFAULTS = {
  width: 'auto',       // 40–200 或 'auto'（启发式）
  aspect: 0.5,         // 字符单元格纵横比补偿：H = W × (h/w) × aspect
  saturation: 1.6,     // 饱和度增强 0–3（围绕亮度 boost）
  brightness: 1,       // 亮度 0.5–1.5
  gamma: 1,            // gamma 0.5–2
  maxLum: 190,         // 亮部钳制 lum ≤ 190
  autoContrast: true,  // 2/98 百分位对比度拉伸
  invert: false,       // 深底单色模式用（亮→密）
};

/** H 上界：极端纵横比时垂直压缩（采样跳行）而非撑爆画布——canvas 高度硬限 65535，超限 getImageData 全 0 / toBlob null（T-719 复审必改 2） */
export const MAX_ROWS = 2000;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => clamp(v, 0, 1);

/** 感知亮度（0–255），权重 0.299/0.587/0.114 */
export function lumFromRgb(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// ---------- 自动宽度启发式（F-1：尺寸 + 颜色方差 → W ∈ [60,160]） ----------

/**
 * 可辨识度 = 主体/背景分离度 × 输出宽度；大图/复杂图自动取宽。
 * sizeScore：最长边 256px→0，≥2048px→1；variance：colorVarianceScore 0–1。
 */
export function autoWidth(imgW, imgH, variance = 0.5) {
  const dim = Math.max(imgW, imgH);
  const sizeScore = clamp01((dim - 256) / (2048 - 256));
  const w = 60 + sizeScore * 60 + clamp01(variance) * 40;
  return Math.round(clamp(w, 60, 160));
}

/**
 * 归一化颜色方差评分（0–1），输入 RGBA 像素数据（建议先在浏览器降到 ≤64px 采样）。
 * 亮度标准差（细节/对比）+ 平均色度（彩色程度）加权。
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

// ---------- 网格计算（F-1：W 40–200，默认 auto，纵横比 0.5 补偿） ----------

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

// ---------- 亮度 → 字符（F-1） ----------

/** 归一化亮度 l∈[0,1] → ramp 字符；0（最暗）→'@'，1（最亮）→' '（经典白底序） */
export function charForLum(l) {
  const i = Math.min(CHARS.length - 1, Math.floor(clamp01(l) * CHARS.length));
  return CHARS[i];
}

/** 2/98 百分位对比度边界；退化（hi-lo<1）时回退全域 0–255 */
export function percentileBounds(lums) {
  const sorted = Float64Array.from(lums).sort();
  const n = sorted.length;
  if (n === 0) return { lo: 0, hi: 255 };
  const lo = sorted[Math.floor(n * 0.02)];
  const hi = sorted[Math.min(n - 1, Math.floor(n * 0.98))];
  return hi - lo >= 1 ? { lo, hi } : { lo: 0, hi: 255 };
}

/** 亮度调节：先 brightness 乘，再 gamma 幂，均钳 [0,1] */
export function gradeLum(l, brightness = 1, gamma = 1) {
  return clamp01(Math.pow(clamp01(l * brightness), gamma));
}

// ---------- 颜色处理（F-1：饱和增强 + 亮部钳制） ----------

/** 围绕亮度做饱和度 boost（amount=1 恒等；灰阶 r=g=b 恒等） */
export function boostSaturation(r, g, b, amount) {
  const lum = lumFromRgb(r, g, b);
  return [
    lum + (r - lum) * amount,
    lum + (g - lum) * amount,
    lum + (b - lum) * amount,
  ];
}

/** 亮部钳制：合成亮度 > maxLum 时整体等比压暗（保持色相） */
export function clampHighlight(r, g, b, maxLum = 190) {
  const lum = lumFromRgb(r, g, b);
  if (lum > maxLum && lum > 0) {
    const k = maxLum / lum;
    return [r * k, g * k, b * k];
  }
  return [r, g, b];
}

/** 单格取色：饱和增强 → 亮部钳制 → 取整钳 [0,255] */
export function cellColor(r, g, b, { saturation = 1.6, maxLum = 190 } = {}) {
  let [rr, gg, bb] = boostSaturation(r, g, b, saturation);
  [rr, gg, bb] = clampHighlight(rr, gg, bb, maxLum);
  return {
    r: Math.round(clamp(rr, 0, 255)),
    g: Math.round(clamp(gg, 0, 255)),
    b: Math.round(clamp(bb, 0, 255)),
  };
}

// ---------- 主管线 ----------

/**
 * 已降采样到每格一像素的 RGBA 数据 → 字符网格 + 每格颜色。
 * @param {Uint8Array|Uint8ClampedArray} rgba 长度 W*H*4
 * @returns {{W,H,chars:string[],colors:Uint8Array,lo:number,hi:number}}
 *   chars: H 行字符串（每行 W 字符）；colors: W*H*3（RGB）
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

/** 纯文本字符画（经典白底序，亮→稀疏） */
export function resultToTxt(result) {
  return result.chars.join('\n') + '\n';
}
