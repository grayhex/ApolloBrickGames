import { describe, expect, it } from 'vitest';
import worker, { ConfigurationStore } from '../../src/server/worker';
import { defaultConfig } from '../../src/config/runtime';
class MemoryStorage {
  data = new Map<string,unknown>(); private tail = Promise.resolve();
  async get<T>(key:string): Promise<T|undefined> { return structuredClone(this.data.get(key)) as T|undefined; }
  async put(key:string,value:unknown): Promise<void> { this.data.set(key,structuredClone(value)); }
  async transaction<T>(fn:(tx:MemoryStorage)=>Promise<T>): Promise<T> { const result = this.tail.then(() => fn(this)); this.tail = result.then(() => undefined,() => undefined); return result; }
}
function setup() {
  const storage = new MemoryStorage(), store = new ConfigurationStore({ storage });
  const env = { ADMIN_TOKEN:'test-only-secret-at-least-thirty-two-characters', CONFIG:{ idFromName:()=>'site', get:()=>store }, ASSETS:{ fetch:async ()=>new Response('assets') } };
  return { storage, env, send:(request:Request)=>worker.fetch(request,env) };
}
function put(config:unknown, revision=0, token='test-only-secret-at-least-thirty-two-characters', origin='https://games.example'):Request {
  return new Request('https://games.example/api/admin/config',{ method:'PUT',headers:{ Authorization:`Bearer ${token}`, Origin:origin,'Content-Type':'application/json' },body:JSON.stringify({config,revision}) });
}
describe('configuration Worker', () => {
  it('serves repository defaults, hides no secrets, and rejects unauthorised or cross-origin changes', async () => {
    const {send} = setup(); const response = await send(new Request('https://games.example/api/config'));
    expect(await response.json()).toEqual({ revision:0,config:defaultConfig() }); expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect((await send(put(defaultConfig(),0,'bad'))).status).toBe(401); expect((await send(put(defaultConfig(),0,undefined,'https://evil.example'))).status).toBe(403);
  });
  it('persists only validated configuration and detects conflicting publication', async () => {
    const {send,storage} = setup(); const c = defaultConfig(); c.toys.clock99.games = [{id:'snake'}]; c.toys.clock99.defaultGame = 'snake';
    const responses = await Promise.all([send(put(c)),send(put(c))]); expect(responses.map((r)=>r.status).sort()).toEqual([200,409]);
    const reloaded = new ConfigurationStore({storage}); const response = await reloaded.fetch(new Request('https://games.example/api/config')); expect(await response.json()).toEqual({revision:1,config:c});
    c.toys.clock99.games = []; expect((await send(put(c,1))).status).toBe(400);
    expect((await send(new Request('https://games.example/api/missing'))).status).toBe(404);
  });
  it('disables writing when no secret is configured and bounds uploaded data', async () => {
    const {send,env} = setup(); const request = new Request('https://games.example/api/admin/config',{method:'PUT',headers:{Authorization:`Bearer ${env.ADMIN_TOKEN}`,Origin:'https://games.example','Content-Type':'application/json'},body:' '.repeat(65537)});
    expect((await send(request)).status).toBe(400); env.ADMIN_TOKEN = ''; expect((await send(put(defaultConfig()))).status).toBe(503);
  });
  it('serves /admin directly without adding a public navigation link', async () => { const {send} = setup(); const r = await send(new Request('https://games.example/admin')); expect(await r.text()).toBe('assets'); expect(r.headers.get('X-Robots-Tag')).toContain('noindex'); });
});
