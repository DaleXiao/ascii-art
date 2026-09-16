#!/usr/bin/env node
// tools/make-og-image.mjs — 生成 repo 根 og-image.png（SPEC-423 / T-722）
//
// 运行前提：
//   1) sharp 可用：本仓库零依赖，ESM 沿祖先目录解析到 workspace/node_modules/sharp
//   2) 素材 tmp-shots/parrot.jpg（已 gitignore，不入库）。缺失时：
//      mkdir -p tmp-shots && cp ~/.openclaw/workspace/tmp/ascii-parrot-150-small.jpg tmp-shots/parrot.jpg
// 用法：node tools/make-og-image.mjs
//
// 管线：sharp 全图取 RGBA → 逐 cell 池化采样（mean/p30亮度/最大彩度代表色）→
//       ascii-core convertCells 选字 + cellColor 取色 → 亮度 lift → 组 SVG → sharp 栅格化 1200x630。
//
// 映射策略（2026-09-16 对素材实测：浅背景 border mean lum 226 / 深主体，金刚鹦鹉红蓝绿）：
//   经典映射 invert=false（浅背景→稀疏、深主体→密字）+ gamma 1.4 压背景；
//   深底可见性靠后处理：非空格 cell 颜色亮度 lift 到 ≥ MIN_LUM（保色相）+ saturation 1.8。
//   ⚠️ 勿改 invert=true：浅底素材 invert 会把整个背景变密字（invert 只适合深底亮主体素材）。

import sharp from 'sharp';
import { convertCells, cellColor, lumFromRgb } from '../js/ascii-core.js';

const SRC = 'tmp-shots/parrot.jpg';
const OUT = 'og-image.png';

// ---------- 画布 / 排版常量 ----------
const CW = 1200, CH = 630;
const BG = '#0a0a0a';           // 站点 dark 主题 --bg
const FG = '#00ff41';           // 磷光绿 --fg
const PROMPT = 'user@ascii:~$';
const PROMPT_FS = 26, PROMPT_X = 48, PROMPT_Y = 64;
const F = 11;                   // 字符画字号（v1=14/28行 实测细部糊、鹦鹉被 vision 认成猫 → 提分辨率）
const ADV = 0.602, LH = 1.2;    // DejaVu Sans Mono advance / 行高（×font-size）
const ART_TOP = 104;            // 字符画首行顶部
const ROWS = 36;
const MARGIN_X = 48;
const MIN_LUM = 105;            // 非空格 cell 颜色最低亮度（深底可见性）
const BG_CHROMA = 25;           // 低彩度 + 稀疏字（.:）= 背景残点，不渲染
const REP_CHROMA = 20;          // cell 均值彩度 ≥ 此值 → 用最大彩度像素做代表色（防均值稀释羽毛色）

// ---------- 1) 全图 RGBA + 主体 bbox ----------
// 掩码：高彩度（chroma>40，红蓝绿羽毛）或暗部（lum<150，喙/眼/阴影）；
// bbox 只取行/列命中数 ≥ 边长 2% 的主体带，滤掉画面边缘零星暗噪点。
// （v1 单用 lum<200：实测噪点把 bbox 撑满全图，主体只占 1/3 → 网格过粗不可辨认）
const full = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: IW, height: IH } = full.info;
const rowHits = new Uint32Array(IH);
const colHits = new Uint32Array(IW);
let hit = 0;
for (let y = 0; y < IH; y++) {
  for (let x = 0; x < IW; x++) {
    const i = (y * IW + x) * 4;
    const r = full.data[i], g = full.data[i + 1], b = full.data[i + 2];
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (chroma > 40 || lumFromRgb(r, g, b) < 150) {
      hit++; rowHits[y]++; colHits[x]++;
    }
  }
}
const firstLast = (hits, thresh) => {
  let lo = -1, hi = -1;
  for (let i = 0; i < hits.length; i++) {
    if (hits[i] >= thresh) { if (lo < 0) lo = i; hi = i; }
  }
  return [lo, hi];
};
const [ry0, ry1] = firstLast(rowHits, IW * 0.02);
const [cx0, cx1] = firstLast(colHits, IH * 0.02);
let crop = { left: 0, top: 0, width: IW, height: IH };
if (ry0 >= 0 && cx0 >= 0 && hit > IW * IH * 0.005) {   // 命中 >0.5% 才裁剪，否则回退全图
  const mx = Math.round((cx1 - cx0) * 0.08), my = Math.round((ry1 - ry0) * 0.08);
  const left = Math.max(0, cx0 - mx), top = Math.max(0, ry0 - my);
  crop = {
    left, top,
    width: Math.min(IW - 1, cx1 + mx) - left + 1,
    height: Math.min(IH - 1, ry1 + my) - top + 1,
  };
}

// ---------- 2) 网格尺寸（渲染宽高比 ≈ 裁剪框宽高比） ----------
const cropAspect = crop.width / crop.height;
const maxCols = Math.floor((CW - 2 * MARGIN_X) / (ADV * F));
const cols = Math.min(maxCols, Math.max(20, Math.round(ROWS * cropAspect * LH / ADV)));

// ---------- 3) 逐 cell 池化采样（在全分辨率 RGBA 上直接算） ----------
// v1 用 sharp resize 均值降采样，实测（vision+像素）两个问题：
//   a) 羽毛彩度被米白背景均值稀释 → 输出近单色；b) 网格过粗主体糊。
// v2 每 cell 三个统计量：mean RGB（整体色相）、p30 亮度（暗部偏置 → 主体轮廓增稠，
//   喂 convertCells 选字）、最大彩度像素 RGB（羽毛代表色，均值彩度达阈值才启用）。
const cellW = crop.width / cols, cellH = crop.height / ROWS;
const dens = Buffer.alloc(cols * ROWS * 4);          // 密度缓冲：色相=mean、亮度=p30
const rep = new Uint8Array(cols * ROWS * 3);         // 代表色（cellColor 前）
const lumBuf = [];
for (let r = 0; r < ROWS; r++) {
  const sy0 = crop.top + Math.round(r * cellH), sy1 = crop.top + Math.round((r + 1) * cellH);
  for (let c = 0; c < cols; c++) {
    const sx0 = crop.left + Math.round(c * cellW), sx1 = crop.left + Math.round((c + 1) * cellW);
    let sR = 0, sG = 0, sB = 0, n = 0;
    let bestChroma = -1, bR = 0, bG = 0, bB = 0;
    lumBuf.length = 0;
    for (let y = sy0; y < sy1; y++) {
      for (let x = sx0; x < sx1; x++) {
        const i = (y * IW + x) * 4;
        const cr = full.data[i], cg = full.data[i + 1], cb = full.data[i + 2];
        sR += cr; sG += cg; sB += cb; n++;
        lumBuf.push(lumFromRgb(cr, cg, cb));
        const ch = Math.max(cr, cg, cb) - Math.min(cr, cg, cb);
        if (ch > bestChroma) { bestChroma = ch; bR = cr; bG = cg; bB = cb; }
      }
    }
    const idx = r * cols + c;
    const mR = sR / n, mG = sG / n, mB = sB / n;
    const meanLum = lumFromRgb(mR, mG, mB);
    lumBuf.sort((a, b) => a - b);
    const p30 = lumBuf[Math.floor(lumBuf.length * 0.3)];
    const k = meanLum > 0 ? p30 / meanLum : 1;
    dens[idx * 4] = Math.min(255, Math.round(mR * k));
    dens[idx * 4 + 1] = Math.min(255, Math.round(mG * k));
    dens[idx * 4 + 2] = Math.min(255, Math.round(mB * k));
    dens[idx * 4 + 3] = 255;
    const meanChroma = Math.max(mR, mG, mB) - Math.min(mR, mG, mB);
    const useRep = meanChroma >= REP_CHROMA;
    rep[idx * 3] = Math.round(useRep ? bR : mR);
    rep[idx * 3 + 1] = Math.round(useRep ? bG : mG);
    rep[idx * 3 + 2] = Math.round(useRep ? bB : mB);
  }
}

// ---------- 4) ascii-core 选字（经典映射 + gamma 压背景）+ 取色（cellColor → 亮度 lift） ----------
const result = convertCells(dens, cols, ROWS, { gamma: 1.4, invert: false });
const colors = new Uint8Array(cols * ROWS * 3);
for (let i = 0; i < cols * ROWS; i++) {
  const col = cellColor(rep[i * 3], rep[i * 3 + 1], rep[i * 3 + 2], { saturation: 1.8, maxLum: 205 });
  const l = lumFromRgb(col.r, col.g, col.b);
  const k2 = (l > 0 && l < MIN_LUM) ? MIN_LUM / l : 1;
  colors[i * 3] = Math.min(255, Math.round(col.r * k2));
  colors[i * 3 + 1] = Math.min(255, Math.round(col.g * k2));
  colors[i * 3 + 2] = Math.min(255, Math.round(col.b * k2));
}

// ---------- 5) 组 SVG（同色连续 cell 合并 tspan；跳过空格与背景残点） ----------
const hex = (j) => '#' + [colors[j], colors[j + 1], colors[j + 2]]
  .map((v) => v.toString(16).padStart(2, '0')).join('');
const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const artW = cols * ADV * F;
const artX = (CW - artW) / 2;
let drawn = 0, skipped = 0;
const rows = [];
for (let r = 0; r < ROWS; r++) {
  const yBase = ART_TOP + F + r * LH * F;
  let tspans = '', runChars = '', runFill = null;
  const flush = () => {
    if (runChars && runFill) tspans += `<tspan fill="${runFill}">${esc(runChars)}</tspan>`;
    runChars = ''; runFill = null;
  };
  for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    const ch = result.chars[r][c];
    const j = i * 3;
    const chroma = Math.max(colors[j], colors[j + 1], colors[j + 2]) - Math.min(colors[j], colors[j + 1], colors[j + 2]);
    if (ch === ' ' || (chroma < BG_CHROMA && (ch === '.' || ch === ':'))) {
      skipped++;
      runChars += ' ';   // 空格留在当前 run 内占位（xml:space=preserve 推进），不可丢弃否则整行左移
      continue;
    }
    drawn++;
    const fill = hex(j);
    if (runFill === null) runFill = fill;                 // 行首空格随首个彩色 cell 并入同 run
    else if (fill !== runFill) { flush(); runFill = fill; } // 换色：旧 run（含尾部空格）先落盘
    runChars += ch;
  }
  flush();   // 行尾全空格 run（runFill=null）自然丢弃，不影响定位
  rows.push(`<text x="${artX.toFixed(1)}" y="${yBase.toFixed(1)}" xml:space="preserve">${tspans}</text>`);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${CH}" viewBox="0 0 ${CW} ${CH}">
<rect width="${CW}" height="${CH}" fill="${BG}"/>
<text x="${PROMPT_X}" y="${PROMPT_Y}" font-family="DejaVu Sans Mono" font-size="${PROMPT_FS}" font-weight="bold" fill="${FG}">${esc(PROMPT)}</text>
<g font-family="DejaVu Sans Mono" font-size="${F}">
${rows.join('\n')}
</g>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(OUT);
console.log(`crop bbox: ${crop.width}x${crop.height} @(${crop.left},${crop.top}) of ${IW}x${IH} (mask hit ${(100 * hit / (IW * IH)).toFixed(1)}%)`);
console.log(`grid: ${cols}x${ROWS} · drawn cells: ${drawn} · skipped: ${skipped}`);
console.log(`written: ${OUT} (${CW}x${CH})`);
