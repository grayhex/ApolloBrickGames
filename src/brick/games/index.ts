/**
 * Реестр восстановленных «кирпичных» игр по идентификатору (`GameId` каталога). Консоли с меню (`app/cabinet.ts`) берут отсюда игры своих пунктов.
 * Игры, которых здесь нет, остаются в меню невыбираемыми для запуска (событие `blocked`).
 */
import type { BrickGameDef } from '../types';

export const BRICK_GAMES: Readonly<Record<string, BrickGameDef>> = {};
