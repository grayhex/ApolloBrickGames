import { nickname, selection, categoryFor, validScore, validateCategory } from '../leaderboards/category';
import { HttpError, readJson, json, failure } from './http';
export interface SqlCursor<T> {
  toArray(): T[];
}
export interface Sql {
  exec<T = Record<string, unknown>>(query: string, ...values: (string | number | null)[]): SqlCursor<T>;
}
export interface SqlStorage {
  sql: Sql;
  transactionSync<T>(callback: () => T): T;
}
interface Run {
  run_id: string;
  guest: string;
  toy_id: string;
  created_at: number;
  expires_at: number;
  finish_score: number | null;
  receipt: string | null;
}
const RUN_TTL = 24 * 60 * 60 * 1000;
export class LeaderboardStore {
  private readonly storage: SqlStorage;
  private readonly sql: Sql;
  constructor(state: { storage: SqlStorage }) {
    this.storage = state.storage;
    this.sql = state.storage.sql;
    for (const ddl of [
      'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS runs (run_id TEXT PRIMARY KEY, guest TEXT NOT NULL, start_key TEXT NOT NULL, toy_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, finish_score INTEGER, finished_at INTEGER, receipt TEXT, UNIQUE(guest,start_key))',
      'CREATE INDEX IF NOT EXISTS runs_expiry ON runs(expires_at)',
      'CREATE TABLE IF NOT EXISTS receipts (seq INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL)',
      'CREATE INDEX IF NOT EXISTS receipts_expiry ON receipts(created_at)',
      'CREATE TABLE IF NOT EXISTS entries (guest TEXT PRIMARY KEY, run_id TEXT UNIQUE NOT NULL, nickname TEXT NOT NULL, score INTEGER NOT NULL, toy_id TEXT NOT NULL, accepted_seq INTEGER UNIQUE NOT NULL, accepted_at INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1)))',
      'CREATE INDEX IF NOT EXISTS entries_top ON entries(score DESC,accepted_seq ASC) WHERE hidden=0',
      'CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, window INTEGER NOT NULL, count INTEGER NOT NULL)',
      'CREATE INDEX IF NOT EXISTS limits_window ON limits(window)',
    ])
      this.sql.exec(ddl);
  }
  private run(id: unknown, guest: unknown): Run {
    if (typeof id !== 'string' || typeof guest !== 'string') throw new HttpError(400, 'Run required');
    const row = this.sql.exec<Run>('SELECT * FROM runs WHERE run_id=? AND guest=?', id, guest).toArray()[0];
    if (!row) throw new HttpError(404, 'Run not found');
    if (row.expires_at < Date.now() && !row.receipt) throw new HttpError(410, 'Run expired');
    return row;
  }
  private limit(guest: string, kind: string, maximum: number): void {
    const window = Math.floor(Date.now() / 60000),
      key = `${kind}:${guest}`;
    this.sql.exec(
      'INSERT INTO limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window=excluded.window,count=CASE WHEN limits.window=excluded.window THEN limits.count+1 ELSE 1 END',
      key,
      window,
    );
    const row = this.sql.exec<{ count: number }>('SELECT count FROM limits WHERE key=?', key).toArray()[0]!;
    if (row.count > maximum) throw new HttpError(429, 'Too many requests');
  }
  async fetch(request: Request): Promise<Response> {
    try {
      const body = await readJson(request);
      const category = validateCategory(body['category']);
      return this.storage.transactionSync(() => {
        const existing = this.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key='category'").toArray()[0];
        if (existing && existing.value !== category) throw new HttpError(409, 'Category mismatch');
        if (!existing) this.sql.exec("INSERT INTO meta(key,value) VALUES('category',?)", category);
        const op = new URL(request.url).pathname;
        if (op === '/top') {
          const rows = this.sql
            .exec<{ nickname: string; score: number; toy_id: string }>(
              'SELECT nickname,score,toy_id FROM entries WHERE hidden=0 ORDER BY score DESC,accepted_seq ASC LIMIT 20',
            )
            .toArray();
          return json({ category, entries: rows.map((r, i) => ({ rank: i + 1, nickname: r.nickname, score: r.score, toyId: r.toy_id })) });
        }
        if (op === '/export') {
          const cursor = Number(body['cursor'] ?? 0);
          if (!Number.isSafeInteger(cursor) || cursor < 0) throw new HttpError(400, 'Invalid cursor');
          const entries = this.sql
            .exec<{ entryId: string; nickname: string; score: number; toyId: string; acceptedAt: number; sequence: number; hidden: number }>(
              'SELECT run_id AS entryId,nickname,score,toy_id AS toyId,accepted_at AS acceptedAt,accepted_seq AS sequence,hidden FROM entries WHERE accepted_seq>? ORDER BY accepted_seq LIMIT 200',
              cursor,
            )
            .toArray();
          return json({ category, entries, next: entries.length === 200 ? entries.at(-1)!.sequence : null });
        }
        if (op === '/hide') {
          if (typeof body['entryId'] !== 'string' || typeof body['hidden'] !== 'boolean') throw new HttpError(400, 'Entry and hidden flag required');
          this.sql.exec('UPDATE entries SET hidden=? WHERE run_id=?', body['hidden'] ? 1 : 0, body['entryId']);
          return json({ ok: true });
        }
        const guest = body['guest'];
        if (typeof guest !== 'string' || guest.length > 80) throw new HttpError(400, 'Guest required');
        if (op === '/start') {
          const s = selection(body['selection']);
          if (categoryFor(s) !== category) throw new HttpError(409, 'Invalid selection');
          const key = body['requestId'];
          if (typeof key !== 'string' || !/^[\da-f-]{36}$/i.test(key)) throw new HttpError(400, 'Request ID required');
          const previous = this.sql.exec<Run>('SELECT * FROM runs WHERE guest=? AND start_key=?', guest, key).toArray()[0];
          if (previous) {
            if (previous.toy_id !== s.toyId) throw new HttpError(409, 'Start already registered');
            return json({ runId: previous.run_id, category, expiresAt: previous.expires_at });
          }
          this.limit(guest, 'start', 8);
          const now = Date.now(),
            runId = crypto.randomUUID();
          this.sql.exec('DELETE FROM runs WHERE expires_at<?', now - 7 * RUN_TTL);
          this.sql.exec('DELETE FROM receipts WHERE created_at<?', now - 8 * RUN_TTL);
          this.sql.exec('DELETE FROM limits WHERE window<?', Math.floor(now / 60000) - 2);
          this.sql.exec(
            'INSERT INTO runs(run_id,guest,start_key,toy_id,created_at,expires_at) VALUES(?,?,?,?,?,?)',
            runId,
            guest,
            key,
            s.toyId,
            now,
            now + RUN_TTL,
          );
          return json({ runId, category, expiresAt: now + RUN_TTL }, 201);
        }
        const run = this.run(body['runId'], guest);
        if (op === '/finish') {
          const score = validScore(body['score']);
          if (run.finish_score !== null && run.finish_score !== score) throw new HttpError(409, 'Score already final');
          this.sql.exec('UPDATE runs SET finish_score=?,finished_at=COALESCE(finished_at,?) WHERE run_id=?', score, Date.now(), run.run_id);
          const final = run.finish_score ?? score;
          // Предлагать публикацию имеет смысл, только если результат больше нуля и лучше уже опубликованного этим же игроком (гость — подписанная cookie).
          const published = this.sql.exec<{ score: number }>('SELECT score FROM entries WHERE guest=?', guest).toArray()[0];
          return json({ ok: true, score: final, toyId: run.toy_id, publishable: final > 0 && (!published || final > published.score), personalBest: published?.score ?? null });
        }
        if (op === '/status' || op === '/publish') {
          const name = nickname(body['nickname']);
          if (run.receipt) {
            const receipt = JSON.parse(run.receipt) as { nickname: string };
            if (receipt.nickname !== name) throw new HttpError(409, 'Run already published');
            return json(receipt);
          }
          if (run.finish_score === null) throw new HttpError(409, 'Run not completed');
          if (run.finish_score <= 0) throw new HttpError(409, 'Nothing to publish: the score is zero');
          if (op === '/status') return json({ pending: true });
          this.limit(guest, 'publish', 6);
          const previous = this.sql.exec<{ score: number }>('SELECT score FROM entries WHERE guest=?', guest).toArray()[0];
          const best = !previous || run.finish_score > previous.score;
          const now = Date.now();
          const sequence = this.sql
            .exec<{ seq: number }>('INSERT INTO receipts(run_id,created_at) VALUES(?,?) RETURNING seq', run.run_id, now)
            .toArray()[0]!.seq;
          if (best)
            this.sql.exec(
              'INSERT INTO entries(guest,run_id,nickname,score,toy_id,accepted_seq,accepted_at,hidden) VALUES(?,?,?,?,?,?,?,0) ON CONFLICT(guest) DO UPDATE SET run_id=excluded.run_id,nickname=excluded.nickname,score=excluded.score,toy_id=excluded.toy_id,accepted_seq=excluded.accepted_seq,accepted_at=excluded.accepted_at,hidden=0',
              guest,
              run.run_id,
              name,
              run.finish_score,
              run.toy_id,
              sequence,
              now,
            );
          const receipt = { ok: true, best, nickname: name, score: run.finish_score, toyId: run.toy_id };
          this.sql.exec('UPDATE runs SET receipt=? WHERE run_id=?', JSON.stringify(receipt), run.run_id);
          return json(receipt);
        }
        throw new HttpError(404, 'Not found');
      });
    } catch (error) {
      return failure(error);
    }
  }
}
