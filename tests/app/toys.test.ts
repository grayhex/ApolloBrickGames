import { LIBRARY_IDS } from '../../src/games/library';
import { describe, expect, it } from 'vitest';
import { toyHelpRows } from '../../src/app/help';
import { setLang } from '../../src/app/i18n';
import { MESSAGES } from '../../src/app/messages';
import { TOY_KEY_IDS } from '../../src/app/toy';
import { APOLLO_IDS, DEFAULT_TOY, engineOf, gameKey, hasReset, keyLabel, parseToy, shellFor, toyHref, TOY_IDS, TOYS } from '../../src/app/toys';
import { ILLUSTRATIONS } from '../../src/brick';
import { GAME_IDS, GAMES } from '../../src/games/catalog';
import { cloneBindings, DEFAULT_KEYBOARD_BINDINGS } from '../../src/input/bindings';
import { APOLLO_SHELLS } from '../../src/input/settings';

describe('выбор игрушки', () => {
  it('четыре Apollo и два экспоната: универсальный Brick Game по умолчанию, остальные — по адресу ?toy=', () => {
    expect([...APOLLO_IDS]).toEqual(['mario', 'clock99', 'seabattle', 'tank168']);
    expect([...TOY_IDS]).toEqual([...APOLLO_IDS, 'alibaba', 'minibrick', 'brickgame', 'e88', 'apollo-b0202']);
    expect(parseToy('?toy=alibaba')).toBe('alibaba');
    expect(DEFAULT_TOY).toBe('brickgame');
    expect(parseToy('')).toBe('brickgame');
    expect(parseToy('?toy=mario')).toBe('mario');
    expect(parseToy('?toy=clock99')).toBe('clock99');
    expect(parseToy('?power=on&toy=seabattle')).toBe('seabattle');
    expect(parseToy('?toy=tank168')).toBe('tank168');
    expect(parseToy('?toy=tetris')).toBe('brickgame'); // неизвестное значение — универсальный Brick Game
    expect(parseToy('?toy=')).toBe('brickgame');
  });

  it('ссылка переключателя: параметр игрушки меняется, отладка остаётся, уровень, вид, питание и зерно сбрасываются', () => {
    expect(toyHref('clock99', '', '/CrocodileMario/')).toBe('/CrocodileMario/?toy=clock99');
    expect(toyHref('brickgame', '?toy=seabattle', '/CrocodileMario/')).toBe('/CrocodileMario/');
    expect(toyHref('mario', '', '/CrocodileMario/')).toBe('/CrocodileMario/?toy=mario');
    expect(toyHref('seabattle', '?debug&level=3&view=full&power=on&seed=5', '/')).toBe('/?debug=&toy=seabattle');
    expect(toyHref('brickgame', '?debug&toy=clock99&power=on', '/')).toBe('/?debug=');
    expect(toyHref('tank168', '', '/')).toBe('/?toy=tank168');
  });

  it('только подтверждённые фото цвета: у «Часов+99» жёлтый, красный и белый; у «Морского боя» красный и синий; у «168 в 1 танк» красный и жёлтый; у Mario — все четыре', () => {
    expect(TOYS.mario.shells).toEqual(APOLLO_SHELLS);
    expect([...TOYS.clock99.shells].sort()).toEqual(['red', 'white', 'yellow']);
    expect([...TOYS.seabattle.shells].sort()).toEqual(['blue', 'red']);
    expect([...TOYS.tank168.shells].sort()).toEqual(['red', 'yellow']);
    for (const id of TOY_IDS) expect(TOYS[id].shells, id).toContain(TOYS[id].defaultShell);
  });

  it('цвет из настроек, которого у игрушки не бывает, заменяется цветом по умолчанию', () => {
    expect(shellFor(TOYS.clock99, 'blue')).toBe('yellow');
    expect(shellFor(TOYS.clock99, 'red')).toBe('red');
    expect(shellFor(TOYS.seabattle, 'yellow')).toBe('red');
    expect(shellFor(TOYS.seabattle, 'blue')).toBe('blue');
    expect(shellFor(TOYS.mario, 'white')).toBe('white');
    expect(shellFor(TOYS.tank168, 'blue')).toBe('red');
    expect(shellFor(TOYS.tank168, 'white')).toBe('red');
    expect(shellFor(TOYS.tank168, 'yellow')).toBe('yellow');
  });

  it('у тетрис-заглушки и консолей с меню уровней на пульте нет, слева справка, светодиоды — у всех, кроме «Морского боя»; у Mario всё как было', () => {
    expect(TOYS.mario).toMatchObject({ defaultGame: 'mario', menu: false, info: true, levels: true, leds: true });
    expect(TOYS.clock99).toMatchObject({ defaultGame: 'tetris', menu: true, info: true, levels: false, leds: true, glyph: 'star', panel: 'clock', deco: 'flourish' });
    // «Морской бой» и «168 в 1 танк» — консоли с меню игр: первая восстановленная игра — танки.
    expect(TOYS.seabattle).toMatchObject({ defaultGame: 'sea-battle', menu: true, info: true, levels: false, leds: false, glyph: 'square', panel: 'sea', deco: 'frame' });
    // «168 в 1 танк»: точка в прямоугольнике, как у «Морского боя», а рамка с завитками и светодиоды — как у «Часов+99»; в углу панели чашка паузы.
    expect(TOYS.tank168).toMatchObject({ defaultGame: 'tank', menu: true, info: true, levels: false, leds: true, glyph: 'square', panel: 'tank', deco: 'flourish', gamesCount: 168 });
    expect(engineOf(TOYS.mario)).toBe('mario');
    for (const id of ['clock99', 'seabattle', 'tank168'] as const) expect(engineOf(TOYS[id]), id).toBe('tetris');
  });
});

describe('подписи кнопок на корпусе', () => {
  it('в ряду круглых кнопок каждая из четырёх встречается один раз, подписи — как напечатано на игрушке', () => {
    for (const id of ['clock99', 'seabattle', 'tank168'] as const) {
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
    // «168 в 1 танк»: кнопки и надписи те же, что у «Морского боя» (по фото жёлтой и красной версий).
    expect(TOYS.tank168.labels).toEqual(TOYS.seabattle.labels);
    expect(hasReset(TOYS.tank168)).toBe(true);
    expect(hasReset(TOYS.seabattle)).toBe(true);
    expect(hasReset(TOYS.clock99)).toBe(false); // у «Часов+99» на этом месте TIME/GAME
    expect(hasReset(TOYS.mario)).toBe(false);
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
    for (const id of ['clock99', 'seabattle', 'tank168'] as const) {
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
  it('таблица: только девять кнопок корпуса, без дополнительного броска', () => {
    setLang('ru');
    const bindings = cloneBindings(DEFAULT_KEYBOARD_BINDINGS);
    const rows = toyHelpRows(TOYS.clock99, bindings);
    expect(rows.map((row) => row.button)).toEqual(['ON/OFF', 'START/PAUSE', 'MUTE', 'TIME/GAME', 'ALARM SET', 'TIME SET', '+ +', '−', 'ROTATE']);
    expect(rows.find((row) => row.button === 'ROTATE')?.keys).toContain('Пробел');
    expect(rows.find((row) => row.button === 'TIME/GAME')?.keys).toBe('—'); // физическая кнопка возвращает в меню
    expect(rows.find((row) => row.button === 'ON/OFF')?.keys).toBe('O');
    const sea = toyHelpRows(TOYS.seabattle, bindings);
    expect(sea.map((row) => row.button)).toContain('RIGHT/SPEED');
    expect(sea.find((row) => row.button === 'RESET')?.what).toBe('в меню (выбор игры)');
    expect(sea.find((row) => row.button === 'UP/MODE')?.what).toBe('вверх · в меню — следующий вариант');
  });
});

describe('набор игр у консоли', () => {
  it('у каждой консоли набор закреплён по наклейке или упаковке; все игры есть в каталоге, играемая — в наборе', () => {
    for (const id of APOLLO_IDS) {
      const model = TOYS[id];
      expect(model.games.length, id).toBeGreaterThan(0);
      expect(new Set(model.games.map((game) => game.id)).size, `${id}: игры не повторяются`).toBe(model.games.length);
      for (const game of model.games) expect(GAME_IDS, `${id}:${game.id}`).toContain(game.id);
      expect(model.games.map((game) => game.id), id).toContain(model.defaultGame);
    }
    expect(Object.keys(GAMES).sort()).toEqual([...GAME_IDS].sort());
  });

  it('наборы: Mario — MARIO (9), TETRIS (99), SHOOTING (1) по упаковке; «Часы+99» — по наклейке; «Морской бой» A–F и «168 в 1 танк» 1–9 — по списку владельца', () => {
    const ids = (id: (typeof TOY_IDS)[number]): string[] => TOYS[id].games.map((game) => game.id);
    expect(TOYS.mario.games.map((game) => [game.label, game.variants])).toEqual([['MARIO', 9], ['TETRIS', 99], ['SHOOTING', 1]]);
    expect(ids('clock99')).toEqual(['tetris', 'racing', 'shooting', 'tank', 'frog', 'racing-shooting', 'shooting-figures', 'construction', 'tetris-pentix', 'arkanoid']);
    expect(ids('seabattle')).toEqual(['sea-battle', 'tank', 'romeo-juliet', 'tetris-big', 'tetris', 'arkanoid']);
    expect(ids('tank168')).toEqual(['tank', 'frog', 'racing', 'racing-shooting', 'shooting-array', 'shooting-figures', 'construction', 'tetris', 'tetris-pentix']);
    expect(TOYS.clock99.games.find((game) => game.id === 'racing')?.label).toBe('автогонка'); // название своё у каждой консоли
    expect(TOYS.tank168.games.find((game) => game.id === 'tank')?.variants).toBe(5);
    expect(TOYS.tank168.games.find((game) => game.id === 'tetris')?.variants).toBe(51);
  });

  it('игры отмечены цифрами (у «Морского боя» — буквами A–F): 1…9, A…F', () => {
    expect(TOYS.tank168.games.map((_, index) => gameKey(TOYS.tank168, index)).join('')).toBe('123456789');
    expect(TOYS.seabattle.games.map((_, index) => gameKey(TOYS.seabattle, index)).join('')).toBe('ABCDEF');
    expect(TOYS.clock99.games.map((_, index) => gameKey(TOYS.clock99, index)).join('')).toBe('12345678910');
    expect(TOYS.seabattle.games.findIndex((game) => game.id === 'tetris')).toBe(4); // обычный тетрис — режим E
    expect(TOYS.tank168.games.findIndex((game) => game.id === 'tetris')).toBe(7); // тетрис — игра 8
  });

  it('меню «168 в 1 танк» — наблюдения владельца: танки — 5 вариантов, тетрис — 51; у «Морского боя» танки — 2, оба тетриса — по 20, арканоид — 32; игры без движка не запускаются', () => {
    expect(TOYS.tank168.games.filter((game) => game.variants !== undefined).map((game) => [game.id, game.variants])).toEqual([['tank', 5], ['tetris', 51]]);
    expect(TOYS.seabattle.games.filter((game) => game.variants !== undefined).map((game) => [game.id, game.variants])).toEqual([
      ['tank', 2],
      ['tetris-big', 20],
      ['tetris', 20],
      ['arkanoid', 32],
    ]);
    expect(TOYS.seabattle.games.find((game) => game.id === 'tank')?.modes).toEqual([0, 1]);
    expect(TOYS.seabattle.games.filter((game) => game.status === 'planned').map((game) => game.id)).toEqual([]);
    expect(TOYS.tank168.games.every((game) => game.status === 'ready')).toBe(true);
  });

  it('у каждой игры меню есть иллюстрация: цифры и буквы — по gameKey, консоли без меню иллюстраций не требуют', () => {
    for (const id of TOY_IDS) {
      if (!TOYS[id].menu) continue;
      for (const game of TOYS[id].games) expect(ILLUSTRATIONS[game.id], `${id}:${game.id}`).toBeDefined();
    }
  });

  it('3D-коробка выводится только у «168 в 1 танк»; у Crocodile Mario модель есть, но вывод выключен, у остальных упаковки нет', () => {
    expect(TOY_IDS.filter((id) => TOYS[id].pack)).toEqual(['tank168']);
    expect(TOYS.mario.pack).toBeNull();
    expect(TOYS.tank168.pack).toBe('tank168');
  });

  it('игры консолей пересекаются: тетрис — у всех, стрельба — у Mario и «Часов+99», гонки — у «Часов+99» и «168 в 1», танк — у «Морского боя» и «168 в 1»', () => {
    const owners = (game: (typeof GAME_IDS)[number]): string[] => TOY_IDS.filter((id) => TOYS[id].games.some((slot) => slot.id === game));
    expect(owners('tetris')).toEqual([...APOLLO_IDS, 'brickgame', 'e88', 'apollo-b0202']);
    expect(owners('shooting')).toEqual(['mario', 'clock99']);
    expect(owners('racing')).toEqual(['clock99', 'tank168']);
    expect(owners('tank')).toEqual(['clock99', 'seabattle', 'tank168']);
  });

  it('запускаются Mario (настоящая), тетрис-заглушка «Часов+99» и игры ядра «кирпичных» (по донору); остальные ещё не восстановлены', () => {
    const engines = GAME_IDS.filter((id) => GAMES[id].engine !== null);
    expect(engines).toEqual([...LIBRARY_IDS, 'mario', 'tetris', 'tetris-big', 'tetris-pentix', 'shooting', 'shooting-array', 'shooting-figures', 'racing', 'racing-shooting', 'tank', 'arkanoid', 'romeo-juliet', 'sea-battle', 'frog', 'construction']);
    expect(GAMES.mario.engine).toBe('mario');
    for (const id of engines.filter((game) => game !== 'mario')) expect(GAMES[id].engine, id).toBe('brick');
    for (const id of APOLLO_IDS) {
      const slot = TOYS[id].games.find((game) => game.id === TOYS[id].defaultGame);
      expect(slot?.status, id).toBe('ready');
      // Всё, у чего нет движка, помечено «ещё не восстановлена» (или заглушкой, если играет тетрис).
      for (const game of TOYS[id].games) {
        if (GAMES[game.id].engine === null) expect(game.status, `${id}:${game.id}`).toBe('planned');
        // Консоли с меню: игры ядра играют (`ready`), у тетриса «Часов+99» — заглушка.
        if (TOYS[id].menu && GAMES[game.id].engine === 'brick') expect(game.status, `${id}:${game.id}`).toBe('ready');
      }
    }
    expect(TOYS.tank168.gamesCount).toBe(168);
  });
});

it('Alibaba — экспонат без игр и движка, отдельно от Apollo', () => {
  expect(TOYS.alibaba).toMatchObject({family:'other', games:[], defaultGame:null, menu:false, shells:['white']});
  expect(engineOf(TOYS.alibaba)).toBe('exhibit');
  for (const id of APOLLO_IDS) expect(TOYS[id].family).toBe('apollo');
});

it('Mini Brick Game — отдельный красно-синий экспонат без игр', () => {
  expect(parseToy('?toy=minibrick')).toBe('minibrick');
  expect(TOYS.minibrick).toMatchObject({family:'other', games:[], defaultGame:null, menu:false, shells:['red']});
  expect(engineOf(TOYS.minibrick)).toBe('exhibit');
});
