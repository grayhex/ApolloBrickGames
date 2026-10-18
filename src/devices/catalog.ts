/** Physical firmware menus, independent of the global game catalogue and menu order.
 * Codes/counts and matrix menu artwork were observed in pinned BrickEmuPy.
 */
import type { GameId } from '../games/catalog';
export const NATIVE_DEVICE_IDS = ['e88', 'apollo-b0202'] as const;
export type NativeDeviceId = (typeof NATIVE_DEVICE_IDS)[number];
export interface NativeEntry {
  entryId: string;
  nativeCode: string;
  group: string;
  gameId: GameId;
  profileId: NativeDeviceId;
  variantId: string;
  rulesetVersion: string;
  /** Availability means a matching profile exists, not merely a related engine. */
  available: boolean;
  approximate?: boolean;
  /** Confidence of an adapted native profile, independent of the donor game. */
  accuracy?: 30 | 60;
  name: { ru: string; en: string };
}
const entry = (profileId: NativeDeviceId, nativeCode: string, gameId: GameId, available: boolean, ru: string, en: string): NativeEntry => ({
  entryId: `${profileId}.${nativeCode}`, nativeCode, group: profileId === 'e88' ? nativeCode : nativeCode[0]!, gameId,
  profileId, variantId: nativeCode.toLowerCase(), rulesetVersion: '1', available, name: { ru, en },
});
export const E88_ENTRIES: readonly NativeEntry[] = [
  entry('e88', '1', 'tetris', true, 'Тетрис', 'Tetris'),
  entry('e88', '2', 'tetris', true, 'Тетрис · специальные фигуры', 'Tetris · special pieces'),
  entry('e88', '3', 'tetris', true, 'Тетрис · препятствие', 'Tetris · obstruction'),
  entry('e88', '4', 'tetris', true, 'Тетрис · особые фигуры и препятствие', 'Tetris · special pieces and obstruction'),
  entry('e88', '5', 'snake', true, 'Змейка', 'Snake'),
  {...entry('e88', '6', 'shooting-array', true, 'Стрельба по массиву', 'Array shooting'), approximate:true},
  {...entry('e88', '7', 'shooting-figures', true, 'Разрушение клеток', 'Cell destruction'), approximate:true},
  {...entry('e88', '8', 'construction', true, 'Строительство клетками', 'Cell construction'), approximate:true},
];
const GROUPS = [
  ['A', 10, 'frog', 'Лягушка', 'Frog'], ['B', 1, 'racing', 'Гонки', 'Racing'],
  ['C', 1, 'racing-shooting', 'Стрельба', 'Shooting'], ['D', 1, 'honeybee', 'Жуки', 'Beetle'],
  ['E', 3, 'dice', 'Кости', 'Dice'], ['F', 1, 'shooting-array', 'Стрельба по массиву', 'Array shooting'],
  ['G', 1, 'shooting-figures', 'Падающие фигуры', 'Falling targets'],
  ['H', 54, 'tetris', 'Тетрис', 'Tetris'], ['I', 54, 'tetris-pentix', 'Пентомино', 'Pentomino'],
] as const;
export const B0202_ENTRIES: readonly NativeEntry[] = GROUPS.flatMap(([group, count, game, ru, en]) =>
  Array.from({ length: count }, (_, i) => {
    const code = `${group}${String(i + 1).padStart(2, '0')}`;
    const approximate = ['B01','C01','E01','F01','G01','I01'].includes(code);
    return {...entry('apollo-b0202', code, game, approximate || ['A01', 'D01', 'E02', 'H01', 'H02'].includes(code), ru, en), ...(approximate ? {approximate:true,accuracy:code==='E01'?60 as const:30 as const} : {})};
  }));
export const NATIVE_MENUS: Readonly<Record<NativeDeviceId, readonly NativeEntry[]>> = { e88: E88_ENTRIES, 'apollo-b0202': B0202_ENTRIES };
export function isNativeDevice(id: string): id is NativeDeviceId { return NATIVE_DEVICE_IDS.some(value => value === id); }
export function nativeEntry(device: NativeDeviceId, entryId: string): NativeEntry | undefined { return NATIVE_MENUS[device].find(e => e.entryId === entryId); }
export function nativeVariant(profileId: string, variantId: string): NativeEntry | undefined {
  return isNativeDevice(profileId) ? NATIVE_MENUS[profileId].find(e => e.variantId === variantId) : undefined;
}
/** Admin status compares every persisted slot, including unfinished research entries. */
export function originalMenu(device: NativeDeviceId, entries: readonly { entryId?: string }[]): boolean {
  const original = NATIVE_MENUS[device];
  return entries.length === original.length && entries.every((entry, i) => entry.entryId === original[i]!.entryId);
}
/** The player sees only the playable subset of the original menu. */
export function originalPlayableMenu(device: NativeDeviceId, entries: readonly { entryId?: string }[]): boolean {
  const original = NATIVE_MENUS[device].filter(e=>e.available);
  const visible = entries.filter(e=>nativeEntry(device,e.entryId ?? '')?.available);
  return visible.length === original.length && visible.every((entry, i) => entry.entryId === original[i]!.entryId);
}

/** Public menus contain playable entries only; persisted research slots remain import-compatible. */
export function playableEntries(device: NativeDeviceId, entries: readonly {id: GameId; entryId?: string}[]): {id: GameId; entryId: string}[] {
  const playable = entries.flatMap(ref => {
    const e = nativeEntry(device, ref.entryId ?? '');
    return e?.available ? [{id:e.gameId,entryId:e.entryId}] : [];
  });
  // A legacy admin document may contain only unfinished entries. Keep the toy usable.
  const first = NATIVE_MENUS[device].find(e => e.available)!;
  return playable.length ? playable : [{id:first.gameId,entryId:first.entryId}];
}

/** Assignment identity is the game; native entry IDs still identify physical variants and scores. */
export function nativeFamilies(device: NativeDeviceId): {base: NativeEntry; variants: NativeEntry[]}[] {
  return NATIVE_MENUS[device].filter((entry,index,all)=>all.findIndex(e=>e.gameId===entry.gameId)===index)
    .map(base=>({base,variants:NATIVE_MENUS[device].filter(e=>e.gameId===base.gameId&&e.available&&e.entryId!==base.entryId)}));
}
export function nativeBase(device: NativeDeviceId, game: GameId): NativeEntry {
  return nativeFamilies(device).find(f=>f.base.gameId===game)!.base;
}
