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
const rom: EvidenceSource = { kind:'rom', title:'BrickEmuPy · Apollo B0202 / E-23 / E-88', url:'https://github.com/azya52/BrickEmuPy/tree/376cca92c6d000ffd6046e5491f2a1c3d1a5eab0',note:gt('Машинный код оригинальных устройств; объём сверки указан отдельно для каждой игры.', 'Original device machine code; the verification scope is specified for each game.') };
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
  }else if(['racing','racing-shooting','frog','shooting','shooting-array','construction','arkanoid','honeybee','dice','pong','pong-double','pneumatic-ball','arkanoid-dots','space-invaders'].includes(id)){
    sources.push(rom,research('docs/brick/rom-review.md',gt('Найдены аналоги или отдельные наблюдения. Это не полная проверка правил данной реализации.', 'Related games or individual observations were found. This is not a complete verification of this implementation.')));
    // Finding a similarly named game in a ROM is not verification of our gameplay.
  }
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
  return {id,family:familyFor(id),accuracy,sources,scope};
});

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
