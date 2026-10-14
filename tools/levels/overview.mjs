#!/usr/bin/env node
/**
 * Обзорный снимок девяти уровней MARIO: каждый уровень — полоса из клеток (6 рядов × ширина), без графики игры.
 * Запуск: node tools/levels/overview.mjs  → docs/screenshots/levels-overview.png
 *
 * Цвета: тёмный — твёрдая клетка; светло-красный — провал (опасная область); розовый — сердце; оранжевый — малый враг и его размах;
 * красно-оранжевый — большой враг и размах; зелёный — финиш; синий — стартовая крышка. Пробиваемый блок-крышка и герой показаны синим.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CELL = 5;
const GAP = 14;
const MARGIN = 8;
const BG = [238, 240, 226];
const COLORS = {
  solid: [48, 58, 48],
  pit: [236, 190, 180],
  heart: [226, 90, 140],
  small: [240, 170, 70],
  smallRange: [250, 224, 176],
  big: [214, 70, 40],
  bigRange: [246, 200, 186],
  finish: [60, 160, 90],
  lid: [70, 110, 200],
  grid: [226, 228, 212],
};

const levels = Array.from({ length: 9 }, (_, i) => JSON.parse(readFileSync(join(ROOT, 'public', 'content', 'room', 'levels', `mario-${i + 1}.json`), 'utf8')));
const maxWidth = Math.max(...levels.map((l) => l.width));
const stripH = levels[0].height * CELL;
const W = MARGIN * 2 + maxWidth * CELL;
const H = MARGIN * 2 + levels.length * (stripH + GAP);
const px = new Uint8Array(W * H * 3);
for (let i = 0; i < W * H; i++) px.set(BG, i * 3);

function rect(x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (xx >= 0 && xx < W && yy >= 0 && yy < H) px.set(color, (yy * W + xx) * 3);
}
const cell = (n, x, y, color, w = 1, h = 1) => rect(MARGIN + x * CELL, MARGIN + n * (stripH + GAP) + y * CELL, w * CELL, h * CELL, color);

levels.forEach((level, n) => {
  for (let y = 0; y < level.height; y++) for (let x = 0; x < level.width; x++) if ((x + y) % 2 === 0) cell(n, x, y, COLORS.grid);
  for (const o of level.objects) {
    if (o.type === 'hazard') for (let x = o.x; x < o.x + o.w; x++) for (let y = o.y; y < o.y + o.h; y++) cell(n, x, y, COLORS.pit);
    if (o.type === 'patroller') {
      const r = o.params.range ?? 0;
      cell(n, o.x - r, o.y, o.w === 2 ? COLORS.bigRange : COLORS.smallRange, o.w + 2 * r, o.h);
    }
  }
  for (let y = 0; y < level.height; y++) for (let x = 0; x < level.width; x++) if (level.rows[y][x] === '#') cell(n, x, y, COLORS.solid);
  for (const o of level.objects) {
    if (o.type === 'patroller') cell(n, o.x, o.y, o.w === 2 ? COLORS.big : COLORS.small, o.w, o.h);
    else if (o.type === 'pickup') cell(n, o.x, o.y, COLORS.heart);
    else if (o.type === 'finish') cell(n, o.x, o.y, COLORS.finish);
    else if (o.type === 'brick') cell(n, o.x, o.y, COLORS.lid);
  }
});

// PNG: сигнатура, IHDR, IDAT (zlib), IEND.
function crc32(buffer) {
  let c;
  let crc = 0xffffffff;
  for (const byte of buffer) {
    c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
const out = join(ROOT, 'docs', 'screenshots');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'levels-overview.png'), png);
process.stdout.write(`docs/screenshots/levels-overview.png  ${W} × ${H}, ${png.length} байт\n`);
