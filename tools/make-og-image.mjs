#!/usr/bin/env node
// make-og-image.mjs — generates og-image.png (1200×630, terminal-style share image) · SPEC-423
// Usage: node tools/make-og-image.mjs [src.jpg] [out.png]   defaults tmp-shots/parrot.jpg → og-image.png
// Dependencies: sharp (workspace node_modules) + js/ascii-core.js pure functions (dogfooding our own engine)
// Notes: the source photo is not committed (tmp-shots/ is gitignored); the output og-image.png is committed; this script keeps it reproducible
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { convertCells } from '../js/ascii-core.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'tmp-shots/parrot.jpg');
const out = process.argv[3] ? path.resolve(process.argv[3]) : path.join(ROOT, 'og-image.png');

// ---- Layout constants (1200×630, dark theme colors matching the CSS variables) ----
const CW = 1200, CH = 630;
const BG = '#0a0a0a';
const GREEN = '#00ff41';
const DIM = '#3f8f52';
const FONT = "'DejaVu Sans Mono', monospace";
const W = 84;                  // character grid column count
const F_ART = 10;              // art font size
const CHAR_W = F_ART * 0.602;  // DejaVu Sans Mono advance ≈ 0.602em (comment reference only)
const LINE_H = F_ART * 1.24;   // line height ≈ 2× char width (classic 1:2 character cell aspect ratio)
const ART_X = 48;
const ART_Y0 = 92;             // first line baseline

// ---- Source image → RGBA with one pixel per cell ----
const meta = await sharp(src).metadata();
const srcAspect = (meta.height || 1) / (meta.width || 1);
const H = Math.max(1, Math.round(W * srcAspect * 0.5)); // same semantics as DEFAULTS.aspect=0.5
const { data } = await sharp(src)
  .resize(W, H, { fit: 'fill' })
  .removeAlpha()
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

// ---- ascii-core main pipeline (dark background: invert bright → dense; saturation boost for vivid results) ----
const res = convertCells(new Uint8Array(data), W, H, {
  invert: true, saturation: 1.8, brightness: 1.0, gamma: 1.0, autoContrast: true,
});

// ---- SVG assembly (merge same-color runs into tspan to reduce size) ----
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
