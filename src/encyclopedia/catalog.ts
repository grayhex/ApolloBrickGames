import { LIBRARY_IDS } from '../games/library';
import { GAMES, type GameId } from '../games/catalog';
import { BRICK_GUIDES } from '../brick/guides';
import { gt, type GameGuideData, type GuideText } from '../brick/guide';

export type Family = 'blocks' | 'arcade' | 'puzzle' | 'adventure';
export type SourceKind = 'wiki' | 'code' | 'rom' | 'video' | 'research' | 'owner';
export interface EvidenceSource { kind: SourceKind; title: string; url: string; note: GuideText }
export interface EncyclopediaEntry { id: GameId; family: Family; accuracy: 0 | 30 | 60 | 90 | 100; sources: EvidenceSource[]; scope: GuideText }
const repo = 'https://github.com/grayhex/ApolloBrickGames/blob/main/';
const wiki: EvidenceSource = { kind:'wiki', title:'Retro Consoles Wiki · Brick Game', url:'https://retroconsoles.fandom.com/wiki/Brick_Game#Games', note:gt('Описание основных правил и перечень вариантов устройств.', 'Descriptions of the core rules and device variants.') };
const research = (path: string, note: GuideText): EvidenceSource => ({kind:'research',title:`Apollo Brick Games · ${path.split('/').at(-1)}`,url:repo+path,note});
const rom: EvidenceSource = { kind:'rom', title:'BrickEmuPy · Brick Game ROMs', url:'https://github.com/azya52/BrickEmuPy/tree/376cca92c6d000ffd6046e5491f2a1c3d1a5eab0',note:gt('Машинный код оригинальных устройств; объём сверки указан отдельно для каждой игры.', 'Original device machine code; the verification scope is specified for each game.') };
const donorFiles: Partial<Record<GameId,string>> = {tetris:'TetrisGameI','tetris-big':'TetrisGameI','tetris-pentix':'PentixGameQ',shooting:'InvadersGame','shooting-array':'GunGame','shooting-figures':'GunGame',racing:'RacingGame','racing-shooting':'RacingGame',tank:'TanksGame',arkanoid:'ArkanoidGame',frog:'FroggerGame',construction:'GunGame'};
const blocks = new Set<GameId>(['tetris','tetris-big','tetris-pentix','tetris-flicker','tetris-shooting','columns','columns-flicker','dr-mario','construction','matching-blocks','romeo-juliet']);
const puzzles = new Set<GameId>(['maze','jigsaw','sokoban','lights-out','peg-solitaire','reversi','2048','fill-connect','simon','dice','quarth']);
export const familyFor = (id: GameId): Family => id === 'mario' || id === 'clock' ? 'adventure' : blocks.has(id) ? 'blocks' : puzzles.has(id) ? 'puzzle' : 'arcade';

export const ENTRIES: EncyclopediaEntry[] = Object.values(GAMES).map(game => {
  const id=game.id, sources: EvidenceSource[] = [wiki];
  let accuracy: EncyclopediaEntry['accuracy']=30;
  let scope=gt('Правила восстановлены по словесному описанию. Графика, точные тайминги, очки и карты — реконструкция проекта.', 'Rules reconstructed from a written description. Graphics, exact timing, scoring and maps are project reconstructions.');
  const donor=donorFiles[id];
  if(donor){
    accuracy=60;
    sources.push({kind:'code',title:`n0Live / BrickGame · ${donor}`,url:`https://github.com/n0Live/BrickGame/blob/master/src/com/kry/brickgame/games/${donor}.java`,note:gt('Исследование открытого симулятора (MIT): игровые правила и структура событий.', 'Research of the open simulator (MIT): game rules and event structure.')});
    scope=gt('Правила исследованы по коду симулятора и материалам устройств. Все параметры оригинальной прошивки пока не сверены.', 'Rules researched using simulator code and device material. Not all original firmware parameters have been verified.');
  }
  if(['tetris','tetris-big','tetris-pentix','tetris-flicker'].includes(id)){
    accuracy=id==='tetris'?100:90;
    sources.push(rom,research('docs/brick/rom-review.md',gt('Проверены интервалы падения, очки за ряды, пороги скорости, удержание и команды звука B0202.', 'Verified B0202 gravity intervals, line scores, speed thresholds, repeat input and sound commands.')));
    scope=gt('Общие правила Tetris сверены по дампу, коду и наблюдениям. Специальные варианты, наборы фигур и отдельные анимации подтверждены не полностью.', 'Shared Tetris rules were cross-checked against a ROM, code and observations. Special variants, piece sets and some animations are not fully verified.');
  }else if(['racing','racing-shooting','shooting','shooting-array','construction','space-invaders'].includes(id)){
    sources.push(rom,research('docs/brick/rom-review.md',gt('Найдены аналоги или отдельные наблюдения. Это не полная проверка правил данной реализации.', 'Related games or individual observations were found. This is not a complete verification of this implementation.')));
    // Finding a similarly named game in a ROM is not verification of our gameplay.
  }
  if(id==='snake'||id==='dice'||id==='frog'||id==='honeybee'){
    accuracy=90;
    sources.push(rom,research('docs/brick/rom-arcade.md',gt('Воспроизводимые трассы всех десяти скоростей змейки, таблица всех 1296 бросков Dice, расписание Frog, кадры Beetle и команды звука E88.', 'Reproducible traces of all ten Snake speeds, all 1296 Dice throws, the Frog schedule, Beetle frames and E88 sound commands.')));
    scope=id==='snake'
      ? gt('E-23 №93 / E88 №5: старт снизу, мгновенный поворот, разворот головы и хвоста, десять скоростей и звук по ROM. Рамка, генератор и полный цикл прогрессии остаются адаптацией.', 'E-23 #93 / E88 #5: bottom start, immediate steering, head/tail reversal, ten speeds and ROM sound. Frame, the random generator and the full progression cycle remain adapted.')
      : id==='dice'
        ? gt('Apollo B0202 E02: четыре кости, пары, перебросы, игровой банк, ставки и выплаты по ROM. Проверены все 1296 бросков. ГСЧ и пауза результата адаптированы; рейтинг — максимум банка за партию. E01/E03 не перенесены.', 'Apollo B0202 E02: four dice, pairs, rethrows, game bank, wagers and ROM payouts. All 1296 throws were checked. RNG and the result hold are adapted; ranking uses the party peak bank. E01/E03 are not ported.')
        : id==='honeybee'
          ? gt('Вариант 01 — Beetle B0202 D01: четыре жука, диагональный шаг, перенос через края, луч, очки и верхний резерв по ROM. ГСЧ, сцены и звук адаптированы. Варианты 02–08 остаются реконструкцией по вики.', 'Variant 01 follows Beetle B0202 D01: four beetles, diagonal steps, side wrapping, ray shots, scores and the upper reserve follow the ROM. RNG, scenes and audio are adapted. Variants 02–08 remain wiki reconstructions.')
          : gt('Вариант 01 — B0202 A01: шаг, очки за переход, таблицы и период движения рядов сверены с ROM. ГСЧ, часть таймерных событий и сцены адаптированы. Варианты 02–16 сохраняют правила симулятора; процент относится к проверенным аспектам 01.', 'Variant 01 follows B0202 A01: steps, crossing scores, row tables and movement period were checked against the ROM. RNG, some timed events and scenes are adapted. Variants 02–16 keep simulator rules; the percentage refers to verified aspects of 01.');
  }
  if(id==='tetris'){
    sources.push(research('docs/devices/e88-b0202.md',gt('Профили E‑88 1–4: оригинальные фигуры, интервалы падения, очки 10/30/70/150 и препятствие; B0202 H02 — отражённое поле. Звук тетриса E‑88: каналы 0/3/10/11 и обе части мелодии 14/15. Ограничения указаны отдельно.', 'E‑88 profiles 1–4: original shapes, gravity intervals, 10/30/70/150 scoring and obstruction; B0202 H02 flips the field. E‑88 Tetris audio uses channels 0/3/10/11 and both melody parts 14/15. Limitations are listed separately.')));
    scope=gt('Общие правила Tetris сверены по нескольким источникам. Профили E‑88 и B0202 различаются; их ГСЧ, сцены и часть прогрессии остаются адаптацией. Оценка общей игры не означает точность всех вариантов.', 'Shared Tetris rules were cross-checked against several sources. E‑88 and B0202 profiles differ; RNG, scenes and parts of progression remain adapted. The general game rating does not certify every variant.');
  }
  if(['shooting-array','shooting-figures','construction'].includes(id)){
    sources.push(research('docs/devices/e88-b0202.md',gt('E‑88 №6–8 подключены как приближённые библиотечные варианты по решению владельца. Формы, карты, тайминги и очки оригинала ещё не сверены.', 'E‑88 #6–8 use owner-approved approximate library variants. Original shapes, maps, timing and scoring are not yet verified.')));
  }
  if(['racing','racing-shooting','shooting-array','shooting-figures','tetris-pentix','dice'].includes(id)){
    sources.push(research('docs/devices/e88-b0202.md',gt('Базовые игры B0202 B/C/E/F/G/I подключены из библиотеки по решению владельца. Для конкретных профилей B/C/F/G/I действует α; E01 — β на ядре E02, без неподтверждённого счётчика раундов. Общая оценка игры не переносится на эти профили.', 'B0202 base games B/C/E/F/G/I are owner-approved library adaptations. B/C/F/G/I are alpha; E01 is beta using E02 rules without its unverified round counter. The general game rating does not certify these profiles.')));
  }
  if(id==='arkanoid') sources.push(research('docs/brick/sea-battle-originals.md',gt('Старт «Морского боя» F01 уточнён по фото владельца; другие модели сохраняют донорские стены.', 'Sea Battle F01 opening follows the owner photo; other models retain donor walls.')));
  if(id==='romeo-juliet'||id==='sea-battle'){
    accuracy=60;
    sources.push({kind:'owner',title:'Apollo · наблюдения владельца / owner observations',url:repo+'docs/brick/completion.md',note:gt('Фото оригинального экрана и уточнения владельца: автоматический подъём Ромео; поочерёдная стрельба вслепую в Морском бое.', 'Original LCD photos and owner clarifications: automatic Romeo movement; alternating blind shots in Sea Battle.')});
    scope=gt('Основная механика — по фото и описанию владельца. Очки, точные интервалы и часть условий — решения реконструкции.', 'Core mechanics follow owner photos and descriptions. Scoring, exact intervals and some conditions are reconstruction choices.');
  }
  if(id==='mario'){
    accuracy=100;
    sources.splice(0,sources.length,
      {kind:'video',title:'Crocodile Mario · видео оригинала / original gameplay',url:repo+'docs/video-observations.md',note:gt('Покадровое исследование движения, вступлений, звука и светодиодов. Исходные видео предоставлены владельцем.', 'Frame-by-frame study of movement, intros, audio and LEDs. Original recordings were provided by the owner.')},
      {kind:'owner',title:'Apollo · оригинальная упаковка / original packaging',url:'https://brick-game.online/brand/pack-mario/front.webp',note:gt('Оригинальные фигурки и основные сведения об игре с упаковки.', 'Original figures and basic game information from the packaging.')},
      research('docs/reference-status.md',gt('Наблюдения владельца и границы реконструкции по нескольким материалам.', 'Owner observations and reconstruction limits across multiple materials.')));
    scope=gt('Несколько источников: видео, упаковка и наблюдения владельца. Процент отражает основу реконструкции; непроверенные геометрия уровней и параметры остаются описаны в материалах.', 'Multiple sources: video, packaging and owner observations. The percentage describes the evidence basis; unverified level geometry and parameters remain documented in the research.');
  }
  if(id==='clock'){
    accuracy=0; sources.splice(0,sources.length,research('docs/toys.md',gt('Часы упомянуты на оригинальном устройстве; отдельный режим ещё не исследован.', 'A clock is listed on the original device; the standalone mode has not been researched yet.')));
    scope=gt('Режим часов пока не реализован. Эта запись сохраняет сведения об оригинальном устройстве.', 'The clock mode is not implemented yet. This entry preserves information about the original device.');
  }
  if(LIBRARY_IDS.some(gameId=>gameId===id)&&!['snake','dice','tetris-flicker'].includes(id))sources.push(research('docs/brick/balance-review.md',gt('Проверка проходимости, баланса, столкновений и условий окончания. Авторские решения обозначены отдельно от сведений об оригинале.','Playability, balance, collisions and end-condition audit. Project design choices are distinguished from original-device evidence.')));
  return {id,family:familyFor(id),accuracy,sources,scope};
}).sort((a,b)=>b.accuracy-a.accuracy);

export { previewStage } from '../games/quality';

export const MARIO_GUIDE: GameGuideData = {
  summary:gt('Карманное приключение на сегментном экране. Марио проходит участки с платформами, препятствиями и врагами.', 'A pocket adventure on a segmented LCD. Mario crosses stages filled with platforms, obstacles and enemies.'),
  goal:gt('Доберитесь до конца каждого участка, сохранив жизни и время.', 'Reach the end of every stage while keeping your lives and time.'),
  rules:[gt('Продвигайтесь вправо по платформам; перепрыгивайте разрывы и препятствия.', 'Travel right across platforms, jumping over gaps and obstacles.'),gt('Маленьких врагов можно победить прыжком сверху или сердечком-снарядом.', 'Small enemies can be defeated by landing on them or with a heart projectile.'),gt('Падение в реку, опасные враги и истечение времени отнимают жизнь.', 'Falling into water, dangerous enemies and running out of time cost a life.'),gt('Собирайте сердечки и проходите участки; игра заканчивается, когда не остаётся жизней.', 'Collect hearts and clear stages; the game ends when all lives are lost.')],
  controls:[],scoring:[{what:gt('Сердечко','Heart'),points:'+100'},{what:gt('Малый враг: прыжок / выстрел','Small enemy: jump / shot'),points:'+200 / +20'},{what:gt('Большой враг','Large enemy'),points:'+400'}],
  facts:[{value:'9',label:gt('уровней','levels')},{value:'4',label:gt('жизни','lives')},{value:'400',label:gt('секунд','seconds')}],
  progression:gt('Участки сменяются последовательно; темп и препятствия зависят от сценария уровня.', 'Stages advance in sequence; pace and obstacles follow the level scenario.'),lives:gt('Четыре жизни на стандартном старте.', 'Four lives at a standard start.'),
  schemes:[],assumptions:[],
};
export const guideFor = (id: GameId): GameGuideData | undefined => id==='mario'?MARIO_GUIDE:BRICK_GUIDES[id];
