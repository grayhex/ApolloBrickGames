import { describe, expect, it } from 'vitest';
import { helpRows, POWER_KEY, SOUND_KEY } from '../../src/app/help';
import { dpadMask, KEY_ACTIONS, pressedKeys, startPauseAction, START_PAUSE_MASK, TOY_KEY_IDS } from '../../src/app/toy';
import { actionBit, maskOf } from '../../src/core/actions';
import { cloneBindings, DEFAULT_KEYBOARD_BINDINGS } from '../../src/input/bindings';
import { sanitizeSettings, SHELLS } from '../../src/input/settings';

describe('кнопки корпуса', () => {
  it('девять кнопок, как на устройстве; игровые кнопки отображаются на действия', () => {
    expect([...TOY_KEY_IDS].sort()).toEqual(['down', 'fire', 'jump', 'left', 'onoff', 'right', 'sound', 'sp', 'up']);
    expect(KEY_ACTIONS.jump).toBe(actionBit('jump'));
    expect(KEY_ACTIONS.onoff).toBeUndefined(); // питание и звук — не игровые действия
    expect(KEY_ACTIONS.sound).toBeUndefined();
  });

  it('S./P. — одна кнопка: в игре посылает паузу, в остальных фазах — старт', () => {
    expect(startPauseAction('playing')).toBe(actionBit('pause'));
    for (const phase of ['ready', 'paused', 'dead', 'gameOver', 'completed'] as const) {
      expect(startPauseAction(phase), phase).toBe(actionBit('start'));
    }
    expect(START_PAUSE_MASK).toBe(maskOf('start', 'pause'));
  });

  it('подсветка по маске удерживаемых действий: любой источник (клавиатура, геймпад, мышь) нажимает кнопку', () => {
    expect([...pressedKeys(0)]).toEqual([]);
    expect([...pressedKeys(maskOf('right', 'jump'))].sort()).toEqual(['jump', 'right']);
    expect([...pressedKeys(maskOf('start'))]).toEqual(['sp']);
    expect([...pressedKeys(maskOf('pause'))]).toEqual(['sp']);
    expect([...pressedKeys(maskOf('confirm', 'back'))]).toEqual([]); // команды меню кнопок не нажимают
  });
});

describe('справка', () => {
  it('таблица по привязкам: S./P. — старт и пауза, прыжок — по текущим клавишам', () => {
    const rows = helpRows(DEFAULT_KEYBOARD_BINDINGS);
    expect(rows.map((r) => r.button)).toEqual(['ON/OFF', 'S./P.', 'SOUND', 'FIRE', '◀ LEFT', 'RIGHT ▶', 'UP', 'DOWN', 'JUMP']);
    expect(rows.find((r) => r.button === 'S./P.')?.keys).toBe('Enter · Esc · P');
    expect(rows.find((r) => r.button === 'JUMP')?.keys).toBe('Пробел · Z');
    expect(rows[0]?.keys).toBe(POWER_KEY);
    expect(rows[2]?.keys).toBe(SOUND_KEY);

    const custom = cloneBindings(DEFAULT_KEYBOARD_BINDINGS);
    custom.jump = ['k:KeyJ'];
    custom.fire = [];
    const changed = helpRows(custom);
    expect(changed.find((r) => r.button === 'JUMP')?.keys).toBe('J');
    expect(changed.find((r) => r.button === 'FIRE')?.keys).toBe('—');
  });
});

describe('цвет корпуса в настройках', () => {
  it('доступны синий, красный, жёлтый и белый; неизвестное значение заменяется синим', () => {
    expect([...SHELLS]).toEqual(['blue', 'red', 'yellow', 'white']);
    const base = { version: 1, display: { ghost: null, sound: true } };
    expect(sanitizeSettings({ ...base, display: { ...base.display, shell: 'yellow' } }).display.shell).toBe('yellow');
    expect(sanitizeSettings({ ...base, display: { ...base.display, shell: 'green' } }).display.shell).toBe('blue');
  });
});

describe('крестовина пульта для телефона', () => {
  const left = actionBit('left');
  const right = actionBit('right');
  const up = actionBit('up');
  const down = actionBit('down');

  it('в центре (мёртвая зона) ничего не нажато; у осей — одно направление', () => {
    expect(dpadMask(0, 0)).toBe(0);
    expect(dpadMask(0.1, -0.1)).toBe(0); // внутри мёртвой зоны
    expect(dpadMask(1, 0)).toBe(right);
    expect(dpadMask(-1, 0)).toBe(left);
    expect(dpadMask(0, -1)).toBe(up);
    expect(dpadMask(0, 1)).toBe(down);
    expect(dpadMask(0.85, 0.2)).toBe(right); // чуть мимо оси — всё ещё одно направление
    expect(dpadMask(-0.2, -0.85)).toBe(up);
  });

  it('между осями — диагональ: две стрелки сразу (прыжок вправо или влево)', () => {
    expect(dpadMask(0.7, -0.7)).toBe(right | up);
    expect(dpadMask(-0.7, -0.7)).toBe(left | up);
    expect(dpadMask(0.7, 0.7)).toBe(right | down);
    expect(dpadMask(-0.7, 0.7)).toBe(left | down);
  });

  it('границы полос симметричны: углы к оси около 23° и 66° — граница одиночного направления и диагонали', () => {
    const at = (degrees: number) => dpadMask(Math.cos((degrees * Math.PI) / 180), -Math.sin((degrees * Math.PI) / 180)); // от оси вправо, вверх
    expect(at(0)).toBe(right);
    expect(at(20)).toBe(right);
    expect(at(30)).toBe(right | up);
    expect(at(60)).toBe(right | up);
    expect(at(70)).toBe(up);
    expect(at(90)).toBe(up);
  });

  it('палец за пределами зоны направление не теряет: оно определяется углом', () => {
    expect(dpadMask(3, 0.2)).toBe(right);
    expect(dpadMask(-2, -2)).toBe(left | up);
  });
});

