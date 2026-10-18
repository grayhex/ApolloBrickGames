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
  entry('e88', '6', 'shooting-array', false, 'Стрельба по массиву', 'Array shooting'),
  entry('e88', '7', 'shooting-figures', false, 'Разрушение клеток', 'Cell destruction'),
  entry('e88', '8', 'construction', false, 'Строительство клетками', 'Cell construction'),
];
const GROUPS = [
  ['A', 10, 'frog', 'Лягушка', 'Frog'], ['B', 1, 'racing', 'Гонки', 'Racing'],
  ['C', 1, 'racing-shooting', 'Стрельба', 'Shooting'], ['D', 1, 'honeybee', 'Жуки', 'Beetle'],
  ['E', 3, 'dice', 'Кости', 'Dice'], ['F', 1, 'shooting-array', 'Стрельба F', 'Shooting F'],
  ['G', 1, 'shooting-figures', 'Стрельба G', 'Shooting G'],
  ['H', 54, 'tetris', 'Тетрис', 'Tetris'], ['I', 54, 'tetris-pentix', 'Падающие блоки I', 'Falling blocks I'],
] as const;
export const B0202_ENTRIES: readonly NativeEntry[] = GROUPS.flatMap(([group, count, game, ru, en]) =>
  Array.from({ length: count }, (_, i) => {
    const code = `${group}${String(i + 1).padStart(2, '0')}`;
    return entry('apollo-b0202', code, game, ['A01', 'D01', 'E02', 'H01', 'H02'].includes(code), ru, en);
  }));
export const NATIVE_MENUS: Readonly<Record<NativeDeviceId, readonly NativeEntry[]>> = { e88: E88_ENTRIES, 'apollo-b0202': B0202_ENTRIES };
export function isNativeDevice(id: string): id is NativeDeviceId { return NATIVE_DEVICE_IDS.some(value => value === id); }
export function nativeEntry(device: NativeDeviceId, entryId: string): NativeEntry | undefined { return NATIVE_MENUS[device].find(e => e.entryId === entryId); }
export function nativeVariant(profileId: string, variantId: string): NativeEntry | undefined {
  return isNativeDevice(profileId) ? NATIVE_MENUS[profileId].find(e => e.variantId === variantId) : undefined;
}
export function originalMenu(device: NativeDeviceId, entries: readonly { entryId?: string }[]): boolean {
  const original = NATIVE_MENUS[device];
  return entries.length === original.length && entries.every((entry, i) => entry.entryId === original[i]!.entryId);
}
