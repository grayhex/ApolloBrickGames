import { createContext, DEMO_BEHAVIORS, Game, makeFrame, validationEnv } from '../core';
import { AssetStore, tintedSvgDataUrl } from '../render/assets';
import { centerCamera } from '../render/camera';
import { GLYPH_NAMES } from '../render/glyphs';
import { Renderer } from '../render/renderer';
import { h } from './dom';
import { loadContentPack } from './loadContent';
import { GAME_ROUTES } from './routes';

const STATUS_TEXT = { draft: 'ЧЕРНОВИК', blocked: 'БЛОКЕР: нет референсов', confirmed: 'ПОДТВЕРЖДЕНО' } as const;

/**
 * Контрольный лист для согласования с владельцем: полноэкранный рендер тем же рендерером, что и игра,
 * и таблица «референс → восстановленный элемент» с источниками и замечаниями из каталога ресурсов.
 * Фотографии в репозитории не хранятся, поэтому колонка «Референс» описывает источник словами.
 */
export async function startSheet(): Promise<void> {
  document.body.classList.add('route-sheet');
  const badge = document.getElementById('badge');
  const subtitle = document.getElementById('subtitle');
  const root = document.getElementById('sheet');
  const footer = document.getElementById('route-link') as HTMLAnchorElement | null;
  if (!root) throw new Error('В index.html нет элемента #sheet');
  if (badge) badge.textContent = 'ЧЕРНОВИК — лист для согласования';
  if (subtitle) subtitle.textContent = 'Графика комнаты восстановлена по неполным референсам и ещё не принята владельцем.';
  if (footer) {
    footer.href = '#/';
    footer.textContent = 'К игре';
  }
  root.hidden = false;

  const manifestUrl = new URL(`${import.meta.env.BASE_URL}${GAME_ROUTES.room.manifest}`, window.location.href).href;
  const { pack, assetsUrl } = await loadContentPack(manifestUrl, validationEnv(DEMO_BEHAVIORS, GLYPH_NAMES));
  const { colors } = pack.screen;

  const assets = new AssetStore(pack.assets, assetsUrl, colors.ink);
  const warnings = await assets.load();

  // ── Полноэкранный рендер: тем же Renderer и теми же данными, что в игре ──
  const ctx = createContext(pack);
  const render = (title: string, caption: string, prepare: (game: Game) => void): HTMLElement => {
    const game = new Game(ctx);
    prepare(game);
    const level = ctx.levels.get(game.state.levelId)?.def;
    if (!level) throw new Error('нет уровня для контрольного листа');
    const canvas = h('canvas');
    const renderer = new Renderer(canvas, pack.screen, assets);
    renderer.resize(460, 300, window.devicePixelRatio);
    const camera = centerCamera(game.state.hero, {
      columns: pack.screen.viewport.columns,
      rows: pack.screen.viewport.rows,
      levelWidth: level.width,
      levelHeight: level.height,
    });
    renderer.render({ state: game.state, level, camera, sprites: pack.manifest.sprites, debug: { grid: false, collisions: false } });
    return h('figure', {}, canvas, h('figcaption', {}, `${title}. ${caption}`));
  };
  const jump = (game: Game): void => {
    game.step(makeFrame({ pressed: ['start'] }));
    game.step(makeFrame({ pressed: ['jump'], held: ['jump'] }));
    for (let i = 0; i < 3; i++) game.step(makeFrame({}));
  };

  // ── Таблица «референс → восстановленный элемент» ─────────────────────────
  const rows: HTMLElement[] = [];
  for (const [id, def] of Object.entries(pack.assets.assets)) {
    if (def.kind !== 'image') continue;
    const dataUrl = await tintedSvgDataUrl(new URL(def.src, assetsUrl).href, colors.ink);
    const scale = Math.max(2, Math.floor(160 / def.frameHeight));
    const image = dataUrl
      ? h('img', {
          src: dataUrl,
          alt: `Восстановленный элемент ${id}`,
          width: String(def.frameWidth * def.frames * scale),
          height: String(def.frameHeight * scale),
        })
      : h('span', {}, 'файл не загружен');
    const provenance = def.provenance;
    rows.push(
      h(
        'tr',
        {},
        h('th', { scope: 'row' }, h('code', {}, id), h('p', {}, `${def.frameWidth}×${def.frameHeight}, кадров: ${def.frames}`)),
        h(
          'td',
          {},
          ...(provenance?.sources.map((source) => h('p', {}, source)) ?? [h('p', {}, 'источник не указан')]),
          h('p', {}, 'Файл-референс: не добавлен в docs/references/crops/ (ожидается от владельца).'),
        ),
        h('td', {}, h('span', { class: 'sheet__swatch', style: `background:${colors.background}` }, image)),
        h(
          'td',
          {},
          h('span', { class: `sheet__status sheet__status--${provenance?.status ?? 'draft'}` }, STATUS_TEXT[provenance?.status ?? 'draft']),
          h('p', {}, provenance?.note ?? ''),
          h('p', {}, `Привязка: ${provenance?.anchor ?? 'cell-top-left'}`),
        ),
      ),
    );
  }

  root.replaceChildren(
    h('h2', {}, 'Контрольный лист ресурсов (комната demo-room)'),
    h(
      'p',
      {},
      'Статусы: ЧЕРНОВИК — набросок по неполным референсам, БЛОКЕР — для элемента нет достаточных референсов (силуэт условный), ПОДТВЕРЖДЕНО — сверено и принято владельцем. Подтверждённых элементов пока нет.',
    ),
    h(
      'p',
      {},
      `Профиль LCD (оценка на глаз по фото, не калибровка): подложка ${colors.background}, активные сегменты ${colors.ink}; сетка ${pack.screen.viewport.columns}×${pack.screen.viewport.rows} клеток + строка HUD — неподтверждённая оценка.`,
    ),
    ...(warnings.length > 0 ? [h('p', {}, warnings.join(' '))] : []),
    h(
      'div',
      { class: 'sheet__renders' },
      render('Полноэкранный рендер', 'Старт; значения HUD фиксированы (0-00, 00000, три значка) и ничего не означают.', (game) => game.step(makeFrame({ pressed: ['start'] }))),
      render('Герой в прыжке', 'Тот же силуэт: отдельный спрайт прыжка на референсах не виден.', jump),
    ),
    h(
      'table',
      {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Ресурс'), h('th', {}, 'Референс'), h('th', {}, 'Восстановлено'), h('th', {}, 'Статус и замечания'))),
      h('tbody', {}, ...rows),
    ),
  );
}
