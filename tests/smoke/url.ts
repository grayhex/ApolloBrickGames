/**
 * Адрес страницы игрушки в тестах. Без параметра `toy` сайт открывает универсальный Brick Game, поэтому тесты Crocodile Mario указывают `toy=mario` явно;
 * остальные игрушки задают `toy` сами и проходят без изменений.
 */
export function marioUrl(query = ''): string {
  if (/[?&]toy=/.test(query)) return `./${query}`;
  return `./${query === '' ? '?' : `${query}&`}toy=mario`;
}
