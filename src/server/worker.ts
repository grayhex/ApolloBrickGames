import { validateConfig, type SiteConfig } from '../config/schema';
import raw from '../config/default.json';
interface Snapshot { revision: number; config: SiteConfig }
interface Storage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  transaction<T>(callback: (tx: Storage) => Promise<T>): Promise<T>;
}
interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  CONFIG: { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } };
  ADMIN_TOKEN?: string;
}
const json = (value: unknown, status = 200): Response => Response.json(value, { status, headers: { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' } });
async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('Ожидается JSON.');
  const reader = request.body?.getReader(); if (!reader) throw new Error('Пустое тело.');
  let text = '', bytes = 0; const decoder = new TextDecoder();
  for (;;) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 65536) { await reader.cancel(); throw new Error('Конфигурация больше 64 КБ.'); } text += decoder.decode(value, { stream:true }); }
  return JSON.parse(text + decoder.decode()) as unknown;
}
async function authorized(request: Request, secret: string | undefined): Promise<boolean> {
  if (!secret || secret.length < 32) return false;
  const supplied = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  if (supplied.length > 1024) return false;
  const hash = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a,b] = await Promise.all([hash(secret),hash(supplied)]); let difference = 0; for (let i = 0; i < a.length; i++) difference |= a[i]! ^ b[i]!; return difference === 0;
}
/** One durable object serialises publication and detects stale administrator tabs. */
export class ConfigurationStore {
  private storage: Storage;
  constructor(state: { storage: Storage }) { this.storage = state.storage; }
  async fetch(request: Request): Promise<Response> {
    const fallback = (): Snapshot => ({ revision:0, config:validateConfig(raw) });
    if (request.method === 'GET') return json(await this.storage.get<Snapshot>('published') ?? fallback());
    if (request.method !== 'PUT') return json({ error:'Method not allowed' },405);
    try {
      const body = await readJson(request);
      if (!body || typeof body !== 'object' || !('config' in body) || !('revision' in body) || !Number.isInteger(body.revision)) return json({ error:'Нужны config и revision.' },400);
      const config = validateConfig(body.config);
      return await this.storage.transaction(async (tx) => {
        const old = await tx.get<Snapshot>('published') ?? fallback();
        if (old.revision !== body.revision) return json({ error:'Конфигурация уже изменена. Загрузите актуальную перед публикацией.' },409);
        const next = { revision:old.revision + 1, config }; await tx.put('published',next); return json(next);
      });
    } catch (error) { return json({ error:error instanceof Error ? error.message : 'Недопустимая конфигурация.' },400); }
  }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/config' && request.method === 'GET') return env.CONFIG.get(env.CONFIG.idFromName('site')).fetch(request);
    if (url.pathname === '/api/admin/config') {
      if (request.method !== 'PUT') return json({ error:'Method not allowed' },405);
      if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32) return json({ error:'Запись выключена: задайте секрет ADMIN_TOKEN длиной не менее 32 символов в Cloudflare.' },503);
      if (!await authorized(request,env.ADMIN_TOKEN)) return json({ error:'Неверный ключ администратора.' },401);
      if (request.headers.get('Origin') !== url.origin) return json({ error:'Недопустимый источник запроса.' },403);
      return env.CONFIG.get(env.CONFIG.idFromName('site')).fetch(request);
    }
    if (url.pathname.startsWith('/api/')) return json({ error:'Not found' },404);
    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      const response = await env.ASSETS.fetch(new Request(new URL('/',url),request));
      const headers = new Headers(response.headers); headers.set('Cache-Control','no-store'); headers.set('X-Robots-Tag','noindex, nofollow'); return new Response(response.body,{ status:response.status,headers });
    }
    return env.ASSETS.fetch(request);
  },
};
