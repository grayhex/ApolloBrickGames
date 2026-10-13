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

Пути — относительно `pack.json`. `version` попадает в replay. `sprites` — идентификаторы ресурсов героя,
снаряда и значка жизни (ядро о них не знает).

## Профиль экрана: `screen.json`

```json
{
  "schemaVersion": 1,
  "id": "demo-screen",
  "status": "demo",
  "viewport": { "columns": 13, "rows": 7 },
  "hud": { "rows": 1, "position": "top" },
  "cellPx": 8
}
```

`viewport` — видимое поле в клетках; `hud` — отдельная область вне поля; `cellPx` — размер клетки в логических
пикселях. **Все размеры временные до подтверждения.** Масштаб до физических пикселей на правила не влияет.

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

Изменение значений не требует правок кода. Особые механики — отдельными обработчиками (`core/behaviors.ts`).

## Каталог ресурсов: `assets.json`

Ресурсы адресуются стабильными идентификаторами и описаны **отдельно от геометрии и коллизий**.

```json
{
  "schemaVersion": 1,
  "id": "demo-assets",
  "status": "demo",
  "assets": {
    "tile.block": { "kind": "placeholder", "glyph": "block" },
    "hero": {
      "kind": "image",
      "src": "img/hero.png",
      "frameWidth": 8, "frameHeight": 8,
      "frames": 4, "frameTicks": 3,
      "fallbackGlyph": "hero"
    }
  }
}
```

`placeholder` рисуется встроенной битовой картой (`render/glyphs.ts`). `image` — PNG/SVG, кадры лежат
в одну горизонтальную полосу; `src` считается от файла каталога; если файл не загрузился, рисуется `fallbackGlyph`
и выводится предупреждение. Замена заглушки на картинку — правка этого файла: ядро, ввод и механика не меняются.

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

Размер карты, размер окна и клетки задаются независимо: уровень шире экрана прокручивается камерой рендера,
правила от этого не меняются.

## Как добавить уровень

1. Положить `levels/мой-уровень.json` рядом с остальными.
2. Добавить путь в `pack.json → levels` (и, если нужно, `transitions` в соседних уровнях).
3. `npm test` — валидатор проверит ссылки и размеры; для демо-пакета полное прохождение закреплено replay-fixture.
