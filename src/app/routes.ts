/** Маршруты на hash: работают в подкаталоге /CrocodileMario/ без переписывания адресов на сервере. */
export type RouteName = 'room' | 'tech' | 'sheet' | 'editor';

export function parseRoute(hash: string): RouteName {
  const path = hash.replace(/^#\/?/, '').split(/[?#]/)[0] ?? '';
  switch (path) {
    case 'tech':
      return 'tech';
    case 'sheet':
      return 'sheet';
    case 'editor':
      return 'editor';
    default:
      return 'room';
  }
}

export interface GameRoute {
  /** Путь к pack.json относительно базового пути сайта. */
  manifest: string;
  badge: string;
  subtitle: string;
  restartLabel: string;
  /** Показывать ли в подсказке управление огнём. */
  fireHint: boolean;
  /** Оформлять ли экран как крышку корпуса (рамка, светодиоды, рисунок). */
  lid: boolean;
  /** Ссылка на соседний маршрут (внизу страницы). */
  otherRoute: { hash: string; label: string };
}

export const GAME_ROUTES: Record<'room' | 'tech', GameRoute> = {
  room: {
    manifest: 'content/room/pack.json',
    badge: '',
    subtitle: '',
    restartLabel: 'Сброс',
    fireHint: true,
    lid: true,
    otherRoute: { hash: '#/tech', label: 'Техническая демоверсия движка (для разработки)' },
  },
  tech: {
    manifest: 'content/demo/pack.json',
    badge: 'ENGINE DEMO',
    subtitle: 'Техническая демоверсия движка: оригинальный контент ещё не восстановлен, уровни и правила — временные.',
    restartLabel: 'Рестарт',
    fireHint: true,
    lid: false,
    otherRoute: { hash: '#/', label: 'Однокомнатное демо' },
  },
};
