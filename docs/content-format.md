# Формат данных проекта

Версионированный формат описывает экран, правила, ресурсы и уровни **этого движка**. Это не формат памяти Apollo.
Все файлы — статические JSON; кода внутри нет. Поддерживаемая версия схемы: `schemaVersion: 1`.

Любой документ имеет `status`: `demo` (временное значение движка) или `confirmed` (подтверждено на устройстве
и записано в [reference-status.md](reference-status.md)).

Проверка при загрузке (`src/content/validate.ts`) собирает **все** ошибки сразу, указывает путь до поля и
не создаёт частично собранную сцену:

```text
Ошибка данных в «levels/demo-1.json»:
  • $.rows[1]: длина 4, а width = 5
  • $.rows[0][2]: символ «?» не описан в legend
  • $.objects[0].type: неизвестный тип «dragon», доступны: target, patroller, hazard, finish
```

## Пакет: `pack.json`

```json
{
  "schemaVersion": 1,
  "id": "demo-pack",
  "title": "Технический демо-пакет (не оригинальный контент)",
  "status": "demo",
  "version": 1,
  "screen": "screen.json",
  "rules": "rules.json",
  "assets": "assets.json",
  "levels": ["levels/demo-1.json", "levels/demo-2.json"],
  "firstLevel": "demo-1",
  "sprites": { "hero": "hero", "projectile": "projectile", "life": "life" }
}
```

Пути — относительно `pack.json`. `version` попадает в replay. `sprites` — идентификаторы ресурсов героя, значка жизни
и (необязательно) снаряда; ядро о них не знает. Пакетов два: `public/content/demo/` (техническое демо) и
`public/content/room/` (однокомнатное демо).

## Профиль экрана: `screen.json`

Пример — экран однокомнатного демо (раскладка снята с эталонных экранов владельца,
`docs/references/raw/screens`):

```json
{
  "schemaVersion": 1,
  "id": "room-screen",
  "status": "demo",
  "viewport": {
    "columns": 13,
    "rows": 6
  },
  "cell": {
    "width": 128,
    "height": 112
  },
  "margin": {
    "left": 32,
    "right": 32,
    "top": 154,
    "bottom": 38
  },
  "colors": {
    "background": "#adb38c",
    "ink": "#303a30"
  },
  "smoothing": true,
  "ghost": {
    "asset": "cell.ghost",
    "enabled": true
  },
  "hud": {
    "kind": "lcd",
    "fixed": {
      "lives": 3,
      "label": "0-00",
      "score": 0
    },
    "lives": {
      "asset": "hud.life",
      "x": 34,
      "y": 40,
      "width": 44,
      "height": 44,
      "pitch": 50
    },
    "label": {
      "x": 426,
      "y": 27,
      "pitch": 69,
      "slots": 4
    },
    "score": {
      "x": 1311,
      "y": 27,
      "pitch": 77,
      "slots": 5
    },
    "font": {
      "width": 58,
      "height": 94,
      "glyphs": {
        "0": "hud.digit.0",
        "1": "hud.digit.1",
        "2": "hud.digit.2",
        "3": "hud.digit.3",
        "4": "hud.digit.4",
        "5": "hud.digit.5",
        "6": "hud.digit.6",
        "7": "hud.digit.7",
        "8": "hud.digit.8",
        "9": "hud.digit.9",
        "-": "hud.digit.minus",
        " ": "hud.digit.blank"
      },
      "ghost": "hud.digit.ghost"
    }
  }
}
```

- `viewport` — видимое поле в клетках; `cell` — размер клетки в логических пикселях (**не обязательно квадрат**);
  `margin` — поля вокруг поля игры (HUD лежит в верхнем или нижнем поле). Логический холст = поля + `columns × cell.width`
  на `rows × cell.height`; масштаб до физических пикселей на правила не влияет. **Все размеры неподтверждены.**
- `colors` — цвета LCD: подложка и активные сегменты (`#rrggbb`). SVG-ресурсы рисуются цветом `ink`.
- `smoothing` — сглаживание при масштабировании: нужно растровой графике, у пиксельных заглушек выключено.
- `ghost` — необязательный слой неактивных сегментов: ресурс рисуется под каждой клеткой; `enabled` — включён ли по умолчанию
  (пользователь может переключить, выбор сохраняется).
- `hud` — одно из двух:
  - `{"kind": "builtin", "position": "top"}` — встроенный пиксельный шрифт 3 × 5 в полосе `margin.top` (или `bottom`);
    так устроено техническое демо;
  - `{"kind": "lcd", …}` — спрайты в явных координатах: `lives` (значок, размер, шаг), `label` и `score`
    (первая позиция, шаг, число позиций) и `font` (размер символа на экране, `glyphs` — символ → ресурс, `ghost` — выключенные сегменты цифры).
  - `fixed` (в обоих видах) — **фиксированные тестовые значения** индикаторов; они ничего не означают. Без него HUD показывает состояние игры.

## Правила и тайминги: `rules.json`

```json
{
  "schemaVersion": 1,
  "id": "demo-rules",
  "status": "demo",
  "version": 1,
  "params": {
    "tickRateHz": 20,
    "move": { "repeatDelayTicks": 4, "repeatIntervalTicks": 3 },
    "jump": { "triggers": ["jump"], "table": [-1, -1, -1, 0, 0], "stepTicks": 2 },
    "fall": { "periodTicks": 2 },
    "fire": {
      "intervalTicks": 4, "holdRepeat": true, "maxProjectiles": 2,
      "projectile": { "cellsPerStep": 2, "stepTicks": 1, "maxRangeCells": 10 }
    },
    "lives": 3,
    "timerLimitTicks": 1800,
    "deathDelayTicks": 20
  }
}
```

- `tickRateHz` — тактов в секунду; все остальные времена — в тактах.
- `move` — шаг на клетку при нажатии сразу, затем повтор: пауза `repeatDelayTicks`, интервал `repeatIntervalTicks`.
- `jump.table` — смещение по вертикали на фазу (`-` вверх), каждая фаза длится `stepTicks`; `triggers` — какие
  действия запускают прыжок (так задаётся связь `up`/`jump`).
- `fall.periodTicks` — тактов на клетку падения; `fire` — интервал, повтор при удержании, лимит снарядов, скорость
  в клетках за шаг, дальность; `timerLimitTicks: 0` — таймер выключен.

`"fire": null` — стрельбы нет вовсе (так в однокомнатном демо: кнопка огня ничего не делает).
Изменение значений не требует правок кода. Особые механики — отдельными обработчиками (`core/behaviors.ts`).

## Каталог ресурсов: `assets.json`

Ресурсы адресуются стабильными идентификаторами и описаны **отдельно от геометрии и коллизий**.

```json
{
  "schemaVersion": 1,
  "id": "room-assets",
  "status": "demo",
  "assets": {
    "tile.block": { "kind": "placeholder", "glyph": "block" },
    "hero": {
      "kind": "image",
      "src": "../../graphics/lcd/lcd_atlas.png",
      "frameWidth": 128, "frameHeight": 112,
      "origin": { "x": 4, "y": 4 },
      "frames": 1, "frameTicks": 1,
      "fallbackGlyph": "hero",
      "mirrorWhenLeft": false,
      "provenance": {
        "status": "blocked",
        "sources": ["ф4: фигурка в воздухе"],
        "note": "Силуэт — наброск: нет крупного резкого кадра.",
        "anchor": "cell-bottom-center"
      }
    }
  }
}
```

- `placeholder` рисуется встроенной битовой картой (`render/glyphs.ts`).
- `image` — PNG или SVG; `src` считается от файла каталога. Ресурс — прямоугольник `frameWidth × frameHeight`, левый верхний
  угол первого кадра — `origin` (так задаётся ресурс внутри **атласа**); дополнительные кадры лежат правее в одну полосу. В SVG слово
  `currentColor` заменяется цветом `colors.ink` профиля экрана — единый источник цвета. Если файл не загрузился,
  рисуется `fallbackGlyph` и выводится предупреждение.
- `mirrorWhenLeft` — зеркалить при взгляде влево. По умолчанию **нет**: зеркало не считается автоматически верным
  для второго направления. Встроенные заглушки зеркалятся.
- `provenance` — откуда ресурс и насколько ему можно верить: `status` (`draft` — набросок, `confirmed` — принят владельцем,
  `blocked` — не хватает референсов), `sources`, `note` (что неизвестно), `anchor` (точка привязки). Контрольный лист `#/sheet` строится из этих полей.

Замена заглушки на картинку — правка этого файла: ядро, ввод и механика не меняются.

## Уровень: `levels/*.json`

```json
{
  "schemaVersion": 1,
  "id": "mini",
  "status": "demo",
  "hudLabel": "D-1",
  "width": 8,
  "height": 4,
  "legend": {
    ".": { "collision": "empty" },
    "o": { "collision": "empty", "asset": "tile.deco" },
    "#": { "collision": "solid", "asset": "tile.block" }
  },
  "rows": [
    "........",
    "...oo...",
    "........",
    "########"
  ],
  "start": { "x": 1, "y": 2 },
  "objects": [
    { "id": "t1", "type": "target", "x": 5, "y": 2, "asset": "obj.target", "params": { "hp": 1, "score": 100 } },
    { "id": "h1", "type": "hazard", "x": 3, "y": 2, "w": 2, "h": 1, "asset": "obj.hazard" },
    { "id": "f1", "type": "finish", "x": 7, "y": 2, "asset": "obj.finish" }
  ],
  "transitions": [{ "from": "f1", "to": null }]
}
```

- `rows` — статический слой, ровно `height` строк по `width` символов; символ задаёт `legend`
  (один символ BMP). **Проходимость — только `collision`**; `asset` — только рисунок (`o` выше рисуется, но не мешает).
- `start` — клетка героя, не в занятой клетке. `y` растёт вниз.
- `objects` — `type` выбирает поведение (`target`, `patroller`, `hazard`, `finish` в демо-профиле), `asset` — рисунок,
  `w`×`h` — область (по умолчанию 1×1), `params` — параметры типа (диапазоны проверяются).
- `transitions` — `from` указывает объект-триггер, `to` — id следующего уровня или `null` (игра пройдена).
- `hudLabel` — подпись в HUD (A–Z, 0–9, пробел, дефис, до 8 знаков). Формат подписи оригинала не установлен.
- `note` — необязательное пояснение (происхождение, допущения; например «Искусственная тестовая карта; не оригинальный уровень»).
  Метаданные: в симуляции не участвуют.

Размер карты, размер окна и клетки задаются независимо: уровень шире экрана прокручивается камерой рендера,
правила от этого не меняются.

## Как добавить уровень

1. Положить `levels/мой-уровень.json` рядом с остальными.
2. Добавить путь в `pack.json → levels` (и, если нужно, `transitions` в соседних уровнях).
3. `npm test` — валидатор проверит ссылки и размеры; для демо-пакета полное прохождение закреплено replay-fixture.
