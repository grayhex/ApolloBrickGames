import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readArchive } from '../../src/editor/archive';
import { warpImage } from '../../src/editor/calibration';
import { diagnose, errorsOf } from '../../src/editor/diagnose';
import { validateLevel } from '../../src/content/validate';
import { decodePng } from '../helpers/png';
import { ARTIFICIAL_QUAD, ARTIFICIAL_ROWS, artificialDoc, demoProjectFiles } from './demoProject';
import { env, pack } from './helpers';

const dir = join(__dirname, '..', '..', 'docs', 'editor-demo');
const files = {
  png: join(dir, 'artificial-reference.png'),
  zip: join(dir, 'artificial-room.crocodile-project.zip'),
  json: join(dir, 'artificial-room.json'),
};

describe('демонстрационный проект редактора (искусственный референс)', () => {
  it('файлы в docs/editor-demo совпадают с генератором (пересоздать: UPDATE_FIXTURES=1 npx vitest run tests/editor/demoProject.test.ts)', () => {
    const generated = demoProjectFiles();
    if (process.env['UPDATE_FIXTURES']) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(files.png, generated.png);
      writeFileSync(files.zip, generated.zip);
      writeFileSync(files.json, generated.json);
    }
    expect(existsSync(files.png)).toBe(true);
    expect(readFileSync(files.png).equals(generated.png)).toBe(true);
    expect(Buffer.from(readFileSync(files.zip)).equals(Buffer.from(generated.zip))).toBe(true);
    expect(readFileSync(files.json, 'utf-8')).toBe(generated.json);
  });

  it('архив открывается, документ без ошибок, игровой JSON проходит общий валидатор', async () => {
    const { doc, images } = await readArchive(new Uint8Array(readFileSync(files.zip)));
    expect(doc).toEqual(artificialDoc());
    expect(images.get('ref-1')?.mime).toBe('image/png');
    expect(errorsOf(diagnose(doc, env))).toEqual([]);
    const level = validateLevel(JSON.parse(readFileSync(files.json, 'utf-8')), pack.assets, env.validation);
    expect(level.rows).toEqual(ARTIFICIAL_ROWS);
    expect(level.marks.map((m) => m.status)).toEqual(['unknown', 'assumed', 'confirmed']);
  });

  it('калибровка по четырём углам выпрямляет кадр так, что каждая клетка карты совпадает со снимком', () => {
    const image = decodePng(readFileSync(files.png));
    const cellW = 24;
    const cellH = 21;
    const warped = warpImage(image, ARTIFICIAL_QUAD, 13 * cellW, 6 * cellH);
    const widthPx = 13 * cellW;
    ARTIFICIAL_ROWS.forEach((row, y) => {
      [...row].forEach((char, x) => {
        // Центр клетки: у блока здесь «окошко» цвета подложки, поэтому сравниваем угол клетки (рамка блока).
        const px = x * cellW + 4;
        const py = y * cellH + 4;
        const o = (py * widthPx + px) * 4;
        const dark = (warped[o] as number) < 100;
        expect(dark, `клетка (${x}, ${y})`).toBe(char === '#');
      });
    });
  });
});
