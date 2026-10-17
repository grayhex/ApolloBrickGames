import { describe, expect, it } from 'vitest';

/** Сценарии реального продвижения и неудачи/завершения; fuzz и conformance сюда не входят.
 * Алиасы разделяют сценарии одной реализации. Каждый файл регистрирует обе категории через scenarioSuite.
 */
export const SCENARIO_GROUPS = {
  'scenarios.arcade': ['snake', 'flappy-bird', 'basket', 'digger', 'helicopter-bomber', 'bowling'],
  'scenarios.shooters': ['honeybee', 'space-invaders', 'ufo-raiders', 'dual-shooting', 'talking-shooting', 'tetris-shooting', 'meteor-fighter'],
  'scenarios.puzzles': ['reversi', '2048', 'matching-blocks', 'whack-a-mole', 'simon', 'dance', 'dice'],
  'scenarios.road': ['obstacle-race', 'boat-racing', 'racing-four', 'super-tank', 'racing-pickup', 'punch-racing'],
  'scenarios.balls': ['pong', 'pong-double', 'pneumatic-ball', 'arkanoid-dots', 'tetris-flicker', 'columns', 'columns-flicker', 'dr-mario'],
  content: ['sokoban', 'quarth', 'lights-out', 'maze', 'fill-connect', 'peg-solitaire'],
  review: ['jigsaw'],
  tanks: ['tank'],
  frogger: ['frog'],
  racing: ['racing', 'racing-shooting'],
  invaders: ['shooting', 'shooting-array'],
  shapes: ['shooting-figures'],
  construction: ['construction'],
  tetris: ['tetris'],
  pentix: ['tetris-big', 'tetris-pentix'],
  arkanoid: ['arkanoid'],
  approximations: ['sea-battle', 'romeo-juliet'],
} as const;

type Kind = 'прогресс' | 'неудача';
export function scenarioSuite<G extends keyof typeof SCENARIO_GROUPS>(group: G) {
  const ids: readonly string[] = SCENARIO_GROUPS[group];
  const covered: Record<Kind, Set<string>> = { прогресс: new Set(), неудача: new Set() };
  describe(`${group}: охват сценариями`, () => {
    it('у каждой игры есть прогресс и неудача/завершение', () => {
      for (const kind of ['прогресс', 'неудача'] as const) expect([...covered[kind]].sort(), kind).toEqual([...ids].sort());
    });
  });
  return (
    id: (typeof SCENARIO_GROUPS)[G][number] | readonly (typeof SCENARIO_GROUPS)[G][number][],
    kind: Kind,
    title: string,
    body: () => void,
  ): void => {
    const games = typeof id === 'string' ? [id] : id;
    for (const game of games) covered[kind].add(game);
    it(`[${games.join(', ')} · ${kind}] ${title}`, body);
  };
}
