import type { GamepadLike } from '../../src/input/gamepad';

/** Подставной контроллер: стандартный mapping, 17 кнопок, 4 оси. */
export class FakePad implements GamepadLike {
  connected = true;
  mapping: string;
  buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  axes = [0, 0, 0, 0];
  index: number;
  id: string;

  constructor(index = 0, id = 'Fake Pad (STANDARD)', mapping = 'standard') {
    this.index = index;
    this.id = id;
    this.mapping = mapping;
  }

  press(...indexes: number[]): this {
    for (const i of indexes) this.buttons[i] = { pressed: true, value: 1 };
    return this;
  }

  release(...indexes: number[]): this {
    for (const i of indexes) this.buttons[i] = { pressed: false, value: 0 };
    return this;
  }
}
