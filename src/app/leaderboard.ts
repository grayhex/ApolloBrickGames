import {
  categoryFor,
  nickname,
  rankedPage,
  RULESET_VERSION,
  STANDARD_START,
  type RunSelection,
  type PublicTop,
  type TopEntry,
} from '../leaderboards/category';
import { GAMES } from '../games/catalog';
import { BRICK_GAMES } from '../brick/games';
import { TOYS } from './toys';
import { h } from './dom';
import { getLang, onLangChange } from './i18n';
import { miniConsole } from './shellPicker';
const COPY = {
  ru: {
    title: 'Рекорды',
    empty: 'Здесь пока нет рекордов. Станьте первым!',
    offline: 'Рейтинг временно недоступен',
    loading: 'Загрузка…',
    more: 'Показать TOP-20',
    less: 'Свернуть до 5',
    variant: 'Вариант',
    place: 'Место',
    name: 'Ник',
    score: 'Очки',
    toy: 'Модель',
    practiceMario: 'Вне рейтинга: начните обычную партию с первого уровня, без отладки и редактора.',
    practice: 'Вне рейтинга: нужен обычный старт без отладки, с уровня и скорости 0.',
    offer: 'Партия завершена. Опубликовать результат?',
    nick: 'Ник · 2–20 символов',
    publish: 'Опубликовать',
    skip: 'Не сейчас',
    sending: 'Проверка и отправка…',
    saved: 'Результат опубликован',
    lower: 'Результат принят. Ваш лучший результат выше или равен.',
    failed: 'Не удалось отправить. Можно повторить.',
    invalid: 'Ник: 2–20 видимых символов, без разметки и управляющих знаков.',
    privacy: 'Без регистрации. Ник сохраняется в этом браузере. Публикация добровольная.',
    retry: 'Обновить',
    recording: 'Регистрация результата…',
    disabled: 'Эта партия не зарегистрирована в общем рейтинге. Локальные рекорды работают.',
  },
  en: {
    title: 'High scores',
    empty: 'No scores yet. Be the first!',
    offline: 'Leaderboard temporarily unavailable',
    loading: 'Loading…',
    more: 'Show TOP 20',
    less: 'Show 5',
    variant: 'Variant',
    place: 'Rank',
    name: 'Nickname',
    score: 'Score',
    toy: 'Model',
    practiceMario: 'Not ranked: start a normal game from level 1, without debug or the editor.',
    practice: 'Not ranked: use a normal start without debug, at level and speed 0.',
    offer: 'Game finished. Publish your score?',
    nick: 'Nickname · 2–20 characters',
    publish: 'Publish',
    skip: 'Not now',
    sending: 'Verifying and publishing…',
    saved: 'Score published',
    lower: 'Score accepted. Your personal best is higher or equal.',
    failed: 'Could not publish. You can retry.',
    invalid: 'Nickname: 2–20 visible characters, without markup or control characters.',
    privacy: 'No account required. Nickname stays in this browser. Publishing is optional.',
    retry: 'Refresh',
    recording: 'Registering result…',
    disabled: 'This run was not registered for global scores. Local records still work.',
  },
};
const NICK_KEY = 'brick-game:leaderboard-nickname';
const api = async (path: string, body?: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> => {
  const response = await fetch(`${import.meta.env.BASE_URL}api/leaderboards/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    signal: signal ?? AbortSignal.timeout(path === 'publish' ? 12000 : 3500),
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(response.status === 503 ? 'unavailable' : `HTTP ${response.status}`);
  return (await response.json()) as Record<string, unknown>;
};
let session: Promise<{ siteKey: string }> | null = null;
function guestSession(): Promise<{ siteKey: string }> {
  session ??= api('session', {})
    .then((data) => {
      if (typeof data['siteKey'] !== 'string') throw new Error('unavailable');
      return { siteKey: data['siteKey'] };
    })
    .catch((error) => {
      session = null;
      throw error;
    });
  return session;
}
interface Turnstile {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  execute(id: string): void;
  remove(id: string): void;
}
let script: Promise<Turnstile> | null = null;
function loadChallenge(): Promise<Turnstile> {
  const w = window as unknown as { turnstile?: Turnstile };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  script ??= new Promise<Turnstile>((resolve, reject) => {
    const element = h('script', { src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', async: '' });
    const timer = setTimeout(() => {
      element.remove();
      reject(new Error('Challenge timeout'));
    }, 15000);
    element.onload = () => {
      clearTimeout(timer);
      if (w.turnstile) resolve(w.turnstile);
      else reject(new Error('Challenge unavailable'));
    };
    element.onerror = () => {
      clearTimeout(timer);
      element.remove();
      reject(new Error('Challenge unavailable'));
    };
    document.head.append(element);
  }).catch((error) => {
    script = null;
    throw error;
  });
  return script;
}
/** Every explicit submission obtains a new token; no token is retained during gameplay. */
export async function challengeToken(container: HTMLElement, siteKey: string, runId: string, signal: AbortSignal): Promise<string> {
  const turnstile = await loadChallenge();
  if (signal.aborted) throw new Error('Disposed');
  let widget: string | undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      const done = (token?: string): void => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
        if (token) resolve(token);
        else reject(new Error('Challenge failed'));
      };
      const abort = (): void => done();
      const timeout = setTimeout(abort, 120000);
      signal.addEventListener('abort', abort, { once: true });
      try {
        widget = turnstile.render(container, {
          sitekey: siteKey,
          action: 'leaderboard_publish',
          cData: runId,
          execution: 'execute',
          appearance: 'interaction-only',
          size: 'compact',
          theme: document.documentElement.dataset['theme'] === 'light' ? 'light' : 'dark',
          language: getLang(),
          callback: (token: string) => done(token),
          'error-callback': abort,
          'expired-callback': abort,
        });
        turnstile.execute(widget);
      } catch {
        done();
      }
    });
  } finally {
    if (widget !== undefined) turnstile.remove(widget);
  }
}
interface Ticket {
  runId: string;
  category: string;
  siteKey: string;
}
export class LeaderboardCard {
  readonly root = h('section', { class: 'side leaderboard', id: 'leaderboard', 'aria-labelledby': 'leaderboard-title' });
  private selected: RunSelection | null = null;
  private category = '';
  private selectionKey = '';
  private eligible = false;
  private entries: TopEntry[] = [];
  private expanded = false;
  private loading = false;
  private offline = false;
  private generation = 0;
  private topRequest: AbortController | null = null;
  private ticket: Promise<Ticket | null> | null = null;
  private finished: { ticket: Ticket; score: number } | null = null;
  private finalScore: number | null = null;
  private status: 'recording' | 'saved' | 'lower' | 'failed' | 'disabled' | null = null;
  private busy = false;
  private publication: AbortController | null = null;
  private readonly signal: AbortSignal;
  private readonly pageEligible: boolean;
  constructor(parent: HTMLElement, signal: AbortSignal) {
    this.signal = signal;
    this.pageEligible = rankedPage(location.search, location.hash);
    parent.append(this.root);
    onLangChange(() => this.render(), signal);
    signal.addEventListener(
      'abort',
      () => {
        this.publication?.abort();
        this.generation++;
        this.topRequest?.abort();
        this.root.remove();
      },
      { once: true },
    );
  }
  select(value: Omit<RunSelection, 'rulesetVersion' | 'startProfile'>, standard: boolean): void {
    const identity = `${value.gameId}:${value.mode}:${value.toyId}`,
      eligible = this.pageEligible && standard;
    if (identity === this.selectionKey && eligible === this.eligible) return;
    const selection = { ...value, rulesetVersion: RULESET_VERSION, startProfile: STANDARD_START };
    let category: string;
    try {
      category = categoryFor(selection);
    } catch {
      this.root.hidden = true;
      return;
    }
    this.root.hidden = false;
    const changed = category !== this.category;
    this.selectionKey = identity;
    this.eligible = eligible;
    this.selected = selection;
    if (changed) {
      this.category = category;
      this.entries = [];
      this.expanded = false;
      void this.refresh();
    } else this.render();
  }
  begin(): void {
    this.publication?.abort();
    this.publication = null;
    this.busy = false;
    this.generation++;
    this.finished = null;
    this.finalScore = null;
    this.status = null;
    const selected = this.selected ? { ...this.selected } : null;
    if (!this.eligible || !selected) {
      this.ticket = null;
      this.render();
      return;
    }
    // Fire-and-forget registration never delays a simulation tick or waits for a challenge.
    const requestId = crypto.randomUUID();
    this.ticket = (async () => {
      const { siteKey } = await guestSession();
      const data = await api('runs', { ...selected, requestId });
      if (typeof data['runId'] !== 'string' || data['category'] !== categoryFor(selected)) throw new Error('Invalid run');
      return { runId: data['runId'], category: data['category'], siteKey };
    })().catch(() => null);
    this.render();
  }
  cancel(): void {
    this.publication?.abort();
    this.publication = null;
    this.busy = false;
    this.generation++;
    this.ticket = null;
    this.finished = null;
    this.finalScore = null;
    this.status = null;
    this.render();
  }
  finish(score: number): void {
    const pending = this.ticket;
    if (!pending) return;
    const generation = this.generation;
    this.finalScore = score;
    this.status = 'recording';
    this.render();
    void (async () => {
      try {
        const ticket = await pending;
        if (!ticket) {
          if (!this.signal.aborted && generation === this.generation) {
            this.status = 'failed';
            this.render();
          }
          return;
        }
        await api('finish', { category: ticket.category, runId: ticket.runId, score });
        if (this.signal.aborted || generation !== this.generation) return;
        this.finished = { ticket, score };
        this.status = null;
        this.render();
      } catch {
        if (!this.signal.aborted && generation === this.generation) {
          this.status = 'failed';
          this.render();
        }
      }
    })();
  }
  private async refresh(): Promise<void> {
    if (!this.category || this.signal.aborted) return;
    this.topRequest?.abort();
    const controller = new AbortController();
    this.topRequest = controller;
    const timer = setTimeout(() => controller.abort(), 3500),
      category = this.category;
    this.loading = true;
    this.offline = false;
    this.render();
    try {
      const data = (await api(`top?category=${encodeURIComponent(category)}`, undefined, controller.signal)) as unknown as PublicTop;
      if (data.category !== category || !Array.isArray(data.entries)) throw new Error('Invalid leaderboard');
      if (controller !== this.topRequest) return;
      this.entries = data.entries
        .filter(
          (e) =>
            Number.isSafeInteger(e.rank) &&
            e.rank > 0 &&
            typeof e.nickname === 'string' &&
            [...e.nickname].length <= 20 &&
            Number.isSafeInteger(e.score) &&
            e.score >= 0 &&
            typeof e.toyId === 'string' &&
            Object.hasOwn(TOYS, e.toyId),
        )
        .slice(0, 20);
    } catch {
      if (controller !== this.topRequest) return;
      this.offline = true;
    } finally {
      clearTimeout(timer);
      if (controller === this.topRequest && !this.signal.aborted) {
        this.loading = false;
        this.render();
      }
    }
  }
  private render(): void {
    if (this.signal.aborted || this.busy) return;
    const copy = COPY[getLang()],
      selected = this.selected;
    const title = h('h2', { class: 'side__title', id: 'leaderboard-title' }, copy.title);
    const heading = h('div', { class: 'leaderboard__heading' }, title, h('span', { class: 'leaderboard__badge' }, 'TOP 20'));
    const game = selected ? GAMES[selected.gameId].names[getLang()] : '';
    const mode = selected?.gameId === 'mario' ? '' : `${copy.variant} ${(selected?.mode ?? 0) + 1}`;
    const caption = h(
      'p',
      { class: 'leaderboard__caption' },
      `${game}${mode ? ` · ${mode}` : ''}${this.category.endsWith('matrix-fire') ? ' · FIRE' : ''}`,
    );
    if (selected) caption.title = BRICK_GAMES[selected.gameId]?.modes[selected.mode]?.name[getLang()] ?? game;
    const table = h('table', { class: 'leaderboard__table' }),
      thead = h('thead'),
      header = h('tr');
    for (const text of [copy.place, copy.name, copy.score, copy.toy]) header.append(h('th', { scope: 'col' }, text));
    thead.append(header);
    table.append(thead);
    const rows = h('tbody');
    for (const entry of this.entries.slice(0, this.expanded ? 20 : 5)) {
      const model = TOYS[entry.toyId];
      const toy = h(
        'span',
        { class: 'leaderboard__toy', role: 'img', 'data-shell': 'white', title: model.name, 'aria-label': model.name },
        miniConsole('white', 0, entry.toyId),
      );
      rows.append(
        h(
          'tr',
          {},
          h('td', {}, String(entry.rank)),
          h('td', { class: 'leaderboard__nick', title: entry.nickname }, entry.nickname),
          h('td', { class: 'leaderboard__score' }, new Intl.NumberFormat(getLang()).format(entry.score)),
          h('td', {}, toy),
        ),
      );
    }
    table.append(rows);
    const state = this.loading ? copy.loading : this.offline ? copy.offline : this.entries.length === 0 ? copy.empty : '';
    const status = h('p', { class: 'leaderboard__status', role: 'status' }, state);
    const toggle = h(
      'button',
      { type: 'button', class: 'leaderboard__more', 'aria-expanded': String(this.expanded) },
      this.expanded ? copy.less : copy.more,
    );
    toggle.hidden = this.entries.length <= 5;
    toggle.onclick = () => {
      this.expanded = !this.expanded;
      this.render();
    };
    const retry = h('button', { type: 'button', class: 'leaderboard__more' }, copy.retry);
    retry.hidden = !this.offline;
    retry.onclick = () => void this.refresh();
    const previousName = this.root.querySelector<HTMLInputElement>('#leaderboard-nickname')?.value;
    const activeName = document.activeElement?.id === 'leaderboard-nickname';
    const selectionStart = activeName ? (document.activeElement as HTMLInputElement).selectionStart : null;
    this.root.replaceChildren(heading, caption, table, status, toggle, retry);
    if (!this.eligible) this.root.append(h('p', { class: 'leaderboard__note' }, selected?.gameId === 'mario' ? copy.practiceMario : copy.practice));
    if (this.status) this.root.append(h('p', { class: 'leaderboard__status', role: 'status' }, copy[this.status]));
    if (this.status === 'failed' && !this.finished && this.finalScore !== null) {
      const retryFinish = h('button', { type: 'button', class: 'leaderboard__more' }, copy.retry);
      retryFinish.onclick = () => this.finish(this.finalScore!);
      this.root.append(retryFinish);
    }
    if (this.finished) {
      const form = h('form', { class: 'leaderboard__publish' }),
        input = h('input', {
          id: 'leaderboard-nickname',
          name: 'nickname',
          autocomplete: 'nickname',
          maxlength: '40',
          required: '',
          'aria-label': copy.nick,
        });
      try {
        input.value = previousName ?? localStorage.getItem(NICK_KEY) ?? '';
      } catch {
        input.value = previousName ?? '';
      }
      const label = h('label', { for: input.id }, copy.nick),
        score = h('strong', {}, new Intl.NumberFormat(getLang()).format(this.finished.score));
      const submit = h('button', { type: 'submit' }, this.busy ? copy.sending : copy.publish);
      submit.disabled = this.busy;
      input.disabled = this.busy;
      const skip = h('button', { type: 'button' }, copy.skip);
      skip.onclick = () => {
        this.publication?.abort();
        this.publication = null;
        this.generation++;
        this.busy = false;
        this.finished = null;
        this.status = null;
        this.render();
      };
      const challenge = h('div', { class: 'leaderboard__challenge' });
      form.append(
        h('p', {}, copy.offer, ' ', score),
        label,
        input,
        h('div', { class: 'leaderboard__actions' }, submit, skip),
        challenge,
        h('p', { class: 'leaderboard__note' }, copy.privacy),
      );
      form.onsubmit = (event) => {
        event.preventDefault();
        void this.publish(input, form, challenge);
      };
      this.root.append(form);
      if (activeName) {
        input.focus({ preventScroll: true });
        if (selectionStart !== null) input.setSelectionRange(selectionStart, selectionStart);
      }
    }
  }
  private async publish(input: HTMLInputElement, form: HTMLFormElement, container: HTMLElement): Promise<void> {
    if (!this.finished || this.busy) return;
    let name: string;
    try {
      name = nickname(input.value);
    } catch {
      input.setCustomValidity(COPY[getLang()].invalid);
      input.reportValidity();
      input.oninput = () => input.setCustomValidity('');
      return;
    }
    try {
      localStorage.setItem(NICK_KEY, name);
    } catch {
      /* Optional nickname memory. */
    }
    const finished = this.finished,
      generation = this.generation;
    this.busy = true;
    const publication = new AbortController();
    this.publication = publication;
    input.disabled = true;
    for (const button of form.querySelectorAll<HTMLButtonElement>('button'))
      if (button.type === 'submit') {
        button.disabled = true;
        button.textContent = COPY[getLang()].sending;
      }
    try {
      const token = await challengeToken(container, finished.ticket.siteKey, finished.ticket.runId, publication.signal);
      const data = await api(
        'publish',
        { category: finished.ticket.category, runId: finished.ticket.runId, nickname: name, token },
        AbortSignal.any([publication.signal, AbortSignal.timeout(12000)]),
      );
      if (this.signal.aborted || generation !== this.generation) return;
      this.finished = null;
      this.status = data['best'] === false ? 'lower' : 'saved';
      void this.refresh();
    } catch {
      if (!this.signal.aborted && generation === this.generation) this.status = 'failed';
    } finally {
      if (generation === this.generation) {
        this.busy = false;
        this.publication = null;
        if (!this.signal.aborted) this.render();
      }
    }
  }
}
