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
  it('serves the public encyclopedia directly, including a trailing slash and game links',async()=>{
    const {send}=setup();
    for(const path of ['/encyclopedia?game=tetris','/encyclopedia/?game=snake']){
      const response=await send(new Request(`https://games.example${path}`));
      expect(response.status).toBe(200);expect(await response.text()).toBe('assets');
      expect(response.headers.get('X-Robots-Tag')).toBeNull();
    }
  });
});

it('publishes original illustrations atomically with the existing authenticated configuration', async () => {
  const {send,storage}=setup();
  const config=defaultConfig();config.encyclopedia={snake:{imageUrl:'https://images.example/original-snake.png'}};
  expect((await send(put(config,0,'wrong'))).status).toBe(401);
  expect((await send(put(config))).status).toBe(200);
  const reloaded=new ConfigurationStore({storage});
  const read=await reloaded.fetch(new Request('https://games.example/api/config'));
  expect((await read.json() as {config:unknown}).config).toEqual(config);
  expect((await send(put({...config,encyclopedia:{snake:{imageUrl:'javascript:alert(1)'}}},1))).status).toBe(400);
});

it('normalizes a previously published four-device document without rewriting revision or saved settings',async()=>{
  const {send,storage}=setup();
  const c=defaultConfig();
  const toys=Object.fromEntries(Object.entries(c.toys).filter(([id])=>id!=='e88'&&id!=='apollo-b0202'));
  const saved={revision:17,config:{...c,language:'en',toys,encyclopedia:{snake:{imageUrl:'https://example.com/original.png'}}}};
  await storage.put('published',saved);
  const response=await send(new Request('https://games.example/api/config'));
  const normalized=await response.json() as {revision:number;config:ReturnType<typeof defaultConfig>};
  expect(normalized.revision).toBe(17);expect(normalized.config.toys.e88.games).toHaveLength(8);expect(normalized.config.toys['apollo-b0202'].games).toHaveLength(126);
  for(const [id,toy]of Object.entries(toys))expect(normalized.config.toys[id as keyof typeof c.toys]).toEqual(toy);
  expect(await storage.get('published')).toEqual(saved);
  const next={...normalized.config};next.toys.e88.defaultEntry='e88.4';
  expect((await send(put(next,17))).status).toBe(200);
});
