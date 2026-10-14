import { readFile, readdir, mkdir, mkdtemp, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';

export const REPOSITORY='SebastianBerrios/pokesoccer';
export const REPO_URL='https://github.com/'+REPOSITORY;
const ROOT_FILES=['.gitignore','.env.example','.node-version','README.md','package.json','package-lock.json','tsconfig.json','vitest.config.ts','playwright.config.ts','render.yaml'];
const SOURCE_DIRS=['apps','packages','scripts','tests','docs'];
const OMIT=new Set(['node_modules','dist','.git','.artifacts','.agents','.claude']);

export function redact(text,secret='') {
  let result=String(text);
  if(secret)result=result.split(secret).join('[oculto]');
  return result.replace(/(?:rnd_|gh[pousr]_)[A-Za-z0-9_]{15,}/g,'[oculto]');
}
export async function sourceFiles(root) {
  const paths=[...ROOT_FILES];
  async function walk(relative) {
    for(const entry of await readdir(join(root,relative),{withFileTypes:true})) {
      if(OMIT.has(entry.name)||entry.name.startsWith('.')||entry.name.endsWith('.log'))continue;
      const file=relative+'/'+entry.name;
      if(entry.isSymbolicLink())throw Error('No se publican enlaces simbólicos: '+file);
      if(entry.isDirectory())await walk(file);else if(entry.isFile())paths.push(file);
    }
  }
  for(const folder of SOURCE_DIRS)await walk(folder);
  for(const path of paths) {
    const content=await readFile(join(root,path),'utf8');
    if(/(?:rnd_|gh[pousr]_)[A-Za-z0-9_]{15,}/.test(content))throw Error('Posible credencial en '+path+'. Publicación detenida.');
  }
  return paths.sort();
}
export async function command(file,args,{cwd,env=process.env}={}) {
  const childEnv={...env};delete childEnv.RENDER_API_KEY;
  return await new Promise((resolve,reject)=>execFile(file,args,{
    cwd,env:childEnv,windowsHide:true,timeout:120000,maxBuffer:4*1024*1024
  },(error,stdout,stderr)=>{
    if(error){const failure=Error(redact(file+' falló: '+stderr.trim()));failure.code=error.code;reject(failure);}
    else resolve(stdout.trim());
  }));
}
export class RenderAPI {
  constructor(key,fetcher=fetch) {this.key=key;this.fetcher=fetcher;}
  async request(path,method='GET',body) {
    if(!path.startsWith('/')||path.startsWith('//'))throw Error('Ruta de API inválida.');
    const response=await this.fetcher('https://api.render.com/v1'+path,{
      method,redirect:'error',signal:AbortSignal.timeout(30000),
      headers:{Authorization:'Bearer '+this.key,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    const text=await response.text();
    if(!response.ok) {
      const detail=response.status===402?'Render exige información de pago; se detuvo sin contratar un plan.':text.slice(0,1200);
      throw Error(redact('Render HTTP '+response.status+': '+detail,this.key));
    }
    return text?JSON.parse(text):null;
  }
  async list(path,field) {
    const results=[];let cursor='';
    for(let page=0;page<100;page++) {
      const entries=await this.request(path+(path.includes('?')?'&':'?')+'limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));
      if(!Array.isArray(entries))throw Error('Respuesta paginada inesperada de Render.');
      results.push(...entries.map(entry=>entry[field]));
      if(entries.length<100)return results;
      const next=entries.at(-1)?.cursor;if(!next||next===cursor)throw Error('Cursor inválido de Render.');cursor=next;
    }
    throw Error('Demasiadas páginas en Render.');
  }
}
export function serviceDefinition(type,ownerId,branch,serverURL='') {
  const base={type,name:type==='web_service'?'pokesoccer-server':'pokesoccer-web',ownerId,
    repo:REPO_URL,branch,autoDeployTrigger:'off',
    envVars:[{key:'NODE_VERSION',value:'24.21.0'},{key:'SKIP_INSTALL_DEPS',value:'true'}]};
  if(type==='web_service') {
    base.envVars.push({key:'NODE_ENV',value:'production'},{key:'MAX_ROOMS',value:'2'},
      {key:'HOST',value:'0.0.0.0'},{key:'ALLOWED_ORIGINS',value:''});
    base.serviceDetails={runtime:'node',plan:'free',region:'virginia',numInstances:1,healthCheckPath:'/health',
      envSpecificDetails:{buildCommand:'npm ci --omit=dev --ignore-scripts',startCommand:'npm start'}};
  } else if(type==='static_site') {
    if(!serverURL)throw Error('Falta la URL pública del servidor.');
    base.envVars.push({key:'VITE_SERVER_URL',value:serverURL});
    base.serviceDetails={buildCommand:'npm ci --include=dev --ignore-scripts && npm run build',publishPath:'apps/client/dist',
      headers:[{path:'/assets/*',name:'Cache-Control',value:'public, max-age=31536000, immutable'},{path:'/*',name:'X-Content-Type-Options',value:'nosniff'}]};
  } else throw Error('Tipo de servicio no autorizado.');
  return base;
}
export function checkExisting(service,definition) {
  const normalize=url=>String(url).replace(/\.git$/,'').replace(/\/$/,'');
  if(service.ownerId!==definition.ownerId||service.type!==definition.type||normalize(service.repo)!==REPO_URL)
    throw Error('Existe '+definition.name+' con otro propietario, repositorio o tipo. No se modificó.');
  if(service.type==='web_service'&&(service.serviceDetails?.plan!=='free'||service.serviceDetails?.region!=='virginia'))
    throw Error('El servidor existente no es Free en Virginia. No se modificó.');
  if(service.branch&&service.branch!==definition.branch)throw Error('La rama del servicio existente no coincide. No se modificó.');
  if(service.suspended==='suspended')throw Error('El servicio existente está suspendido. Revisa Render antes de continuar.');
  const actual=service.serviceDetails,expected=definition.serviceDetails;
  const differentRoot=service.rootDir&&!['.','./'].includes(service.rootDir);
  const differentBuild=service.type==='web_service'
    ? actual.runtime!==expected.runtime||actual.numInstances!==1||actual.healthCheckPath!==expected.healthCheckPath||
      actual.envSpecificDetails?.buildCommand!==expected.envSpecificDetails.buildCommand||actual.envSpecificDetails?.startCommand!==expected.envSpecificDetails.startCommand
    : actual.buildCommand!==expected.buildCommand||actual.publishPath!==expected.publishPath;
  if(differentRoot||differentBuild)throw Error('La configuración de '+service.name+' no coincide con este proyecto. No se modificó.');
}
export async function ensureService(api,definition,services,log=console.log) {
  const matches=services.filter(s=>s.name===definition.name);
  if(matches.length>1)throw Error('Hay más de un servicio con el nombre '+definition.name);
  if(matches[0]){checkExisting(matches[0],definition);log('Reutilizando '+definition.name);return {service:matches[0]};}
  log('Creando '+definition.name+(definition.type==='web_service'?' (Free, Virginia)':' (estático)'));
  const result=await api.request('/services','POST',definition);
  if(!result?.service?.id)throw Error('Render no devolvió el identificador del servicio.');
  services.push(result.service);return result;
}
export function publicURL(service) {
  const url=new URL(service.serviceDetails?.url);
  if(url.protocol!=='https:'||!url.hostname.endsWith('.onrender.com')||url.username||url.password)
    throw Error('URL pública inesperada de '+service.name);
  return url.origin;
}
export async function waitForIdle(api,serviceId,{log=console.log,sleep=ms=>new Promise(r=>setTimeout(r,ms)),timeoutMs=20*60*1000}={}) {
  const active=new Set(['created','queued','build_in_progress','pre_deploy_in_progress','update_in_progress']);
  const start=Date.now();let announced=false;
  while(Date.now()-start<timeoutMs) {
    const entries=await api.request('/services/'+serviceId+'/deploys?limit=20');
    if(!Array.isArray(entries))throw Error('Respuesta inesperada al consultar despliegues.');
    if(!entries.some(entry=>active.has(entry.deploy?.status)))return;
    if(!announced){log('Esperando el despliegue anterior de '+serviceId+'…');announced=true;}
    await sleep(5000);
  }
  throw Error('Render sigue ocupado con un despliegue anterior de '+serviceId+'. Vuelve a ejecutar el comando cuando termine.');
}
export async function waitDeploy(api,serviceId,deployId,{log=console.log,sleep=ms=>new Promise(r=>setTimeout(r,ms)),timeoutMs=20*60*1000}={}) {
  const start=Date.now();let previous='';
  while(Date.now()-start<timeoutMs) {
    const deploy=await api.request('/services/'+serviceId+'/deploys/'+deployId);
    if(deploy.status!==previous){log(serviceId+': '+deploy.status);previous=deploy.status;}
    if(deploy.status==='live')return deploy;
    if(['build_failed','update_failed','pre_deploy_failed','canceled','deactivated'].includes(deploy.status))
      throw Error('Despliegue '+deployId+' terminó en '+deploy.status+'. Revisa https://dashboard.render.com/web/'+serviceId);
    await sleep(5000);
  }
  throw Error('El despliegue sigue pendiente tras 20 minutos: '+deployId+'. No se canceló.');
}
export async function publishRepository(root,log=console.log) {
  const gh=(...args)=>command('gh',args,{cwd:root});
  const user=JSON.parse(await gh('api','user'));
  if(user.login.toLowerCase()!=='sebastianberrios')throw Error('GitHub CLI debe usar la cuenta SebastianBerrios.');
  let repository;
  try{repository=JSON.parse(await gh('api','repos/'+REPOSITORY));}
  catch(error) {
    if(!/HTTP 404/.test(error.message))throw error;
    log('Creando el repositorio privado '+REPOSITORY);
    await gh('repo','create',REPOSITORY,'--private','--description','Fútbol arcade en navegador con Pokémon y salas privadas.');
    repository=JSON.parse(await gh('api','repos/'+REPOSITORY));
  }
  if(!repository.permissions?.push)throw Error('La sesión de GitHub no tiene permiso de escritura en '+REPOSITORY);
  const branch=repository.default_branch||'main',files=await sourceFiles(root);
  await mkdir(join(root,'.artifacts'),{recursive:true});
  const checkout=await mkdtemp(join(root,'.artifacts','publish-'));
  const git=(...args)=>command('git',['-c','credential.helper=','-c','credential.helper=!gh auth git-credential',...args],{cwd:checkout});
  log('Preparando copia de publicación en '+checkout);
  await git('clone',REPO_URL+'.git','.');
  let hasHead=true;try{await git('rev-parse','--verify','HEAD');}catch{hasHead=false;}
  if(hasHead) {
    await git('checkout',branch);
    try {
      const existing=JSON.parse(await readFile(join(checkout,'package.json'),'utf8'));
      if(existing.name!=='pokesoccer')throw Error('El repositorio contiene otro proyecto; no se sobrescribió.');
    }catch(error){if(error.code!=='ENOENT')throw error;}
  } else await git('checkout','-b',branch);
  for(const file of files) {
    const dest=join(checkout,file);await mkdir(dirname(dest),{recursive:true});
    if(file==='.gitignore'&&hasHead) {
      let prior='';try{prior=await readFile(dest,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
      const {writeFile}=await import('node:fs/promises');
      const combined=new Set((prior+'\n'+await readFile(join(root,file),'utf8')).split(/\r?\n/).filter(Boolean));
      await writeFile(dest,[...combined].join('\n')+'\n');
    } else await copyFile(join(root,file),dest);
  }
  await git('add','--',...files);
  const changed=await git('diff','--cached','--name-only');
  if(changed) {
    const name=user.name||user.login,email=user.id+'+'+user.login+'@users.noreply.github.com';
    await git('-c','user.name='+name,'-c','user.email='+email,'commit','-m','Implement playable PokeSoccer browser game and free deployment');
    await git('push','origin','HEAD:refs/heads/'+branch);
  }
  const commit=await git('rev-parse','HEAD');
  const remote=await git('ls-remote','origin','refs/heads/'+branch);
  if(remote.split(/\s+/)[0]!==commit)throw Error('No se pudo verificar el commit publicado.');
  log('GitHub verificado: '+REPO_URL+'/commit/'+commit);
  return {branch,commit,checkout,files:files.length};
}
