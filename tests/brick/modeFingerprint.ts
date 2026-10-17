import type { BrickGame } from '../../src/brick';
import { frameHash, fuzzPlayer } from './conformance';

/**
 * Отпечаток прогона игры: хэш кадров (`frameHash`) и типов событий воспроизводимого «случайного игрока» от старта до первого конца партии
 * (но не дольше `maxTicks` тактов). Анимация конца игры в отпечаток не входит: её длительность задаёт основа и не относится к правилам игры.
 * Нужен, чтобы доказать: вариант 01 игры после добавления вариантов остался ровно прежним (от номера варианта зависят рекорды).
 */
export function fingerprint(game: BrickGame, seed: number, maxTicks = 3000): string {
  const player = fuzzPlayer(seed * 31 + 5);
  let h = 2166136261;
  const mix = (text: string): void => {
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  };
  game.start();
  for (let t = 0; t < maxTicks; t++) {
    const events = game.step(player());
    mix(frameHash(game));
    mix(events.map((e) => e.type + (e.type === 'tone' ? e.pad : '')).join(','));
    if (events.some((e) => e.type === 'gameOver')) break;
  }
  return h.toString(16).padStart(8, '0');
}
