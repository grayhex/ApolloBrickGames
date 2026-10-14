import { screenSize, type AssetCatalog, type HudFixed, type LevelDef, type ScreenProfile } from '../content/schema';
import { validateLevel } from '../content/validate';
import { createContext, DEMO_BEHAVIORS, Game, makeFrame, validationEnv } from '../core';
import { AssetStore } from '../render/assets';
import { centerCamera } from '../render/camera';
import { GLYPH_NAMES } from '../render/glyphs';
import { Renderer } from '../render/renderer';
import { h } from './dom';
import { fetchJson, loadContentPack } from './loadContent';
import { GAME_ROUTES } from './routes';

const STATUS_TEXT = { draft: 'ЧЕРНОВИК', blocked: 'БЛОКЕР: нет референсов', confirmed: 'ПОДТВЕРЖДЕНО' } as const;

interface SceneEntry {
  level: string;
  /** Есть ли на фотографии фигурка. */
  hero: boolean;
  hud: HudFixed;
  compare: string;
}

/**
 * Контрольный лист для согласования с владельцем:
 *  1. сцены с фотографий воспроизводятся тем же рендерером, что и игра, в масштабе 1:1
 *     (автотест сравнивает их с эталонными экранами владельца);
 *  2. таблица «ресурс → источник → восстановленный элемент → статус».
 */
export async function startSheet(): Promise<void> {
  document.body.classList.add('route-sheet');
  const badge = document.getElementById('badge');
  const subtitle = document.getElementById('subtitle');
  const root = document.getElementById('sheet');
  const footer = document.getElementById('route-link') as HTMLAnchorElement | null;
  if (!root) throw new Error('В index.html нет элемента #sheet');
  if (badge) badge.textContent = 'ЧЕРНОВИК — лист для согласования';
  if (subtitle) subtitle.textContent = 'Графика комнаты построена по реконструкции владельца (две фотографии) и ещё не принята окончательно.';
  if (footer) {
    footer.href = '#/';
    footer.textContent = 'К игре';
  }
  root.hidden = false;

  const base = `${import.meta.env.BASE_URL}${GAME_ROUTES.room.manifest}`;
  const manifestUrl = new URL(base, window.location.href).href;
  const { pack, assetsUrl } = await loadContentPack(manifestUrl, validationEnv(DEMO_BEHAVIORS, GLYPH_NAMES));
  const { colors } = pack.screen;
  const assets = new AssetStore(pack.assets, assetsUrl, colors.ink);
  const warnings = await assets.load();

  // ── 1. Сцены с фотографий ────────────────────────────────────────────────
  const referenceDir = new URL('reference/', manifestUrl).href;
  const scenesFile = (await fetchJson(new URL('scenes.json', referenceDir).href)) as { scenes: SceneEntry[] };
  const env = validationEnv(DEMO_BEHAVIORS, GLYPH_NAMES);
  const figures: HTMLElement[] = [];
  for (const [index, scene] of scenesFile.scenes.entries()) {
    const level = validateLevel(await fetchJson(new URL(scene.level, referenceDir).href), pack.assets, env, scene.level);
    figures.push(renderScene(index + 1, level, scene, pack.screen, pack, assets));
  }

  // ── 2. Таблица ресурсов ──────────────────────────────────────────────────
  const rows = Object.entries(pack.assets.assets).flatMap(([id, def]) => {
    if (def.kind !== 'image') return [];
    const canvas = h('canvas', { width: String(def.frameWidth), height: String(def.frameHeight), class: 'sheet__asset', 'data-asset': id });
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = colors.background;
      ctx.fillRect(0, 0, def.frameWidth, def.frameHeight);
      assets.drawFrame(ctx, id, 0, 0, 0);
    }
    canvas.style.width = `${Math.min(def.frameWidth, 220)}px`;
    const provenance = def.provenance;
    return [
      h(
        'tr',
        {},
        h('th', { scope: 'row' }, h('code', {}, id), h('p', {}, `${def.frameWidth}×${def.frameHeight}, атлас (${def.origin.x}, ${def.origin.y})`)),
        h('td', {}, ...(provenance?.sources.map((source) => h('p', {}, source)) ?? [h('p', {}, 'источник не указан')])),
        h('td', {}, canvas),
        h(
          'td',
          {},
          h('span', { class: `sheet__status sheet__status--${provenance?.status ?? 'draft'}` }, STATUS_TEXT[provenance?.status ?? 'draft']),
          h('p', {}, provenance?.note ?? ''),
          h('p', {}, `Привязка: ${provenance?.anchor ?? '—'}`),
        ),
      ),
    ];
  });

  root.replaceChildren(
    h('h2', {}, 'Контрольный лист ресурсов'),
    h(
      'p',
      {},
      'Статусы: ЧЕРНОВИК — реконструкция по двум фотографиям, контуры приблизительные; БЛОКЕР — для элемента нет достаточных референсов; ПОДТВЕРЖДЕНО — сверено и принято владельцем (пока ничего).',
    ),
    h(
      'p',
      {},
      `Профиль LCD из комплекта владельца: подложка ${colors.background}, активные сегменты ${colors.ink}, ячейка ${pack.screen.cell.width}×${pack.screen.cell.height}, ${pack.screen.viewport.columns} столбцов; число строк поля по фото 6 и 8 — не установлено.`,
    ),
    ...(warnings.length > 0 ? [h('p', {}, warnings.join(' '))] : []),
    h('h2', {}, 'Сцены с фотографий: рендер игры'),
    h(
      'p',
      {},
      'Те же слои, что в игре: подложка, неактивные сегменты, препятствия, фигурка, HUD. Значения HUD (1-09, 3-01 и т. д.) — буквальные подписи с фотографий, не структура уровней. Рендер 1:1 сверяется автотестом с эталонными экранами владельца (tests/fixtures/reference).',
    ),
    h('div', { class: 'sheet__scenes' }, ...figures),
    h('h2', {}, 'Ресурсы'),
    h(
      'table',
      {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Ресурс'), h('th', {}, 'Источник'), h('th', {}, 'Восстановлено'), h('th', {}, 'Статус и замечания'))),
      h('tbody', {}, ...rows),
    ),
  );
}

/** Одна сцена с фотографии: Canvas с собственным профилем (число строк = высота композиции) в масштабе 1:1. */
function renderScene(
  number: number,
  level: LevelDef,
  scene: SceneEntry,
  screen: ScreenProfile,
  pack: { manifest: Parameters<typeof createContext>[0]['manifest']; rules: Parameters<typeof createContext>[0]['rules']; assets: AssetCatalog },
  assets: AssetStore,
): HTMLElement {
  const profile: ScreenProfile = { ...screen, viewport: { ...screen.viewport, rows: level.height } };
  const ctx = createContext({ manifest: { ...pack.manifest, firstLevel: level.id }, rules: pack.rules, levels: [level] });
  const game = new Game(ctx);
  game.step(makeFrame({})); // состояние ready; HUD берётся из подмены ниже

  const canvas = h('canvas', { id: `ref-scene-${number}`, class: 'sheet__scene' });
  const renderer = new Renderer(canvas, profile, assets);
  renderer.setGhost(true);
  const size = screenSize(profile);
  renderer.resize(size.width, size.height, 1); // масштаб ровно 1:1 — для сверки с эталоном
  renderer.render({
    state: game.state,
    level,
    camera: centerCamera({ x: 0, y: 0 }, { columns: level.width, rows: level.height, levelWidth: level.width, levelHeight: level.height }),
    sprites: { hero: pack.manifest.sprites.hero, projectile: null, life: pack.manifest.sprites.life },
    debug: { grid: false, collisions: false },
    hudOverride: scene.hud,
    hideHero: !scene.hero,
  });
  canvas.style.width = '100%';
  canvas.style.height = 'auto';
  return h(
    'figure',
    {},
    canvas,
    h('figcaption', {}, `Сцена ${number}: ${level.width}×${level.height}, HUD ${scene.hud.label} / ${String(scene.hud.score).padStart(5, '0')} / жизней ${scene.hud.lives}. Эталон: ${scene.compare}`),
  );
}
