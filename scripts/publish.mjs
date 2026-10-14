import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname,join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { RenderAPI,REPO_URL,publishRepository,serviceDefinition,ensureService,publicURL,waitDeploy,waitForIdle,redact } from './publish-lib.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
let key='';
async function secret() {
  if(process.env.RENDER_API_KEY)return process.env.RENDER_API_KEY.trim();
  if(!process.stdin.isTTY)throw Error('Ejecuta este comando en tu terminal o define RENDER_API_KEY en el entorno del proceso.');
  process.stdout.write('API key de Render (entrada oculta): ');
  return await new Promise((resolve,reject)=>{
    let value='';process.stdin.setRawMode(true);process.stdin.resume();
    const finish=()=>{process.stdin.off('data',receive);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');};
    const receive=data=>{
      for(const char of data.toString()) {
        if(char==='\u0003'){finish();reject(Error('Cancelado.'));return;}
        if(char==='\r'||char==='\n'){finish();resolve(value.trim());return;}
        if(char==='\u007f'||char==='\b')value=value.slice(0,-1);
        else if(char>=' ')value+=char;
      }
    };
    process.stdin.on('data',receive);
  });
}
async function chooseWorkspace(owners,target) {
  if(target.ownerId) {
    const selected=owners.find(o=>o.id===target.ownerId);
    if(!selected)throw Error('La clave no tiene acceso al workspace solicitado.');
    return selected;
  }
  if(owners.length===1)return owners[0];
  if(!owners.length)throw Error('La cuenta no tiene un workspace disponible.');
  console.log('Selecciona el workspace de Render:');
  owners.forEach((owner,index)=>console.log((index+1)+'. '+owner.name+' ('+owner.id+')'));
  if(!process.stdin.isTTY)throw Error('Define ownerId en .artifacts/publish-target.json para elegir un workspace.');
  const prompt=createInterface({input:process.stdin,output:process.stdout});
  try {
    const selected=owners[Number(await prompt.question('Número: '))-1];
    if(!selected)throw Error('Selección de workspace inválida.');return selected;
  } finally {prompt.close();}
}
async function main() {
  let target={};
  try{target=JSON.parse(await readFile(join(root,'.artifacts','publish-target.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  key=await secret();delete process.env.RENDER_API_KEY;
  if(!key)throw Error('Falta la API key de Render.');
  const api=new RenderAPI(key);
  const user=await api.request('/users');
  if(target.email&&user.email?.toLowerCase()!==target.email.toLowerCase())throw Error('La clave de Render pertenece a otra cuenta.');
  const owner=await chooseWorkspace(await api.list('/owners','owner'),target);
  console.log('Cuenta de Render verificada. Workspace: '+owner.name);
  const publication=await publishRepository(root);
  const receipt={repository:REPO_URL,commit:publication.commit,branch:publication.branch,ownerId:owner.id,status:'repository-published'};
  const save=async()=>{await mkdir(join(root,'.artifacts'),{recursive:true});await writeFile(join(root,'.artifacts','publication.json'),JSON.stringify(receipt,null,2)+'\n');};
  await save();
  const services=await api.list('/services?ownerId='+encodeURIComponent(owner.id),'service');
  const backend=await ensureService(api,serviceDefinition('web_service',owner.id,publication.branch),services);
  const server=backend.service,serverURL=publicURL(server);
  receipt.server={id:server.id,url:serverURL};await save();
  const frontend=await ensureService(api,serviceDefinition('static_site',owner.id,publication.branch,serverURL),services);
  const site=frontend.service,siteURL=publicURL(site);
  receipt.site={id:site.id,url:siteURL};await save();
  // Configure the actual assigned URLs, then deploy those exact settings and commit.
  for(const service of [server,site]) {
    await api.request('/services/'+service.id,'PATCH',{autoDeployTrigger:'off'});
    const definition=serviceDefinition(service.type,owner.id,publication.branch,serverURL);
    for(const variable of definition.envVars) {
      const value=variable.key==='ALLOWED_ORIGINS'?siteURL:variable.value;
      await api.request('/services/'+service.id+'/env-vars/'+variable.key,'PUT',{value});
    }
  }
  await Promise.all([waitForIdle(api,server.id),waitForIdle(api,site.id)]);
  for(const service of [server,site]) {
    const deploy=await api.request('/services/'+service.id+'/deploys','POST',{commitId:publication.commit,clearCache:'do_not_clear'});
    if(!deploy?.id)throw Error('Render no devolvió el despliegue de '+service.name);
    receipt[service.id===server.id?'server':'site'].deployId=deploy.id;await save();
  }
  const completed=await Promise.all([
    waitDeploy(api,server.id,receipt.server.deployId),
    waitDeploy(api,site.id,receipt.site.deployId)
  ]);
  for(const deploy of completed)if(deploy.commit?.id!==publication.commit)throw Error('El despliegue no corresponde al commit publicado.');
  receipt.status='services-live';await save();
  console.log('Servicios activos. Juego: '+siteURL);
  const healthResponse=await fetch(serverURL+'/health',{signal:AbortSignal.timeout(90000)});
  if(!healthResponse.ok)throw Error('El servidor no responde correctamente a /health.');
  const health=await healthResponse.json();if(!health.ok||health.capacity!==2)throw Error('La salud del servidor no coincide con la configuración.');
  const page=await fetch(siteURL,{signal:AbortSignal.timeout(30000)});
  if(!page.ok||!(await page.text()).includes('PokeSoccer'))throw Error('El sitio no muestra el build de PokeSoccer.');
  console.log('Verificando una sala online con dos clientes…');
  const {smokeRoom}=await import('./smoke-room.mjs');
  await smokeRoom(serverURL,siteURL);
  for(const service of [server,site])await api.request('/services/'+service.id,'PATCH',{autoDeployTrigger:'commit'});
  receipt.status='verified';receipt.verifiedAt=new Date().toISOString();await save();
  console.log('\nPUBLICACIÓN VERIFICADA\nJuego: '+siteURL+'\nServidor: '+serverURL+'\nRepositorio: '+REPO_URL);
}
main().catch(error=>{console.error(redact(error.message+(error.cause?.code?' ('+error.cause.code+')':''),key));console.error('Puedes volver a ejecutar node scripts/publish.mjs; el avance queda en .artifacts/publication.json.');process.exitCode=1;});
