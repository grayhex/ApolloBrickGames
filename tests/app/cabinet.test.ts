import { describe, expect, it } from 'vitest';
import { createCabinet } from '../../src/app/cabinet';
import { bodyActions, canAssign, guideForBody } from '../../src/app/bodyButtons';
import { TOYS, type ToyModel } from '../../src/app/toys';
import { BRICK_GAMES } from '../../src/brick/games';
import { BRICK_GUIDES } from '../../src/brick/guides';
import { guidedActions } from '../../src/brick/guide';
import { SOKOBAN_LEVELS } from '../../src/brick/games/library/sokobanLevels';
import { makeFrame, NEUTRAL_FRAME, type Action } from '../../src/core';
import type { GameId } from '../../src/games/catalog';

const options = { seed: 7, loadHi: () => 0, defs: BRICK_GAMES };
const assign = (model: ToyModel, id: GameId): ToyModel => ({
  ...model,
  defaultGame: id,
  games: [{ id, label: id, status: 'ready' }],
});

for (const toy of ['clock99', 'tank168', 'seabattle'] as const)
  describe(`${toy}: ввод через оболочку`, () => {
    const model = TOYS[toy];
    it('FIRE не листает меню; ROTATE листает, RESET возвращает к выбору', () => {
      const c = createCabinet(model, options),
        initial = c.activeGame;
      expect(c.menu(makeFrame({ pressed: ['fire'] }))).toEqual([]);
      expect(c.activeGame).toBe(initial);
      c.menu(makeFrame({ pressed: ['jump'] }));
      expect(c.activeGame).not.toBe(initial);
      c.start();
      expect(c.inMenu).toBe(false);
      c.restart();
      expect(c.inMenu).toBe(true);
      expect(c.phase).toBe('ready');
    });

    for (const [id, def] of Object.entries(BRICK_GAMES)) {
      if (!canAssign(def, model)) continue;
      it(`${id}: FIRE из клавиатуры/геймпада не меняет партию и не мешает кнопкам корпуса`, () => {
        const configured = assign(model, id as GameId);
        const reference = createCabinet(configured, options),
          extraFire = createCabinet(configured, options);
        reference.start();
        extraFire.start();
        // Оба источника ввода сходятся в InputFrame. Проверяем фронт, удержание, сочетания и отпускание.
        const controls: Action[] = ['left', 'right', 'up', 'down', 'jump'];
        for (let t = 0; t < 240; t++) {
          const action = controls[Math.floor(t / 24) % controls.length]!;
          const pressed = t % 24 === 0 ? [action] : [];
          const frame = makeFrame({ pressed, held: [action] });
          const withFire = makeFrame({
            pressed: [...pressed, ...(t % 2 === 0 ? ['fire' as const] : [])],
            held: [action, 'fire'],
            released: t % 2 ? ['fire'] : [],
          });
          expect(extraFire.step(withFire)).toEqual(reference.step(frame));
          expect(extraFire.scene({ sound: false, allOn: false })).toEqual(reference.scene({ sound: false, allOn: false }));
        }
        const guide = guideForBody(BRICK_GUIDES[id]!, model);
        for (const action of guidedActions(guide.controls)) expect(bodyActions(model).has(action)).toBe(true);
        expect(guidedActions(guide.controls).has('fire')).toBe(false);
        expect(guide.controls.some((control) => control.keyboardOnly)).toBe(false);
        expect(guide.controls.map((control) => `${control.text.ru} ${control.text.en}`).join(' ')).not.toMatch(/клавиша «огонь»|the fire key/);
      });
    }

    it('Sokoban проходится стрелками корпуса; ROTATE отменяет ход, пауза замораживает, RESET выходит в меню', () => {
      const c = createCabinet(assign(model, 'sokoban'), options);
      c.start();
      const start = c.scene({ sound: false, allOn: false }).cells.slice();
      c.step(makeFrame({ pressed: ['left'] }));
      c.step(makeFrame({ pressed: ['jump'] })); // отмена, не скрытый FIRE
      expect(c.scene({ sound: false, allOn: false }).cells).toEqual(start);
      c.pause();
      const tick = c.tick;
      c.step(makeFrame({ pressed: ['down', 'fire'] }));
      expect(c.tick).toBe(tick);
      c.resume();
      const dir = { l: 'left', r: 'right', u: 'up', d: 'down' } as const;
      const events = [];
      for (const move of SOKOBAN_LEVELS[0]!.solution.toLowerCase()) {
        events.push(...c.step(makeFrame({ pressed: [dir[move as keyof typeof dir]] })));
        c.step(NEUTRAL_FRAME);
      }
      expect(events).toContainEqual({ type: 'win' });
      expect(c.score).toBe(100);
      for (let t = 0; t < 80; t++) c.step(NEUTRAL_FRAME);
      expect(c.level).toBe(1); // экран 0..9, движок 1..10
      c.restart();
      expect(c.inMenu).toBe(true);
      expect(c.phase).toBe('ready');
    });
  });
