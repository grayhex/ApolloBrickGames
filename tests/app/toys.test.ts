import { describe, expect, it } from 'vitest';
import { toyHelpRows } from '../../src/app/help';
import { setLang } from '../../src/app/i18n';
import { MESSAGES } from '../../src/app/messages';
import { TOY_KEY_IDS } from '../../src/app/toy';
import { DEFAULT_TOY, keyLabel, parseToy, shellFor, toyHref, TOY_IDS, TOYS } from '../../src/app/toys';
import { cloneBindings, DEFAULT_KEYBOARD_BINDINGS } from '../../src/input/bindings';
import { SHELLS } from '../../src/input/settings';

describe('выбор игрушки', () => {
  it('три игрушки: Crocodile Mario по умолчанию, «Часы+99» и «Морской бой» — по адресу ?toy=', () => {
    expect([...TOY_IDS]).toEqual(['mario', 'clock99', 'seabattle']);
    expect(DEFAULT_TOY).toBe('mario');
    expect(parseToy('')).toBe('mario');
    expect(parseToy('?toy=clock99')).toBe('clock99');
    expect(parseToy('?power=on&toy=seabattle')).toBe('seabattle');
    expect(parseToy('?toy=tetris')).toBe('mario'); // неизвестное значение — Mario
    expect(parseToy('?toy=')).toBe('mario');
  });

  it('ссылка переключателя: параметр игрушки меняется, отладка остаётся, уровень, вид, питание и зерно сбрасываются', () => {
    expect(toyHref('clock99', '', '/CrocodileMario/')).toBe('/CrocodileMario/?toy=clock99');
    expect(toyHref('mario', '?toy=seabattle', '/CrocodileMario/')).toBe('/CrocodileMario/');
    expect(toyHref('seabattle', '?debug&level=3&view=full&power=on&seed=5', '/')).toBe('/?debug=&toy=seabattle');
    expect(toyHref('mario', '?debug&toy=clock99&power=on', '/')).toBe('/?debug=');
  });

  it('только подтверждённые фото цвета: у «Часов+99» жёлтый, красный и белый; у «Морского боя» красный и синий; у Mario — все четыре', () => {
    expect(TOYS.mario.shells).toEqual(SHELLS);
    expect([...TOYS.clock99.shells].sort()).toEqual(['red', 'white', 'yellow']);
    expect([...TOYS.seabattle.shells].sort()).toEqual(['blue', 'red']);
    for (const id of TOY_IDS) expect(TOYS[id].shells, id).toContain(TOYS[id].defaultShell);
  });

  it('цвет из настроек, которого у игрушки не бывает, заменяется цветом по умолчанию', () => {
    expect(shellFor(TOYS.clock99, 'blue')).toBe('yellow');
    expect(shellFor(TOYS.clock99, 'red')).toBe('red');
    expect(shellFor(TOYS.seabattle, 'yellow')).toBe('red');
    expect(shellFor(TOYS.seabattle, 'blue')).toBe('blue');
    expect(shellFor(TOYS.mario, 'white')).toBe('white');
  });

  it('у заглушек тетриса уровней нет, левая панель пуста, светодиоды — только у «Часов+99»; у Mario всё как было', () => {
    expect(TOYS.mario).toMatchObject({ game: 'mario', info: true, levels: true, leds: true });
    expect(TOYS.clock99).toMatchObject({ game: 'tetris', info: false, levels: false, leds: true, glyph: 'star' });
    expect(TOYS.seabattle).toMatchObject({ game: 'tetris', info: false, levels: false, leds: false, glyph: 'square' });
  });
});

describe('подписи кнопок на корпусе', () => {
  it('в ряду круглых кнопок каждая из четырёх встречается один раз, подписи — как напечатано на игрушке', () => {
    for (const id of ['clock99', 'seabattle'] as const) {
      expect(TOYS[id].labels.round.map((button) => button.key).sort(), id).toEqual(['fire', 'onoff', 'sound', 'sp']);
    }
    expect(TOYS.clock99.labels.round.map((button) => [button.top, button.bottom])).toEqual([
      ['ON/OFF', undefined],
      ['MUTE', undefined],
      ['TIME', 'GAME'],
      ['START', 'PAUSE'],
    ]);
    expect(TOYS.seabattle.labels.round.map((button) => button.top)).toEqual(['ON/OFF', 'S./P.', 'MUTE', 'RESET']);
    expect(TOYS.seabattle.labels).toMatchObject({ up: 'UP/MODE', left: 'LEFT/LEVEL', right: 'RIGHT/SPEED', down: 'DOWN', big: 'ROTATE' });
    expect(TOYS.clock99.labels).toMatchObject({ up: '+ +', left: 'ALARM SET', right: 'TIME SET', big: 'ROTATE', bigBottom: 'ALARM ON/OFF' });
  });

  it('keyLabel даёт подпись любой из девяти кнопок', () => {
    expect(keyLabel(TOYS.clock99, 'fire')).toBe('TIME/GAME');
    expect(keyLabel(TOYS.clock99, 'sp')).toBe('START/PAUSE');
    expect(keyLabel(TOYS.clock99, 'jump')).toBe('ROTATE');
    expect(keyLabel(TOYS.seabattle, 'left')).toBe('LEFT/LEVEL');
    expect(keyLabel(TOYS.seabattle, 'fire')).toBe('RESET');
    expect(keyLabel(TOYS.mario, 'jump')).toBe('JUMP');
    for (const id of ['clock99', 'seabattle'] as const) for (const key of TOY_KEY_IDS) expect(keyLabel(TOYS[id], key), `${id}:${key}`).not.toBe('');
  });

  it('у каждой кнопки заглушки есть описание действия, и оно есть в обоих словарях', () => {
    for (const id of ['clock99', 'seabattle'] as const) {
      for (const key of TOY_KEY_IDS) {
        const what = TOYS[id].keyWhat[key];
        expect(what, `${id}:${key}`).toBeDefined();
        if (what) {
          expect(MESSAGES.ru[what], what).toBeTruthy();
          expect(MESSAGES.en[what], what).toBeTruthy();
        }
      }
      expect(MESSAGES.ru[TOYS[id].stageLabel]).toBeTruthy();
    }
  });
});

describe('справка игрушек с тетрисом', () => {
  it('таблица: все девять кнопок с подписями корпуса и клавишами, плюс строка про бросок', () => {
    setLang('ru');
    const bindings = cloneBindings(DEFAULT_KEYBOARD_BINDINGS);
    const rows = toyHelpRows(TOYS.clock99, bindings);
    expect(rows.map((row) => row.button)).toEqual(['ON/OFF', 'START/PAUSE', 'MUTE', 'TIME/GAME', 'ALARM SET', 'TIME SET', '+ +', '−', 'ROTATE', '⌨ / 🎮']);
    expect(rows.find((row) => row.button === 'ROTATE')?.keys).toContain('Пробел');
    expect(rows.find((row) => row.button === 'TIME/GAME')?.keys).toBe('—'); // у кнопки нет клавиши: часов в заглушке нет
    expect(rows.find((row) => row.button === 'ON/OFF')?.keys).toBe('O');
    const sea = toyHelpRows(TOYS.seabattle, bindings);
    expect(sea.map((row) => row.button)).toContain('RIGHT/SPEED');
    expect(sea.find((row) => row.button === 'RESET')?.what).toBe('новая игра');
  });
});
