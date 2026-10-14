import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {RenderAPI,serviceDefinition,ensureService,checkExisting,waitDeploy,waitForIdle,sourceFiles,redact,REPO_URL} from '../scripts/publish-lib.mjs';
import {createGameServer} from '../apps/server/src/server.ts';
import {smokeRoom} from '../scripts/smoke-room.mjs';

test('el único servidor solicitado es Free en Virginia y no contiene credenciales',()=>{
  const definition=serviceDefinition('web_service','tea-example','main');
  assert.equal(definition.repo,REPO_URL);assert.equal(definition.serviceDetails.plan,'free');
  assert.equal(definition.serviceDetails.region,'virginia');assert.equal(definition.serviceDetails.numInstances,1);
  assert.ok(!definition.envVars.some(v=>/KEY|TOKEN/.test(v.key)));
  assert.throws(()=>serviceDefinition('postgres','tea-example','main'),/no autorizado/);
  assert.throws(()=>serviceDefinition('static_site','tea-example','main'),/URL/);
});
test('el frontend recibe la URL pública real y publica el directorio del build',()=>{
  const definition=serviceDefinition('static_site','tea-example','main','https://server-unique.onrender.com');
  assert.equal(definition.envVars.find(e=>e.key==='VITE_SERVER_URL').value,'https://server-unique.onrender.com');
  assert.equal(definition.serviceDetails.publishPath,'apps/client/dist');
});
test('reanudar reutiliza el servicio y rechaza recursos ajenos o de pago',async()=>{
  const definition=serviceDefinition('web_service','tea-example','main');
  const service={...definition,id:'srv-test',suspended:'not_suspended'};
  const calls=[];const api={request:async(...args)=>{calls.push(args);throw Error('No debería crear');}};
  const result=await ensureService(api,definition,[service],()=>{});
  assert.equal(result.service.id,service.id);assert.equal(calls.length,0);
  assert.throws(()=>checkExisting({...service,rootDir:'another-app'},definition),/configuración/);
  assert.throws(()=>checkExisting({...service,repo:'https://github.com/another/project'},definition),/No se modificó/);
  assert.throws(()=>checkExisting({...service,serviceDetails:{...service.serviceDetails,plan:'starter'}},definition),/Free/);
});
test('API autentica solo solicitudes a Render y oculta la clave en errores',async()=>{
  const key='rnd_'+'x'.repeat(25),requests=[];
  const api=new RenderAPI(key,async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify({message:key}),{status:401});});
  await assert.rejects(api.request('/users'),error=>!error.message.includes(key)&&error.message.includes('[oculto]'));
  assert.equal(requests[0].url,'https://api.render.com/v1/users');
  assert.equal(requests[0].options.headers.Authorization,'Bearer '+key);
  await assert.rejects(api.request('//untrusted.example'),/inválida/);assert.equal(requests.length,1);
});
test('un requisito de pago detiene el flujo sin contratar otro plan',async()=>{
  const api=new RenderAPI('test-key',async()=>new Response('{}',{status:402}));
  await assert.rejects(api.request('/services','POST',{}),/sin contratar un plan/);
});
test('espera live y nunca confunde un fallo de build con publicación',async()=>{
  let count=0;
  const result=await waitDeploy({request:async()=>++count===1?{status:'build_in_progress'}:{status:'live',commit:{id:'123'}}},
    'srv-test','dep-test',{log:()=>{},sleep:async()=>{}});
  assert.equal(result.commit.id,'123');
  await assert.rejects(waitDeploy({request:async()=>({status:'build_failed'})},'srv-test','dep-test',{log:()=>{}}),/build_failed/);
});
test('solo publica fuentes; excluye secretos, artefactos y dependencias',async()=>{
  const artifacts=resolve('.artifacts');await mkdir(artifacts,{recursive:true});
  const fixture=await mkdtemp(join(artifacts,'publish-files-test-'));
  try {
    for(const file of ['.gitignore','.env.example','.node-version','README.md','package.json','package-lock.json','tsconfig.json','vitest.config.ts','playwright.config.ts','render.yaml'])await writeFile(join(fixture,file),'');
    for(const folder of ['apps/client/node_modules','apps/client/dist','packages','scripts','tests','docs','.artifacts'])await mkdir(join(fixture,folder),{recursive:true});
    await writeFile(join(fixture,'apps/client/main.ts'),'export {};');
    await writeFile(join(fixture,'apps/client/.env'),'PRIVATE=yes');
    await writeFile(join(fixture,'apps/client/node_modules/dep.js'),'dependency');
    await writeFile(join(fixture,'apps/client/dist/bundle.js'),'build');
    await writeFile(join(fixture,'.artifacts/private.json'),'private');
    const paths=await sourceFiles(fixture);
    assert.ok(paths.includes('apps/client/main.ts'));assert.ok(paths.includes('.env.example'));
    assert.ok(!paths.some(p=>/node_modules|dist\/|\.artifacts|client\/\.env/.test(p)));
    await writeFile(join(fixture,'apps/client/main.ts'),'rnd_'+'a'.repeat(25));
    await assert.rejects(sourceFiles(fixture),/Posible credencial/);
  } finally {
    assert.ok(resolve(fixture).startsWith(artifacts+sep));await rm(fixture,{recursive:true,force:true});
  }
});
test('la comprobación de despliegue juega con dos clientes y limpia su sala',async()=>{
  const server=createGameServer(),port=await server.listen(0);
  try {
    await smokeRoom('http://127.0.0.1:'+port,'http://127.0.0.1:'+port);
    await new Promise(r=>setTimeout(r,50));assert.equal(server.rooms.size,0);
  } finally {await server.close();}
});

test('espera despliegues previos sin cancelarlos y permite recuperar un build fallido',async()=>{
  const states=['build_in_progress','queued','update_in_progress','build_failed'];let calls=0;
  await waitForIdle({request:async(path,method)=>{
    assert.equal(method,undefined);assert.match(path,/deploys\?limit=20$/);
    return [{deploy:{id:'dep-existing',status:states[calls++]}}];
  }},'srv-test',{log:()=>{},sleep:async()=>{}});
  assert.equal(calls,4);
  await assert.rejects(waitForIdle({request:async()=>[]},'srv-test',{timeoutMs:0,log:()=>{}}),/sigue ocupado/);
});
