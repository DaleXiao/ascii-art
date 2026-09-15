import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHARS, DEFAULTS, clamp, clamp01, lumFromRgb, charForLum, gradeLum,
  percentileBounds, boostSaturation, clampHighlight, cellColor,
  computeGrid, autoWidth, colorVarianceScore, convertCells, resultToTxt,
} from '../js/ascii-core.js';

// ---------- ramp 与亮度→字符（F-1/F-6） ----------

test('CHARS ramp: dense(dark) → sparse(bright), 10 chars', () => {
  assert.equal(CHARS, '@%#*+=-:. ');
  assert.equal(CHARS.length, 10);
});

test('charForLum boundaries', () => {
  assert.equal(charForLum(0), '@');       // 最暗 → 最密
  assert.equal(charForLum(1), ' ');       // 最亮 → 空格
  assert.equal(charForLum(0.999), ' ');
  assert.equal(charForLum(0.9), ' ');
  assert.equal(charForLum(0.85), '.');    // floor(8.5)=8
  assert.equal(charForLum(0.5), '=');     // floor(5)=5
  assert.equal(charForLum(0.1), '%');     // floor(1)=1
  assert.equal(charForLum(0.09), '@');
  assert.equal(charForLum(-0.5), '@');    // 越界钳制
  assert.equal(charForLum(1.5), ' ');
});

test('lumFromRgb weights 0.299/0.587/0.114', () => {
  assert.equal(lumFromRgb(0, 0, 0), 0);
  assert.ok(Math.abs(lumFromRgb(255, 255, 255) - 255) < 1e-9);
  assert.ok(Math.abs(lumFromRgb(255, 0, 0) - 76.245) < 1e-9);
  assert.ok(Math.abs(lumFromRgb(0, 255, 0) - 149.685) < 1e-9);
  assert.ok(Math.abs(lumFromRgb(0, 0, 255) - 29.07) < 1e-9);
});

test('gradeLum: brightness then gamma, clamped', () => {
  assert.ok(Math.abs(gradeLum(0.5, 1, 2) - 0.25) < 1e-12);
  assert.equal(gradeLum(0.5, 2, 1), 1);            // 0.5*2=1
  assert.equal(gradeLum(0.8, 2, 1), 1);            // 越界钳 1
  assert.ok(Math.abs(gradeLum(0.5, 1, 0.5) - Math.SQRT1_2) < 1e-12);
  assert.equal(gradeLum(0.5, 1, 1), 0.5);          // 恒等
});

test('percentileBounds: 2/98 percentiles + degenerate fallback', () => {
  const lums = Float64Array.from({ length: 256 }, (_, i) => i);
  const { lo, hi } = percentileBounds(lums);
  assert.equal(lo, lums[Math.floor(256 * 0.02)]);   // index 5
  assert.equal(hi, lums[Math.floor(256 * 0.98)]);   // index 250
  assert.equal(lo, 5);
  assert.equal(hi, 250);
  // 全同亮度 → 退化回退全域
  const flat = new Float64Array(100).fill(128);
  assert.deepEqual(percentileBounds(flat), { lo: 0, hi: 255 });
});

// ---------- 饱和增强 / 亮部钳制（F-1/F-6 数值） ----------

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('boostSaturation: gray identity, amount=1 identity, more spread', () => {
  // 浮点累加有 ~1e-14 噪声，用容差断言
  assert.ok(boostSaturation(128, 128, 128, 2.5).every((v) => close(v, 128)));
  const id = boostSaturation(200, 100, 50, 1);
  assert.ok(close(id[0], 200) && close(id[1], 100) && close(id[2], 50));
  const [r2] = boostSaturation(200, 100, 50, 2);
  const [r1] = boostSaturation(200, 100, 50, 1.6);
  assert.ok(r2 > r1 && r1 > 200);                   // 围绕亮度外推
});

test('clampHighlight: lum>190 → k=190/lum 等比压暗', () => {
  const [r, g, b] = clampHighlight(255, 255, 255, 190);
  assert.ok(Math.abs(r - 190) < 1e-9 && Math.abs(g - 190) < 1e-9);
  assert.deepEqual(clampHighlight(100, 100, 100, 190), [100, 100, 100]); // 未超不动
  // 保持色相：等比
  const [rr, gg, bb] = clampHighlight(240, 120, 60, 190);
  assert.ok(Math.abs(rr / gg - 2) < 1e-9 && Math.abs(gg / bb - 2) < 1e-9);
});

test('cellColor: 饱和红仍红 / 白钳到 190 / 灰不动 / sat=0 → 灰度', () => {
  assert.deepEqual(cellColor(255, 0, 0, { saturation: 1.6 }), { r: 255, g: 0, b: 0 });
  assert.deepEqual(cellColor(255, 255, 255), { r: 190, g: 190, b: 190 });
  assert.deepEqual(cellColor(128, 128, 128), { r: 128, g: 128, b: 128 });
  const lum = Math.round(lumFromRgb(200, 100, 100));
  assert.deepEqual(cellColor(200, 100, 100, { saturation: 0 }), { r: lum, g: lum, b: lum });
  // spike 同款参数：200,100,100 @ sat1.6 → (242,82,82)
  assert.deepEqual(cellColor(200, 100, 100, { saturation: 1.6 }), { r: 242, g: 82, b: 82 });
});

test('clamp/clamp01', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
  assert.equal(clamp01(1.2), 1);
});

// ---------- 网格 / 纵横比（F-1/F-6） ----------

test('computeGrid: 显式宽度 + 纵横比 0.5 补偿', () => {
  assert.deepEqual(computeGrid(1000, 500, 120), { W: 120, H: 30 }); // H=120×(1/2)×0.5
  assert.deepEqual(computeGrid(1000, 1000, 120), { W: 120, H: 60 });
  assert.deepEqual(computeGrid(500, 1000, 100), { W: 100, H: 100 }); // 竖图
  assert.deepEqual(computeGrid(1000, 1000, 101), { W: 101, H: 51 }); // round(50.5)
});

test('computeGrid: 宽度钳制 40–200', () => {
  assert.equal(computeGrid(100, 100, 10).W, 40);
  assert.equal(computeGrid(100, 100, 1000).W, 200);
  assert.equal(computeGrid(100, 100, 40).W, 40);
  assert.equal(computeGrid(100, 100, 200).W, 200);
});

test('computeGrid: auto → 启发式；非法宽度回退 auto', () => {
  const g = computeGrid(100, 100, 'auto', { variance: 0 });
  assert.equal(g.W, 60);
  assert.equal(g.H, 30);
  assert.equal(computeGrid(100, 100, 'abc', { variance: 0 }).W, 60); // NaN → auto
  // H 至少 1（极端宽图）
  assert.equal(computeGrid(10000, 1, 200).H, 1);
});

test('autoWidth: 边界 60/160 + 单调 + 全域 [60,160]', () => {
  assert.equal(autoWidth(100, 100, 0), 60);       // 小图平坦 → 最窄
  assert.equal(autoWidth(4000, 4000, 1), 160);    // 大图复杂 → 最宽
  assert.equal(autoWidth(1000, 1000, 0.5), 105);  // 60+0.4152*60+20
  assert.ok(autoWidth(800, 800, 0.5) < autoWidth(1600, 1600, 0.5));  // 尺寸单调
  assert.ok(autoWidth(1000, 1000, 0.2) < autoWidth(1000, 1000, 0.9)); // 方差单调
  for (const [w, h, v] of [[10, 10, 0], [500, 2000, 0.3], [8000, 30, 1], [1, 1, 0.5]]) {
    const out = autoWidth(w, h, v);
    assert.ok(out >= 60 && out <= 160, `autoWidth(${w},${h},${v})=${out}`);
  }
});

test('colorVarianceScore: 平坦→0，强对比→高，全域 [0,1]', () => {
  const flat = new Uint8Array(4 * 100).fill(128); // 纯灰
  assert.ok(colorVarianceScore(flat) < 1e-6); // 浮点累加噪声 ≈ 0
  const bw = new Uint8Array(4 * 100);
  for (let i = 0; i < 100; i++) {
    const v = i % 2 ? 255 : 0;
    bw.set([v, v, v, 255], i * 4);
  }
  assert.equal(colorVarianceScore(bw), 1); // std=127.5 → 0.7*1.99 clamp
  const colorful = new Uint8Array(4 * 64);
  for (let i = 0; i < 64; i++) colorful.set([(i * 37) % 256, (i * 91) % 256, (i * 53) % 256, 255], i * 4);
  const s = colorVarianceScore(colorful);
  assert.ok(s > 0 && s <= 1);
  assert.equal(colorVarianceScore(new Uint8Array(0)), 0);
});

// ---------- 主管线（F-1） ----------

test('convertCells: 黑白 2×1 → "@ " + 颜色（黑 0 / 白钳 190）', () => {
  const rgba = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]);
  const r = convertCells(rgba, 2, 1, { autoContrast: false });
  assert.deepEqual(r.chars, ['@ ']);
  assert.deepEqual(Array.from(r.colors), [0, 0, 0, 190, 190, 190]);
  assert.equal(r.lo, 0); assert.equal(r.hi, 255);
  assert.equal(resultToTxt(r), '@ \n');
});

test('convertCells: invert 翻转映射（深底单色用）', () => {
  const rgba = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]);
  const r = convertCells(rgba, 2, 1, { autoContrast: false, invert: true });
  assert.deepEqual(r.chars, [' @']);
});

test('convertCells: autoContrast 拉伸 + 纯度（不改输入）', () => {
  // 窄带亮度 100/150 → 拉伸后 100→暗端 '@'区，150→亮端
  const rgba = new Uint8Array(4 * 4);
  for (let i = 0; i < 2; i++) rgba.set([100, 100, 100, 255], i * 4);
  for (let i = 2; i < 4; i++) rgba.set([150, 150, 150, 255], i * 4);
  const before = Uint8Array.from(rgba);
  const r = convertCells(rgba, 2, 2, { autoContrast: true });
  assert.deepEqual(Array.from(rgba), Array.from(before)); // 输入未被改动
  assert.equal(r.lo, 100); assert.equal(r.hi, 150);
  assert.equal(r.chars[0], '@@'); // lo → l=0
  assert.equal(r.chars[1], '  '); // hi → l=1 → 空格
});

test('convertCells: brightness/gamma/saturation 贯通管线', () => {
  const rgba = new Uint8Array(2 * 2 * 4);
  rgba.set([200, 100, 100, 255], 0);
  rgba.set([200, 100, 100, 255], 4);
  rgba.set([0, 0, 0, 255], 8);
  rgba.set([0, 0, 0, 255], 12);
  const r = convertCells(rgba, 2, 2, { autoContrast: false, saturation: 1.6, brightness: 1, gamma: 1 });
  assert.deepEqual(Array.from(r.colors.slice(0, 3)), [242, 82, 82]); // 同 cellColor
  const dark = convertCells(rgba, 2, 2, { autoContrast: false, brightness: 0.5, gamma: 2 });
  // 亮度压暗 → 字符更密（更小 l）
  assert.ok(CHARS.indexOf(dark.chars[0][0]) <= CHARS.indexOf(r.chars[0][0]));
});

// ---------- 验收性能线（1000×1000 输入、W=120 核心侧 <1s） ----------

test('perf: 1M 像素方差评分 + 120×60 转换 < 1s', () => {
  const big = new Uint8Array(1000 * 1000 * 4);
  for (let i = 0; i < 1000 * 1000; i++) {
    big[i * 4] = (i * 7919) % 256;
    big[i * 4 + 1] = (i * 104729) % 256;
    big[i * 4 + 2] = (i * 1299709) % 256;
    big[i * 4 + 3] = 255;
  }
  const cells = new Uint8Array(120 * 60 * 4);
  for (let i = 0; i < 120 * 60; i++) {
    cells[i * 4] = (i * 31) % 256; cells[i * 4 + 1] = (i * 17) % 256;
    cells[i * 4 + 2] = (i * 53) % 256; cells[i * 4 + 3] = 255;
  }
  const t0 = performance.now();
  const variance = colorVarianceScore(big);
  const W = computeGrid(1000, 1000, 120).W;
  const r = convertCells(cells, W, 60, {});
  const dt = performance.now() - t0;
  assert.equal(W, 120);
  assert.equal(r.chars.length, 60);
  assert.equal(r.chars[0].length, 120);
  assert.ok(variance >= 0 && variance <= 1);
  assert.ok(dt < 1000, `core pipeline took ${dt.toFixed(1)}ms`);
});
