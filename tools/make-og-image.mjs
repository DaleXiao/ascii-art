#!/usr/bin/env node
// make-og-image.mjs — 生成 og-image.png（1200×630，terminal 风分享图）· SPEC-423
// 用法: node tools/make-og-image.mjs [src.jpg] [out.png]   默认 tmp-shots/parrot.jpg → og-image.png
// 依赖: sharp（workspace node_modules）+ js/ascii-core.js 纯函数（自家引擎 dogfood）
// 说明: 素材图不入库（tmp-shots/ 在 .gitignore），产物 og-image.png 入库；本脚本保可复现
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { convertCells } from '../js/ascii-core.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'tmp-shots/parrot.jpg');
const out = process.argv[3] ? path.resolve(process.argv[3]) : path.join(ROOT, 'og-image.png');

// ---- 布局常量（1200×630，dark 主题配色同 css 变量） ----
const CW = 1200, CH = 630;
const BG = '#0a0a0a';
const GREEN = '#00ff41';
const DIM = '#3f8f52';
const FONT = "'DejaVu Sans Mono', monospace";
const W = 84;                  // 字符网格列数
const F_ART = 10;              // art 字号
const CHAR_W = F_ART * 0.602;  // DejaVu Sans Mono advance ≈ 0.602em（仅注释用途）
const LINE_H = F_ART * 1.24;   // 行高 ≈ 2× 字宽（经典 1:2 字符单元格纵横比）
const ART_X = 48;
const ART_Y0 = 92;             // 首行 baseline

// ---- 源图 → 每格一像素 RGBA ----
const meta = await sharp(src).metadata();
const srcAspect = (meta.height || 1) / (meta.width || 1);
const H = Math.max(1, Math.round(W * srcAspect * 0.5)); // 与 DEFAULTS.aspect=0.5 同语义
const { data } = await sharp(src)
  .resize(W, H, { fit: 'fill' })
  .removeAlpha()
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

// ---- ascii-core 主管线（深底：invert 亮→密；饱和度增强出鲜艳效果） ----
const res = convertCells(new Uint8Array(data), W, H, {
  invert: true, saturation: 1.8, brightness: 1.0, gamma: 1.0, autoContrast: true,
});

// ---- SVG 组装（同色 run 合并 tspan，压缩体积） ----
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

const artLines = [];
for (let y = 0; y < res.H; y++) {
  const row = res.chars[y];
  let tsp = '';
  let runC = null;
  let runS = '';
  const flush = () => {
    if (runS) tsp += `<tspan fill="${runC}">${esc(runS)}</tspan>`;
    runS = '';
  };
  for (let x = 0; x < res.W; x++) {
    const i = (y * res.W + x) * 3;
    const c = hex(res.colors[i], res.colors[i + 1], res.colors[i + 2]);
    if (c !== runC) { flush(); runC = c; }
    runS += row[x];
  }
  flush();
  artLines.push(
    `<text x="${ART_X}" y="${(ART_Y0 + y * LINE_H).toFixed(1)}" font-family="${FONT}" font-size="${F_ART}" xml:space="preserve">${tsp}</text>`,
  );
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${CH}" viewBox="0 0 ${CW} ${CH}">
<rect width="${CW}" height="${CH}" fill="${BG}"/>
<text x="48" y="56" font-family="${FONT}" font-size="20" fill="${GREEN}" xml:space="preserve">user@ascii:~$ ./convert --color parrot.jpg</text>
<text x="${CW - 48}" y="56" font-family="${FONT}" font-size="18" fill="${DIM}" text-anchor="end">ascii.openclawd.co</text>
${artLines.join('\n')}
<text x="620" y="250" font-family="${FONT}" font-size="66" font-weight="bold" fill="${GREEN}">ASCII ART</text>
<text x="622" y="298" font-family="${FONT}" font-size="26" fill="${DIM}" letter-spacing="6">CONVERTER</text>
<text x="622" y="348" font-family="${FONT}" font-size="16" fill="${DIM}">image &#8594; text art &#183; free &#183; private &#183; in-browser</text>
<text x="622" y="430" font-family="${FONT}" font-size="20" fill="${GREEN}">&#9608; 100% client-side</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(out);
const outMeta = await sharp(out).metadata();
console.log(`og-image written: ${out} (${outMeta.width}x${outMeta.height}, grid ${res.W}x${res.H}, CHAR_W=${CHAR_W.toFixed(2)})`);
