import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import worker, { LeaderboardStore } from '../../src/server/worker';
import { signGuest, type LeaderboardEnv } from '../../src/server/leaderboards';
import type { SqlStorage } from '../../src/server/leaderboardStore';
import { categoryFor, RULESET_VERSION, STANDARD_START } from '../../src/leaderboards/category';
const ORIGIN = 'https://games.example';
const SECRET = 'test-leaderboard-secret-with-over-thirty-two-characters';
const ADMIN = 'test-administrator-secret-with-over-thirty-two-characters';
const databases: DatabaseSync[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function storage(): SqlStorage {
  const db = new DatabaseSync(':memory:');
  databases.push(db);
  return {
    sql: {
      exec<T>(query: string, ...values: (string | number | null)[]) {
        const rows = db.prepare(query).all(...values) as T[];
        return { toArray: () => rows };
      },
    },
    transactionSync<T>(callback: () => T): T {
      db.exec('BEGIN IMMEDIATE');
      try {
        const r = callback();
        db.exec('COMMIT');
        return r;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
const selected = (toyId = 'clock99', mode = 0, gameId = 'tetris') => ({
  gameId,
  toyId,
  mode,
  rulesetVersion: RULESET_VERSION,
  startProfile: STANDARD_START,
});
function setup() {
  const stores = new Map<string, LeaderboardStore>();
  const limit = vi.fn(async () => ({ success: true }));
  const env: LeaderboardEnv & { CONFIG: never; ASSETS: { fetch(request: Request): Promise<Response> } } = {
    LEADERBOARD_SECRET: SECRET,
    TURNSTILE_SITE_KEY: 'public-test-site-key',
    TURNSTILE_SECRET_KEY: 'test-turnstile-secret',
    ADMIN_TOKEN: ADMIN,
    LEADERBOARD_WRITE_LIMIT: { limit },
    LEADERBOARDS: {
      idFromName: (name) => name,
      get: (id) => {
        let store = stores.get(String(id));
        if (!store) {
          store = new LeaderboardStore({ storage: storage() });
          stores.set(String(id), store);
        }
        return store;
      },
    },
    CONFIG: undefined as never,
    ASSETS: { fetch: async () => new Response('assets') },
  };
  const verify = vi.fn(async (_input: unknown, init?: RequestInit) => {
    const token = (init?.body as URLSearchParams).get('response')!;
    return Response.json({
      success: token !== 'bad',
      hostname: 'games.example',
      action: 'leaderboard_publish',
      cdata: token.startsWith('valid:') ? token.slice(6) : token,
    });
  });
  vi.stubGlobal('fetch', verify);
  const send = async (
    path: string,
    body?: unknown,
    options: { cookie?: string; origin?: string; admin?: string; host?: string; method?: string } = {},
  ): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      headers['Origin'] = options.origin ?? options.host ?? ORIGIN;
    }
    if (options.cookie) headers['Cookie'] = options.cookie;
    if (options.admin !== undefined) headers['Authorization'] = `Bearer ${options.admin}`;
    return worker.fetch(
      new Request(`${options.host ?? ORIGIN}/api/${path}`, {
        method: options.method ?? (body === undefined ? 'GET' : 'POST'),
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env,
    );
  };
  const guest = async (): Promise<string> => {
    const response = await send('leaderboards/session', {});
    expect(response.status).toBe(200);
    return response.headers.get('set-cookie')!.split(';')[0]!;
  };
  const start = async (cookie: string, s = selected(), requestId = crypto.randomUUID()) => {
    const response = await send('leaderboards/runs', { ...s, requestId }, { cookie });
    expect(response.status).toBe(201);
    return (await response.json()) as { runId: string; category: string; expiresAt: number };
  };
  const complete = async (cookie: string, score: number, s = selected()) => {
    const run = await start(cookie, s);
    expect((await send('leaderboards/finish', { ...run, score }, { cookie })).status).toBe(200);
    return run;
  };
  const publish = async (cookie: string, run: { runId: string; category: string }, name = 'Player') =>
    send('leaderboards/publish', { ...run, nickname: name, token: `valid:${run.runId}` }, { cookie });
  const top = async (category = categoryFor(selected())) => {
    const response = await send(`leaderboards/top?category=${encodeURIComponent(category)}`);
    expect(response.status).toBe(200);
    return response.json() as Promise<{ category: string; entries: { rank: number; nickname: string; score: number; toyId: string }[] }>;
  };
  return { env, stores, send, guest, start, complete, publish, top, limit, verify };
}
describe('leaderboard Worker + actual SQLite transactions', () => {
  it('creates a signed HttpOnly/Secure guest; top is public and personal data is never cached', async () => {
    const s = setup(),
      response = await s.send('leaderboards/session', {}),
      cookie = response.headers.get('set-cookie')!;
    expect(cookie).toContain('__Host-brick_guest=');
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) expect(cookie).toContain(flag);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ enabled: true, siteKey: 'public-test-site-key' });
    const top = await s.send(`leaderboards/top?category=${encodeURIComponent(categoryFor(selected()))}`, undefined, { cookie });
    expect(top.headers.get('set-cookie')).toBeNull();
    expect(top.headers.get('cache-control')).toContain('public');
    expect(await top.json()).toEqual({ category: categoryFor(selected()), entries: [] });
    expect(
      (await s.send('leaderboards/runs', { ...selected(), requestId: crypto.randomUUID() }, { cookie: cookie.split(';')[0]!.replace(/.$/, '!') }))
        .status,
    ).toBe(401);
    expect(s.verify).not.toHaveBeenCalled();
  });
  it('rejects missing/wrong/expired cookies, CSRF, unsupported profiles and debug inputs', async () => {
    const s = setup(),
      body = { ...selected(), requestId: crypto.randomUUID() };
    expect((await s.send('leaderboards/runs', body)).status).toBe(401);
    const cookie = await s.guest();
    expect((await s.send('leaderboards/runs', body, { cookie, origin: 'https://evil.example' })).status).toBe(403);
    for (const invalid of [
      { startProfile: 'level-9' },
      { rulesetVersion: '999' },
      { mode: 999 },
      { mode: 1.5 },
      { toyId: 'minibrick' },
      { toyId: 'mario' },
      { seed: 123 },
      { debug: true },
      { gameId: '__proto__' },
    ])
      expect((await s.send('leaderboards/runs', { ...body, ...invalid }, { cookie })).status).toBe(400);
    const expired = await signGuest(crypto.randomUUID(), SECRET, 'default:games.example', Date.now() - 400 * 86400000);
    expect((await s.send('leaderboards/runs', body, { cookie: `__Host-brick_guest=${expired}` })).status).toBe(401);
  });
  it('fixes toy/mode at start, makes starts and final scores idempotent, and rejects another guest', async () => {
    const s = setup(),
      cookie = await s.guest(),
      requestId = crypto.randomUUID(),
      run = await s.start(cookie, selected('tank168', 2), requestId);
    const repeat = await s.send('leaderboards/runs', { ...selected('tank168', 2), requestId }, { cookie });
    expect(repeat.status).toBe(200);
    expect(await repeat.json()).toEqual(run);
    expect((await s.send('leaderboards/finish', { ...run, score: 123 }, { cookie: await s.guest() })).status).toBe(404);
    for (const score of [NaN, -1, 1.2, 10000000, '123'])
      expect((await s.send('leaderboards/finish', { ...run, score }, { cookie })).status).toBe(400);
    for (let n = 0; n < 2; n++)
      expect((await s.send('leaderboards/finish', { ...run, score: 123, toyId: 'brickgame' }, { cookie })).status).toBe(200);
    expect((await s.send('leaderboards/finish', { ...run, score: 124 }, { cookie })).status).toBe(409);
    expect((await s.publish(cookie, run)).status).toBe(200);
    expect((await s.top(run.category)).entries[0]).toEqual({ rank: 1, nickname: 'Player', score: 123, toyId: 'tank168' });
  });
  it('requires completion and fresh Siteverify with exact hostname/action/run binding', async () => {
    const s = setup(),
      cookie = await s.guest(),
      run = await s.start(cookie);
    expect((await s.publish(cookie, run)).status).toBe(409);
    await s.send('leaderboards/finish', { ...run, score: 42 }, { cookie });
    expect((await s.send('leaderboards/publish', { ...run, nickname: 'Player', token: 'bad' }, { cookie })).status).toBe(403);
    for (const wrong of [{ hostname: 'evil.example' }, { action: 'login' }, { cdata: crypto.randomUUID() }]) {
      s.verify.mockResolvedValueOnce(
        Response.json({ success: true, hostname: 'games.example', action: 'leaderboard_publish', cdata: run.runId, ...wrong }),
      );
      expect((await s.publish(cookie, run)).status).toBe(403);
    }
    s.verify.mockRejectedValueOnce(new Error('offline'));
    expect((await s.publish(cookie, run)).status).toBe(503);
    expect((await s.top()).entries).toEqual([]);
    expect((await s.publish(cookie, run)).status).toBe(200);
  });
  it('atomically commits concurrent publications once and returns a receipt for repeats without reusing Turnstile', async () => {
    const s = setup(),
      cookie = await s.guest(),
      run = await s.complete(cookie, 42);
    const results = await Promise.all([s.publish(cookie, run), s.publish(cookie, run)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const receipts = await Promise.all(results.map((r) => r.json()));
    expect(receipts[0]).toEqual(receipts[1]);
    expect((await s.top()).entries).toHaveLength(1);
    const count = s.verify.mock.calls.length;
    const repeated = await s.send('leaderboards/publish', { ...run, nickname: 'Player', token: 'already-consumed' }, { cookie });
    expect(repeated.status).toBe(200);
    expect(await repeated.json()).toEqual(receipts[0]);
    expect(s.verify.mock.calls.length).toBe(count);
    expect((await s.publish(cookie, run, 'Changed name')).status).toBe(409);
  });
  it('keeps one best result per guest, does not identify guests by nickname, and orders tied scores by server acceptance', async () => {
    const s = setup(),
      first = await s.guest(),
      second = await s.guest();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now());
    await s.publish(first, await s.complete(first, 100), 'Same');
    await s.publish(second, await s.complete(second, 100), 'Same');
    expect((await s.top()).entries.map((e) => [e.rank, e.score, e.nickname])).toEqual([
      [1, 100, 'Same'],
      [2, 100, 'Same'],
    ]);
    const lower = await s.publish(first, await s.complete(first, 99), 'Other name');
    expect(await lower.json()).toMatchObject({ best: false });
    const equal = await s.publish(first, await s.complete(first, 100), 'Other name');
    expect(await equal.json()).toMatchObject({ best: false });
    expect((await s.top()).entries[0]!.nickname).toBe('Same');
    await s.publish(first, await s.complete(first, 200, selected('tank168')), 'Best');
    expect((await s.top()).entries).toEqual([
      { rank: 1, nickname: 'Best', score: 200, toyId: 'tank168' },
      { rank: 2, nickname: 'Same', score: 100, toyId: 'clock99' },
    ]);
  });
  it('limits public reads to TOP-20 and merges equal control profiles but separates optional FIRE', async () => {
    const s = setup();
    for (let i = 0; i < 22; i++) {
      const cookie = await s.guest();
      await s.publish(cookie, await s.complete(cookie, i, selected(i % 2 ? 'tank168' : 'clock99', 0, 'racing')), `P${i}`);
    }
    const top = await s.top(categoryFor(selected('brickgame', 0, 'racing')));
    expect(top.entries).toHaveLength(20);
    expect(top.entries[0]!.score).toBe(21);
    expect(top.entries.at(-1)!.score).toBe(2);
    expect((await s.top(categoryFor(selected('brickgame', 0, 'tetris')))).entries).toEqual([]);
  });
  it('protects hide/export with ADMIN_TOKEN, rejects XSS and exports no guest/cookie identity', async () => {
    const s = setup(),
      cookie = await s.guest(),
      run = await s.complete(cookie, 42);
    for (const name of ['<script>alert(1)</script>', '<svg/onload=x>', 'a', 'a'.repeat(21), 'bad\u202Ename', 'x\u0000y'])
      expect((await s.publish(cookie, run, name)).status).toBe(400);
    await s.publish(cookie, run, 'Игрок_42');
    const path = `admin/leaderboards/export?category=${encodeURIComponent(run.category)}`;
    expect((await s.send(path)).status).toBe(401);
    expect((await s.send(path, undefined, { admin: 'wrong' })).status).toBe(401);
    const exported = (await (await s.send(path, undefined, { admin: ADMIN })).json()) as { entries: { entryId: string; hidden: number }[] };
    expect(JSON.stringify(exported)).not.toMatch(/guest|cookie|secret/i);
    const body = { category: run.category, entryId: exported.entries[0]!.entryId, hidden: true };
    expect((await s.send('admin/leaderboards/hide', body, { admin: ADMIN, origin: 'https://evil.example' })).status).toBe(403);
    expect((await s.send('admin/leaderboards/hide', body, { admin: ADMIN })).status).toBe(200);
    expect((await s.top()).entries).toEqual([]);
    expect((await s.send('admin/leaderboards/hide', { ...body, hidden: false }, { admin: ADMIN })).status).toBe(200);
    expect((await s.top()).entries[0]!.nickname).toBe('Игрок_42');
  });
  it('isolates preview hosts and audiences even with the same binding and secrets', async () => {
    const s = setup(),
      cookie = await s.guest();
    await s.publish(cookie, await s.complete(cookie, 42));
    const category = categoryFor(selected());
    const response = await s.send(`leaderboards/top?category=${encodeURIComponent(category)}`, undefined, { host: 'https://build-123.example' });
    expect(await response.json()).toEqual({ category, entries: [] });
    expect(
      (await s.send('leaderboards/runs', { ...selected(), requestId: crypto.randomUUID() }, { cookie, host: 'https://build-123.example' })).status,
    ).toBe(401);
    s.env.LEADERBOARD_ENV = 'staging';
    expect((await s.top()).entries).toEqual([]);
  });
  it('enforces edge and transactional limits, expires unfinished runs, and tolerates storage outages', async () => {
    const s = setup(),
      cookie = await s.guest();
    for (let i = 0; i < 8; i++) await s.start(cookie);
    expect((await s.send('leaderboards/runs', { ...selected(), requestId: crypto.randomUUID() }, { cookie })).status).toBe(429);
    s.limit.mockResolvedValueOnce({ success: false });
    expect((await s.send('leaderboards/session', {})).status).toBe(429);
    const other = await s.guest(),
      run = await s.start(other);
    vi.spyOn(Date, 'now').mockReturnValue(run.expiresAt + 1);
    expect((await s.send('leaderboards/finish', { ...run, score: 10 }, { cookie: other })).status).toBe(410);
    s.env.LEADERBOARDS = {
      idFromName: () => '',
      get: () => ({
        fetch: async () => {
          throw new Error('offline');
        },
      }),
    };
    expect((await s.send(`leaderboards/top?category=${encodeURIComponent(run.category)}`)).status).toBe(503);
  });
  it('fails closed without secrets but keeps the public leaderboard readable', async () => {
    const s = setup();
    s.env.LEADERBOARD_SECRET = undefined;
    expect((await s.send('leaderboards/session', {})).status).toBe(503);
    expect((await s.top()).entries).toEqual([]);
  });
  it('caches only public top responses, invalidates accepted writes, and uses the ordered SQL index', async () => {
    const s = setup(),
      responses = new Map<string, Response>();
    const cache = {
      match: vi.fn(async (request: Request) => responses.get(request.url)?.clone()),
      put: vi.fn(async (request: Request, response: Response) => {
        responses.set(request.url, response.clone());
      }),
      delete: vi.fn(async (request: Request) => responses.delete(request.url)),
    };
    vi.stubGlobal('caches', { default: cache });
    await s.top();
    await s.top();
    expect(cache.put).toHaveBeenCalledTimes(1);
    const plan = databases[0]!
      .prepare('EXPLAIN QUERY PLAN SELECT nickname,score,toy_id FROM entries WHERE hidden=0 ORDER BY score DESC,accepted_seq ASC LIMIT 20')
      .all();
    expect(JSON.stringify(plan)).toContain('entries_top');
    const cookie = await s.guest(),
      run = await s.complete(cookie, 42);
    await s.publish(cookie, run);
    expect(cache.delete).toHaveBeenCalled();
    expect((await s.top()).entries).toHaveLength(1);
    const exported = (await (
      await s.send(`admin/leaderboards/export?category=${encodeURIComponent(run.category)}`, undefined, { admin: ADMIN })
    ).json()) as { entries: { entryId: string }[] };
    await s.send('admin/leaderboards/hide', { category: run.category, entryId: exported.entries[0]!.entryId, hidden: true }, { admin: ADMIN });
    expect((await s.top()).entries).toEqual([]);
    for (const response of responses.values()) {
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(response.headers.get('cache-control')).toContain('public');
      expect(await response.clone().text()).not.toMatch(/guest|siteKey|runId/);
    }
  });
  it('bounds request bodies and allows safe punctuation without SQL interpolation', async () => {
    const s = setup(),
      cookie = await s.guest(),
      run = await s.complete(cookie, 42);
    expect((await s.send('leaderboards/publish', { ...run, nickname: 'x'.repeat(9000), token: 'bad' }, { cookie })).status).toBe(413);
    expect((await s.send('leaderboards/session')).status).toBe(405);
    const name = "a');DROP TABLE x;--";
    expect((await s.publish(cookie, run, name)).status).toBe(200);
    expect((await s.top()).entries[0]!.nickname).toBe(name);
  });
});
