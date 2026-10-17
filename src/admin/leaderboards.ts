import { h } from '../app/dom';
import { GAMES, type GameId } from '../games/catalog';
import { BRICK_GAMES } from '../brick/games';
import { TOYS, type ToyId } from '../app/toys';
import { categoryFor, RULESET_VERSION, STANDARD_START } from '../leaderboards/category';
interface AdminEntry {
  entryId: string;
  nickname: string;
  score: number;
  toyId: ToyId;
  acceptedAt: number;
  sequence: number;
  hidden: number;
}
export function adminLeaderboards(parent: HTMLElement, key: HTMLInputElement): void {
  const root = h('section', { class: 'admin__publish admin__leaderboards' }),
    title = h('h2', {}, 'Общий рейтинг · модерация');
  const game = h('select', { 'aria-label': 'Игра рейтинга' }),
    mode = h('select', { 'aria-label': 'Канонический вариант рейтинга' }),
    toy = h('select', { 'aria-label': 'Профиль управления рейтинга' });
  for (const g of Object.values(GAMES).filter((g) => g.id === 'mario' || BRICK_GAMES[g.id])) game.append(h('option', { value: g.id }, g.names.ru));
  game.value = 'tetris';
  const status = h('p', { role: 'status' }),
    rows = h('div', { class: 'admin__record-list' });
  const category = (): string =>
    categoryFor({ gameId: game.value, mode: Number(mode.value), toyId: toy.value, rulesetVersion: RULESET_VERSION, startProfile: STANDARD_START });
  const message = (text: string): void => {
    status.textContent = text;
  };
  const request = async (path: string, body?: unknown): Promise<Response> => {
    const headers: Record<string, string> = { Authorization: `Bearer ${key.value}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${import.meta.env.BASE_URL}api/admin/leaderboards/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      signal: AbortSignal.timeout(10000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  };
  const refreshChoices = (): void => {
    mode.replaceChildren(
      ...(game.value === 'mario' ? [{ name: { ru: 'Полная партия с уровня 1' } }] : BRICK_GAMES[game.value as GameId]!.modes).map((m, i) =>
        h('option', { value: String(i) }, `${i + 1}: ${m.name.ru}`),
      ),
    );
    toy.replaceChildren();
    for (const id of ['mario', 'clock99', 'seabattle', 'tank168', 'brickgame'] as const) {
      try {
        categoryFor({ gameId: game.value, mode: 0, toyId: id, rulesetVersion: RULESET_VERSION, startProfile: STANDARD_START });
        toy.append(h('option', { value: id }, TOYS[id].name));
      } catch {
        /* incompatible hardware */
      }
    }
    if ([...toy.options].some((o) => o.value === 'brickgame')) toy.value = 'brickgame';
    rows.replaceChildren();
    message('Выберите категорию и нажмите «Загрузить записи». Дополнительная FIRE образует отдельный рейтинг только у игр, использующих её.');
  };
  let nextCursor: number | null = null;
  const more = h('button', { type: 'button' }, 'Следующие 200 записей');
  more.hidden = true;
  more.onclick = () => {
    if (nextCursor !== null) void load(nextCursor, true);
  };
  const load = async (cursor = 0, append = false): Promise<void> => {
    try {
      const selected = category();
      const response = await request(`export?category=${encodeURIComponent(selected)}&cursor=${cursor}`),
        data = (await response.json()) as { entries: AdminEntry[]; next: number | null };
      if (selected !== category()) return;
      if (!append) rows.replaceChildren();
      nextCursor = data.next;
      more.hidden = nextCursor === null;
      for (const entry of data.entries) {
        const hide = h('button', { type: 'button' }, entry.hidden ? 'Показать' : 'Скрыть'),
          row = h(
            'div',
            { class: 'admin__record' },
            h('span', {}, `${entry.nickname} · ${entry.score} · ${TOYS[entry.toyId]?.name ?? entry.toyId}`),
            hide,
          );
        hide.onclick = () => {
          hide.disabled = true;
          void request('hide', { category: selected, entryId: entry.entryId, hidden: !entry.hidden })
            .then(() => load())
            .catch(() => {
              message('Не удалось изменить запись.');
              hide.disabled = false;
            });
        };
        rows.append(row);
      }
      message(
        `${rows.children.length} записей${data.next !== null ? ' · есть следующая страница' : ''}. Скрытие обновит публичный топ в пределах 20 секунд.`,
      );
    } catch {
      message('Не удалось загрузить рейтинг. Проверьте ключ администратора и доступность Worker.');
    }
  };
  const loadButton = h('button', { type: 'button' }, 'Загрузить записи');
  loadButton.onclick = () => void load();
  const download = h('button', { type: 'button' }, 'Экспорт JSON');
  download.onclick = () => {
    download.disabled = true;
    void (async () => {
      try {
        const selected = category(),
          entries: AdminEntry[] = [];
        let cursor: number | null = 0;
        do {
          const data = (await (await request(`export?category=${encodeURIComponent(selected)}&cursor=${cursor}`)).json()) as {
            entries: AdminEntry[];
            next: number | null;
          };
          entries.push(...data.entries);
          cursor = data.next;
        } while (cursor !== null);
        const url = URL.createObjectURL(
          new Blob([JSON.stringify({ category: selected, exportedAt: new Date().toISOString(), entries }, null, 2)], { type: 'application/json' }),
        );
        const a = h('a', { href: url, download: 'leaderboard.json' });
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        message(`Экспортировано ${entries.length} записей. Идентификаторы гостей и cookie в экспорт не входят.`);
      } catch {
        message('Не удалось экспортировать рейтинг.');
      } finally {
        download.disabled = false;
      }
    })();
  };
  game.onchange = refreshChoices;
  mode.onchange = () => {
    rows.replaceChildren();
    nextCursor = null;
    more.hidden = true;
  };
  toy.onchange = () => {
    rows.replaceChildren();
    nextCursor = null;
    more.hidden = true;
  };
  refreshChoices();
  root.append(
    title,
    h('p', {}, 'Результаты хранятся отдельно от конфигурации приставок. Используется тот же ключ администратора, что в блоке публикации выше.'),
    h('label', {}, 'Игра', game),
    h('label', {}, 'Вариант движка', mode),
    h('label', {}, 'Модель / управление', toy),
    h('p', {}, 'Стандартный старт · ruleset 1'),
    loadButton,
    download,
    status,
    rows,
    more,
  );
  parent.append(root);
}
