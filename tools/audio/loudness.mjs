#!/usr/bin/env node
/**
 * Сверка громкости музыки «Ремастер» с оригинальной мелодией-пищалкой.
 *
 *   node --experimental-strip-types tools/audio/loudness.mjs [путь/к/треку.m4a]   (по умолчанию public/audio/remaster.m4a)
 *
 * Мелодию (TUNE из src/audio/phrases.ts) рендерит в WAV с теми же усилениями, что в beeper.ts (общий MASTER_GAIN × MELODY_GAIN при
 * громкости ползунка 100 %), измеряет интегральную громкость (EBU R128, LUFS) обоих через ffmpeg и печатает, какой множитель
 * TRACK_GAIN нужен, чтобы запись была не громче оригинала. Нужны ffmpeg и Node 22.6+ (флаг --experimental-strip-types).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TUNE } from '../../src/audio/phrases.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const track = process.argv[2] ?? join(root, 'public', 'audio', 'remaster.m4a');
const MASTER = 0.14; // MASTER_GAIN в src/audio/beeper.ts
const MELODY = 0.6; // MELODY_GAIN там же
const RATE = 48000;

/** Мелодия как её слышно при громкости 100 %: прямоугольные волны ±1, общий множитель, аккорды делят уровень пополам. */
function renderTune(loops) {
  const total = TUNE.reduce((sum, note) => sum + note.ms, 0);
  const out = new Float32Array(Math.ceil(((total * loops) / 1000) * RATE));
  let at = 0;
  for (let loop = 0; loop < loops; loop++) {
    for (const note of TUNE) {
      const length = Math.max(0, note.ms - (note.gap ?? 0)) / 1000;
      const voices = note.noise ? 1 : note.hz.length;
      for (let v = 0; v < voices; v++) {
        const hz = note.noise ? (note.noise.lo + note.noise.hi) / 2 : note.hz[v];
        const gain = (MASTER * MELODY) / voices;
        const from = Math.floor(at * RATE);
        const to = Math.min(out.length, Math.floor((at + length) * RATE));
        for (let i = from; i < to; i++) out[i] += gain * (Math.sin((2 * Math.PI * hz * (i - from)) / RATE) >= 0 ? 1 : -1);
      }
      at += note.ms / 1000;
    }
  }
  return out;
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), i * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

/** Интегральная громкость файла, LUFS (ffmpeg ebur128); null — не удалось измерить. */
function lufs(file) {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const match = /I:\s+(-?[\d.]+) LUFS/.exec(`${run.stderr}`.split('Summary:').pop() ?? '');
  return match ? Number(match[1]) : null;
}

const dir = mkdtempSync(join(tmpdir(), 'loudness-'));
const original = join(dir, 'original-tune.wav');
writeFileSync(original, wav(renderTune(12)));
const a = lufs(original);
const b = lufs(track);
if (a === null || b === null) {
  console.error('Не удалось измерить громкость: нужен ffmpeg в PATH и читаемый файл трека.');
  process.exit(1);
}
const gain = 10 ** ((a - b) / 20);
console.log(`мелодия-пищалка (ползунок 100 %): ${a.toFixed(1)} LUFS`);
console.log(`запись ${track}: ${b.toFixed(1)} LUFS без усиления`);
console.log(`TRACK_GAIN, при котором запись не громче оригинала: ≤ ${gain.toFixed(3)} (${(a - b).toFixed(1)} дБ)`);
