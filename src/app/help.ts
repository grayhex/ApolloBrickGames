import type { Action } from '../core/actions';
import { describeSource, type Bindings } from '../input/bindings';
import { getLang, t, type MsgKey } from './i18n';
import { keyLabel, type ToyModel } from './toys';
import type { ToyKeyId } from './toy';

export interface HelpRow {
  /** Кнопка на корпусе. */
  button: string;
  /** Что она делает (на текущем языке). */
  what: string;
  /** Клавиши клавиатуры. */
  keys: string;
}

/** Горячие клавиши питания и звука (в настройках управления не переназначаются). */
export const POWER_KEY = 'O';
export const SOUND_KEY = 'M';

/** Названия клавиш, на которых висят эти действия по текущим привязкам (без повторов). */
export function keyCaps(bindings: Bindings, ...actions: Action[]): string[] {
  const lang = getLang();
  return [...new Set(actions.flatMap((action) => bindings[action]))].map((source) => describeSource(source, lang));
}

function keysOf(bindings: Bindings, ...actions: Action[]): string {
  const caps = keyCaps(bindings, ...actions);
  return caps.length === 0 ? '—' : caps.join(' · ');
}

/** Таблица «кнопка → что делает → клавиши» по текущим привязкам клавиатуры. По упаковке: UP и JUMP — прыжок, у DOWN в режиме MARIO действия нет. */
export function helpRows(bindings: Bindings): HelpRow[] {
  const row = (button: string, what: MsgKey, keys: string): HelpRow => ({ button, what: t(what), keys });
  return [
    row('ON/OFF', 'help.row.onoff', POWER_KEY),
    row('S./P.', 'help.row.sp', keysOf(bindings, 'start', 'pause')),
    row('SOUND', 'help.row.sound', SOUND_KEY),
    row('FIRE', 'help.row.fire', keysOf(bindings, 'fire')),
    row('◀ LEFT', 'help.row.left', keysOf(bindings, 'left')),
    row('RIGHT ▶', 'help.row.right', keysOf(bindings, 'right')),
    row('UP', 'help.row.up', keysOf(bindings, 'up')),
    row('DOWN', 'help.row.down', keysOf(bindings, 'down')),
    row('JUMP', 'help.row.jump', keysOf(bindings, 'jump')),
  ];
}

/** Таблица кнопок игрушки с тетрисом («Часы+99», «Морской бой»): подписи напечатаны на корпусе, RESET возвращает в меню. */
export function toyHelpRows(model: ToyModel, bindings: Bindings): HelpRow[] {
  const order: ToyKeyId[] = ['onoff', 'sp', 'sound', 'fire', 'left', 'right', 'up', 'down', 'jump'];
  const keys: Record<ToyKeyId, string> = {
    onoff: POWER_KEY,
    sp: keysOf(bindings, 'start', 'pause'),
    sound: SOUND_KEY,
    fire: model.universal ? keysOf(bindings, 'fire') : '—',
    left: keysOf(bindings, 'left'),
    right: keysOf(bindings, 'right'),
    up: keysOf(bindings, 'up'),
    down: keysOf(bindings, 'down'),
    jump: keysOf(bindings, 'jump'),
  };
  const rows = order.flatMap((id): HelpRow[] => {
    const what = model.keyWhat[id];
    return what ? [{ button: keyLabel(model, id), what: t(what), keys: keys[id] }] : [];
  });
  if (model.universal) rows.push({ button: 'RESET', what: t('help.row.menu'), keys: '—' });
  return rows;
}

/** Navigate to the standalone encyclopedia, initially focused on the selected game. */
export function openEncyclopedia(toyId: string): void {
  const selected = document.getElementById('gpanel')?.dataset['game'] ?? (toyId === 'mario' ? 'mario' : 'tetris');
  const url = new URL(`${import.meta.env.BASE_URL}encyclopedia`, location.origin);
  url.searchParams.set('game', selected);
  url.searchParams.set('toy', toyId);
  location.assign(url);
}
