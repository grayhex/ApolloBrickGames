import type { Page } from '@playwright/test';

/** Static preview has no Worker. Game/UI suites use an empty, read-only ranking;
 * API, publication and failure behavior have dedicated leaderboard tests. */
export async function mockReadOnlyLeaderboard(page: Page): Promise<void> {
  await page.route('**/api/leaderboards/top?**', (route) => route.fulfill({
    json: { category: new URL(route.request().url()).searchParams.get('category'), entries: [] },
  }));
  await page.route('**/api/leaderboards/session', (route) => route.fulfill({ json: { enabled: false } }));
}

/**
 * Адрес страницы игрушки в тестах. Без параметра `toy` сайт открывает универсальный Brick Game, поэтому тесты Crocodile Mario указывают `toy=mario` явно;
 * остальные игрушки задают `toy` сами и проходят без изменений.
 */
export function marioUrl(query = ''): string {
  if (/[?&]toy=/.test(query)) return `./${query}`;
  return `./${query === '' ? '?' : `${query}&`}toy=mario`;
}
