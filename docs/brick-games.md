# Игры «168 в 1 танк»: ядро «кирпичных» игр

Игрушка 4 («168 в 1 танк») играет не одним тетрисом, а набором игр из меню. Исходные данные — наблюдения владельца (пункты меню, число вариантов у танков и тетриса) и карта источников
[apollo-tank168-research](https://github.com/grayhex/CrocodileMario) (донор правил — открытый симулятор [n0Live/BrickGame](https://github.com/n0Live/BrickGame), MIT).
Точного дампа ROM именно этой модели нет, поэтому **правила игр — правила донора (или допущения, помеченные в каждой игре), а не подтверждённые правила Apollo**.

## Меню (наблюдения владельца)

| № | Игра | Вариантов на устройстве | Донор правил | Модуль |
| --- | --- | --- | --- | --- |
| 1 | Танки | 5 | `TanksGame` (8 вариантов) | `games/tanks.ts` |
| 2 | Лягушка (Frogger) | не установлено | `FroggerGame` (32) | `games/frogger.ts` |
| 3 | Гонки | не установлено | `RacingGame` (4) | `games/racing.ts` |
| 4 | Гонки со стрельбой | не установлено | `RacingGame` + пули, описание MT1997 | `games/racing.ts` |
| 5 | Стрельба по массиву и точкам-врагам | не установлено | `InvadersGame` | `games/invaders.ts` |
| 6 | Стрельба по фигурам, достройка фигур | не установлено | `GunGame`/`GameWithGun` (частично), описание MT1997 | `games/shapes.ts` |
| 7 | Стройка | не установлено | `GunGame` (режим создания) | `games/construction.ts` |
| 8 | Тетрис | 51 | `TetrisGameI` и семейство | `games/tetris.ts` |
| 9 | Усложнённый тетрис (Pentix) | не установлено | `PentixGameQ` и семейство | `games/pentix.ts` |

Число 168 из названия **не** используется для вычисления вариантов. Если на устройстве вариантов больше, чем реализовано, в `BrickGameDef.declaredModes` стоит устройство, а в `modes` — реализованные.

## Слои

- `src/brick` — чистое ядро (без DOM, часов и `Math.random`; границу проверяют `tsconfig.core.json` и ESLint): `types.ts` (интерфейс `BrickGame`, ввод, события), `base.ts` (`BrickBase`: фазы, счёт, жизни,
  сценки, взрыв, очистка поля, конец игры), `grid.ts` (спрайты и ряды), `rng.ts`, `timing.ts` (миллисекунды → такты, `Countdown`, `Repeater`), `games/*` (игры), `console.ts` (меню: номер игры, вариант, иллюстрация).
- `src/render/tetrisScreen.ts` рисует любую такую игру: матрица 10 × 20 (0 — погашена, 1 — горит, 2 — мигает), превью 4 × 4, счёт, скорость, уровень, чашка паузы.
- `src/app/tetrisApp.ts` — оболочка: питание, звук, кнопки корпуса, меню консоли.

## Как устроена игра

```ts
class MyGame extends BrickBase {
  readonly id = 'tank';
  constructor(options: BrickGameOptions) { super(options, MODES.length); /* поля */ this.init(); }
  protected reset(): void { /* новая партия: поле, объекты, setLives(4), таймеры */ }
  protected update(input: BrickInput): void { /* один такт; события — this.emit(...) */ }
  protected draw(): Uint8Array { /* матрица 200 клеток */ }
  protected drawPreview(): Uint8Array | null { /* превью 4×4 или null (по умолчанию — индикатор жизней) */ }
}
export const myDef: BrickGameDef = { id: 'tank', declaredModes: 5, modes: MODES, create: (options) => new MyGame(options) };
```

- Время — такты, 60 в секунду. Миллисекунды донора переводятся `msToTicks`; «настоящая» скорость по формуле донора — `genuineTicks(speed, msFirst, msTenth)`.
- Кнопки: `left`, `right`, `up`, `down`, `rotate` (большая кнопка, в стрелялках — огонь), `fire` (клавиша «огонь» на клавиатуре; в тетрисе — бросок, в остальных играх — как `rotate`). Автоповтор зажатой кнопки — `Repeater`.
- Скорость и уровень — 1..10 (на экране консоли показывается число минус один). `nextLevel()` повторяет донорскую победу в уровне; жизни — `setLives`, добавочная жизнь — `scoresToExtraLife`.
- Взрыв и очистка поля — `animateKaboom`, `animateClear` (как у донора); любая пауза «без ввода» — `cutscene`.
- Случайность — только `this.rng` (seeded). Одинаковое зерно и одинаковые вводы — одинаковые состояния.
- В каждой игре — список вариантов `modes` (название на двух языках и пометка, что в варианте донорское, а что — допущение).

## Лицензия донора

Правила и данные игр восстановлены по [n0Live/BrickGame](https://github.com/n0Live/BrickGame), © 2017 Egor Krasnopolin, лицензия MIT. Код на TypeScript написан заново (потоки, `sleep()`, `java.util.Random` не переносились),
но правила, таблицы и последовательности — оттуда; текст лицензии — в [THIRD_PARTY.md](THIRD_PARTY.md).
