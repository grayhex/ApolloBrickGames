import { it } from 'vitest';
import { tetrisDef } from '../../../src/brick/games/tetris';
import { NEUTRAL_BRICK_INPUT, makeBrickInput } from '../../../src/brick/types';

const show = (g: ReturnType<typeof tetrisDef.create>): string => {
  const c = g.cells();
  const rows: string[] = [];
  for (let r = 0; r < 20; r++) rows.push([...c.slice(r * 10, r * 10 + 10)].map((v) => '.#*'[v] ?? '?').join(''));
  return rows.join('\n');
};

it('scratch', () => {
  const g = tetrisDef.create({ seed: 3, level: 4 });
  console.log(show(g));
  console.log(g.preview());
  g.start();
  for (let t = 0; t < 120; t++) g.step(NEUTRAL_BRICK_INPUT);
  console.log(show(g));
  for (let t = 0; t < 40; t++) g.step(makeBrickInput(t % 2 ? [] : ['left']));
  console.log(show(g));
  g.step(makeBrickInput(['fire']));
  console.log(show(g));
});
