import { buildArchive, type StoredImage } from '../../src/editor/archive';
import { applyMatrix, homography } from '../../src/editor/calibration';
import { gameLevelJson } from '../../src/editor/diagnose';
import { newRoomDoc } from '../../src/editor/templates';
import type { EditorDoc, Pt, Quad } from '../../src/editor/types';
import { encodePng } from '../helpers/png';
import { pack } from './helpers';

/** Что «показано» на искусственном кадре: 13 × 6 клеток, `#` — блок. Это не оригинальный уровень. */
export const ARTIFICIAL_ROWS = ['.............', '.............', '..........##.', '....##.......', '.##..........', '######.######'];

/** Углы игровой области на искусственном кадре (с перспективой), в пикселях. */
export const ARTIFICIAL_QUAD: Quad = [
  { x: 96, y: 52 },
  { x: 574, y: 34 },
  { x: 601, y: 318 },
  { x: 70, y: 300 },
];

export const IMAGE_SIZE = { width: 640, height: 360 };

/**
 * Рисует искусственный «снимок экрана»: LCD-поле 13 × 6 клеток под перспективой, тёмный корпус вокруг,
 * цветные метки по углам. Это иллюстрация для проверки калибровки, а не фотография оригинала.
 */
export function renderArtificialReference(): Buffer {
  const { width, height } = IMAGE_SIZE;
  const [a, b, c, d] = ARTIFICIAL_QUAD;
  const cellsW = 13;
  const cellsH = 6;
  const toCells = homography([a, b, c, d], [
    { x: 0, y: 0 },
    { x: cellsW, y: 0 },
    { x: cellsW, y: cellsH },
    { x: 0, y: cellsH },
  ]);
  if (!toCells) throw new Error('вырожденные углы');
  const rgba = new Uint8Array(width * height * 4);
  const markers: [Pt, [number, number, number]][] = [
    [a, [230, 60, 60]],
    [b, [60, 200, 90]],
    [c, [70, 110, 235]],
    [d, [240, 210, 60]],
  ];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      let color: [number, number, number] = [70 + ((x + y) % 7), 72, 76];
      const p = applyMatrix(toCells, x + 0.5, y + 0.5);
      if (p && p.x > -0.35 && p.y > -0.35 && p.x < cellsW + 0.35 && p.y < cellsH + 0.35) color = [128, 132, 124];
      if (p && p.x >= 0 && p.y >= 0 && p.x < cellsW && p.y < cellsH) {
        const cx = Math.floor(p.x);
        const cy = Math.floor(p.y);
        const fx = p.x - cx;
        const fy = p.y - cy;
        const block = ARTIFICIAL_ROWS[cy]?.[cx] === '#';
        color = [173, 179, 140];
        if (block) color = fx < 0.08 || fx > 0.92 || fy < 0.08 || fy > 0.92 ? [48, 58, 48] : fx > 0.3 && fx < 0.7 && fy > 0.3 && fy < 0.7 ? [173, 179, 140] : [48, 58, 48];
        else if (fx < 0.03 || fy < 0.03) color = [160, 166, 128];
      }
      for (const [m, rgb] of markers) {
        if (Math.hypot(x - m.x, y - m.y) < 7) color = rgb;
      }
      rgba[o] = color[0];
      rgba[o + 1] = color[1];
      rgba[o + 2] = color[2];
      rgba[o + 3] = 255;
    }
  }
  return encodePng(width, height, rgba);
}

/** Демонстрационный проект: искусственный кадр + по нему восстановленная комната с пометками. */
export function artificialDoc(): EditorDoc {
  const base = newRoomDoc(pack, { projectId: 'demo-artificial', name: 'Искусственный пример', pack: 'room', id: 'artificial-room' });
  return {
    ...base,
    hudLabel: 'DEMO',
    note: 'Искусственный референс, не фотография оригинала: пример восстановления комнаты по одному кадру.',
    rows: [...ARTIFICIAL_ROWS],
    start: { x: 0, y: 3 },
    marks: [
      { id: 'mark-1', x: 10, y: 0, w: 3, h: 2, status: 'unknown', note: 'Верх экрана на кадре не разобрать — клетки не восстановлены (пример).', ref: 'Искусственный кадр' },
      { id: 'mark-2', x: 6, y: 5, w: 1, h: 1, status: 'assumed', note: 'Разрыв в полу: провал или просто не нарисованный блок — предположение (пример).', ref: 'Искусственный кадр' },
      { id: 'mark-3', x: 4, y: 3, w: 2, h: 1, status: 'confirmed', note: 'Платформа хорошо видна на кадре (пример).', ref: 'Искусственный кадр' },
    ],
    refs: [
      {
        id: 'ref-1',
        name: 'Искусственный кадр',
        description: 'Сгенерированный рисунок 13 × 6 клеток под перспективой. Цветные кружки — углы игровой области: красный — верхний левый, зелёный — верхний правый, синий — нижний правый, жёлтый — нижний левый.',
        videoTime: '',
        mime: 'image/png',
        width: IMAGE_SIZE.width,
        height: IMAGE_SIZE.height,
        quad: [...ARTIFICIAL_QUAD] as unknown as Quad,
        origin: { x: 0, y: 0 },
        opacity: 0.6,
        visible: true,
        locked: false,
      },
    ],
  };
}

export function demoProjectFiles(): { png: Buffer; zip: Uint8Array; json: string } {
  const png = renderArtificialReference();
  const doc = artificialDoc();
  const images = new Map<string, StoredImage>([['ref-1', { mime: 'image/png', bytes: new Uint8Array(png) }]]);
  return {
    png,
    zip: buildArchive(doc, images, '2026-10-13T00:00:00.000Z'),
    json: `${JSON.stringify(gameLevelJson(doc), null, 2)}\n`,
  };
}
