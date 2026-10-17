import { categoryFor, selection, validateCategory, nickname, validScore } from '../leaderboards/category';
import { authorized, HttpError, json, readJson, failure } from './http';
interface Namespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}
export interface LeaderboardEnv {
  LEADERBOARDS?: Namespace;
  LEADERBOARD_WRITE_LIMIT?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  LEADERBOARD_SECRET?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  ADMIN_TOKEN?: string;
  /** Distinct in named staging environments; hostname is included even if preview inherits production bindings. */
  LEADERBOARD_ENV?: string;
}
const COOKIE = '__Host-brick_guest';
const COOKIE_LIFE = 365 * 24 * 60 * 60;
const encoder = new TextEncoder();
const base64 = (s: Uint8Array): string =>
  btoa(String.fromCharCode(...s))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const bytes = (s: string): Uint8Array => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const scope = (url: URL, env: LeaderboardEnv): string => `${env.LEADERBOARD_ENV ?? 'default'}:${url.host}`;
async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function signGuest(id: string, secret: string, audience: string, now = Date.now()): Promise<string> {
  const payload = base64(encoder.encode(JSON.stringify({ id, aud: audience, exp: Math.floor(now / 1000) + COOKIE_LIFE })));
  const sig = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload));
  return `${payload}.${base64(new Uint8Array(sig))}`;
}
export async function readGuest(request: Request, env: LeaderboardEnv): Promise<string | null> {
  const cookie = request.headers
    .get('Cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!cookie || cookie.length > 1024 || !env.LEADERBOARD_SECRET) return null;
  try {
    const [payload, sig, ...rest] = cookie.split('.');
    if (!payload || !sig || rest.length) return null;
    if (!(await crypto.subtle.verify('HMAC', await key(env.LEADERBOARD_SECRET), bytes(sig) as BufferSource, encoder.encode(payload)))) return null;
    const value = JSON.parse(new TextDecoder().decode(bytes(payload))) as { id: string; aud: string; exp: number };
    return /^[\da-f-]{36}$/i.test(value.id) &&
      value.aud === scope(new URL(request.url), env) &&
      Number.isSafeInteger(value.exp) &&
      value.exp > Math.floor(Date.now() / 1000)
      ? value.id
      : null;
  } catch {
    return null;
  }
}
function configured(env: LeaderboardEnv): boolean {
  return !!(
    env.LEADERBOARDS &&
    env.LEADERBOARD_SECRET &&
    env.LEADERBOARD_SECRET.length >= 32 &&
    env.TURNSTILE_SITE_KEY &&
    env.TURNSTILE_SECRET_KEY &&
    env.LEADERBOARD_WRITE_LIMIT
  );
}
function sameOrigin(request: Request, url: URL): void {
  if (request.headers.get('Origin') !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site')
    throw new HttpError(403, 'Same-origin request required');
}
async function store(env: LeaderboardEnv, url: URL, category: string, op: string, data: Record<string, unknown> = {}): Promise<Response> {
  if (!env.LEADERBOARDS) throw new HttpError(503, 'Leaderboard unavailable');
  try {
    return await env.LEADERBOARDS.get(env.LEADERBOARDS.idFromName(`${scope(url, env)}:${category}`)).fetch(
      new Request(`https://leaderboard.internal/${op}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, category }),
      }),
    );
  } catch {
    throw new HttpError(503, 'Leaderboard temporarily unavailable');
  }
}
interface EdgeCache {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, response: Response): Promise<void>;
  delete(key: Request): Promise<boolean>;
}
function edgeCache(): EdgeCache | undefined {
  return (globalThis as unknown as { caches?: { default?: EdgeCache } }).caches?.default;
}
function cacheKey(url: URL, category: string, env: LeaderboardEnv): Request {
  return new Request(`${url.origin}/api/leaderboards/top?category=${encodeURIComponent(category)}&scope=${encodeURIComponent(scope(url, env))}`);
}
async function invalidate(url: URL, category: string, env: LeaderboardEnv): Promise<void> {
  try {
    await edgeCache()?.delete(cacheKey(url, category, env));
  } catch {
    /* Cache failure never changes publication outcome. */
  }
}
async function limit(request: Request, env: LeaderboardEnv, url: URL, guest: string): Promise<void> {
  if (!env.LEADERBOARD_WRITE_LIMIT) throw new HttpError(503, 'Write limiter unavailable');
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const hash = base64(new Uint8Array(await crypto.subtle.sign('HMAC', await key(env.LEADERBOARD_SECRET!), encoder.encode(ip))));
  try {
    const results = await Promise.all(
      [`ip:${hash}`, `guest:${guest}`].map((id) => env.LEADERBOARD_WRITE_LIMIT!.limit({ key: `${scope(url, env)}:${id}` })),
    );
    if (results.some((r) => !r.success)) throw new HttpError(429, 'Too many requests. Try again later.');
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, 'Write limiter unavailable');
  }
}
async function verifyTurnstile(token: unknown, runId: string, url: URL, env: LeaderboardEnv): Promise<void> {
  if (typeof token !== 'string' || !token || token.length > 2048) throw new HttpError(400, 'Fresh Turnstile token required');
  let response: Response;
  try {
    response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY!, response: token }),
    });
  } catch {
    throw new HttpError(503, 'Verification temporarily unavailable');
  }
  if (!response.ok) throw new HttpError(503, 'Verification temporarily unavailable');
  let result: { success?: boolean; hostname?: string; action?: string; cdata?: string };
  try {
    result = await response.json();
  } catch {
    throw new HttpError(503, 'Invalid verification response');
  }
  if (result.success !== true || result.hostname !== url.hostname || result.action !== 'leaderboard_publish' || result.cdata !== runId)
    throw new HttpError(403, 'Verification failed. Please try again.');
}
/** Public top never touches a guest cookie; all personal endpoints are no-store. */
export async function leaderboardRoute(request: Request, env: LeaderboardEnv): Promise<Response> {
  const url = new URL(request.url),
    path = url.pathname;
  try {
    if (path === '/api/leaderboards/top') {
      if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed');
      const category = validateCategory(url.searchParams.get('category')),
        cache = edgeCache(),
        cacheRequest = cacheKey(url, category, env);
      try {
        const hit = await cache?.match(cacheRequest);
        if (hit) return hit;
      } catch {
        /* fall through */
      }
      const result = await store(env, url, category, 'top');
      if (!result.ok) return result;
      const response = new Response(result.body, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=10, s-maxage=20', 'X-Content-Type-Options': 'nosniff' },
      });
      try {
        await cache?.put(cacheRequest, response.clone());
      } catch {
        /* read-through without caching */
      }
      return response;
    }
    if (path.startsWith('/api/admin/leaderboards')) {
      if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32) throw new HttpError(503, 'Admin disabled');
      if (!(await authorized(request, env.ADMIN_TOKEN))) throw new HttpError(401, 'Invalid administrator key');
      if (path === '/api/admin/leaderboards/export' && request.method === 'GET') {
        return store(env, url, validateCategory(url.searchParams.get('category')), 'export', { cursor: Number(url.searchParams.get('cursor') ?? 0) });
      }
      if (path === '/api/admin/leaderboards/hide' && request.method === 'POST') {
        sameOrigin(request, url);
        const body = await readJson(request),
          category = validateCategory(body['category']);
        const result = await store(env, url, category, 'hide', { entryId: body['entryId'], hidden: body['hidden'] });
        if (result.ok) await invalidate(url, category, env);
        return result;
      }
      throw new HttpError(405, 'Method not allowed');
    }
    if (!['/api/leaderboards/session', '/api/leaderboards/runs', '/api/leaderboards/finish', '/api/leaderboards/publish'].includes(path))
      throw new HttpError(404, 'Not found');
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    sameOrigin(request, url);
    if (!configured(env)) return json({ enabled: false, error: 'Publication is not configured' }, 503);
    if (path === '/api/leaderboards/session') {
      if (Object.keys(await readJson(request, 256)).length) throw new HttpError(400, 'Empty session body required');
      const existing = await readGuest(request, env),
        guest = existing ?? crypto.randomUUID();
      await limit(request, env, url, guest);
      const response = json({ enabled: true, siteKey: env.TURNSTILE_SITE_KEY });
      if (!existing)
        response.headers.set(
          'Set-Cookie',
          `${COOKIE}=${await signGuest(guest, env.LEADERBOARD_SECRET!, scope(url, env))}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${COOKIE_LIFE}`,
        );
      return response;
    }
    const guest = await readGuest(request, env);
    if (!guest) throw new HttpError(401, 'Guest session required');
    const body = await readJson(request);
    await limit(request, env, url, guest);
    if (path === '/api/leaderboards/runs') {
      const s = selection(body),
        category = categoryFor(s);
      return store(env, url, category, 'start', { guest, selection: s, requestId: body['requestId'] });
    }
    const category = validateCategory(body['category']);
    if (path === '/api/leaderboards/finish')
      return store(env, url, category, 'finish', { guest, runId: body['runId'], score: validScore(body['score']) });
    if (path === '/api/leaderboards/publish') {
      const name = nickname(body['nickname']),
        runId = body['runId'];
      if (typeof runId !== 'string') throw new HttpError(400, 'Run required');
      const status = await store(env, url, category, 'status', { guest, runId, nickname: name });
      const state = (await status.clone().json()) as { pending?: boolean };
      if (!status.ok || !state.pending) return status;
      await verifyTurnstile(body['token'], runId, url, env);
      const result = await store(env, url, category, 'publish', { guest, runId, nickname: name });
      if (result.ok) await invalidate(url, category, env);
      return result;
    }
    throw new HttpError(404, 'Not found');
  } catch (error) {
    return failure(error);
  }
}
