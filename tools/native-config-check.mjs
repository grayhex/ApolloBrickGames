/** Local workerd/SQLite migration check. The fixture-only seed routes are NEVER deployed.
 * First: npx wrangler deploy --dry-run --outdir .wrangler/native-check
 */
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('..',import.meta.url));
const bundle=resolve(process.argv[2] ?? '.wrangler/native-check/worker.js');
const old=JSON.parse(await readFile(`${root}/src/config/default.json`,'utf8'));
delete old.toys.e88;delete old.toys['apollo-b0202'];old.language='en';old.encyclopedia={snake:{imageUrl:'https://example.org/original.png'}};
const saved={revision:23,config:old};
const source=await readFile(bundle,'utf8');
const script=source+`\nexport class FixtureStore extends ConfigurationStore {
 constructor(state){super(state);this.testStorage=state.storage;}
 async fetch(request){
  if(new URL(request.url).pathname==='/fixture/seed'){await this.testStorage.put('published',await request.json());return new Response('ok');}
  if(new URL(request.url).pathname==='/fixture/raw')return Response.json(await this.testStorage.get('published'));
  return super.fetch(request);
 }
}`;
const persist=await mkdtemp('/tmp/native-config-');
const token='local-only-token-not-a-production-secret';
const opts={name:'native-config-test',modules:true,script,compatibilityDate:'2026-10-13',durableObjects:{CONFIG:{className:'FixtureStore',useSQLite:true,unsafeUniqueKey:'native-config-migration-fixture'}},bindings:{ADMIN_TOKEN:token}};
let mf;
try{
 mf=new Miniflare({...convertV4MiniflareOptions(opts),resourcePersistencePath:persist});await mf.ready;
 const ns=await mf.getDurableObjectNamespace('CONFIG');const stub=ns.get(ns.idFromName('site'));
 const seed=await stub.fetch('http://internal/fixture/seed',{method:'POST',body:JSON.stringify(saved)});assert.equal(seed.status,200);const initial=await stub.fetch('http://internal/fixture/raw');assert.deepEqual(await initial.json(),saved);
 await mf.dispose();mf=new Miniflare({...convertV4MiniflareOptions(opts),resourcePersistencePath:persist});await mf.ready;
 const response=await mf.dispatchFetch('http://localhost/api/config');assert.equal(response.status,200);const normalized=await response.json();
 assert.equal(normalized.revision,23);assert.equal(normalized.config.language,'en');assert.deepEqual(normalized.config.encyclopedia,old.encyclopedia);
 for(const [id,toy]of Object.entries(old.toys))assert.deepEqual(normalized.config.toys[id],toy);
 assert.equal(normalized.config.toys.e88.games.length,5);assert.equal(normalized.config.toys['apollo-b0202'].games.length,9);
 const reopened=await mf.getDurableObjectNamespace('CONFIG');const raw=await reopened.get(reopened.idFromName('site')).fetch('http://internal/fixture/raw');assert.deepEqual(await raw.json(),saved);
 normalized.config.toys.e88.defaultEntry='e88.5';normalized.config.toys.e88.defaultGame='snake';
 const publish=await mf.dispatchFetch('http://localhost/api/admin/config',{method:'PUT',headers:{Origin:'http://localhost',Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(normalized)});
 assert.equal(publish.status,200);assert.equal((await publish.json()).revision,24);
 const stale=await mf.dispatchFetch('http://localhost/api/admin/config',{method:'PUT',headers:{Origin:'http://localhost',Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(normalized)});assert.equal(stale.status,409);
 console.log('PASS: persistent SQLite DO restart, additive read, unchanged stored legacy snapshot, authenticated publication and stale-revision conflict');
}finally{await mf?.dispose();await rm(persist,{recursive:true,force:true});}
