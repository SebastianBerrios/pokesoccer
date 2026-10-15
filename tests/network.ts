import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../apps/server/src/server.ts';
import { catchBall } from '../packages/game/src/ball.ts';
import { emptyInput, controlled } from '../packages/game/src/state.ts';
import { applyPatch } from '../packages/game/src/protocol.ts';
import type { MatchState } from '../packages/game/src/types.ts';
const server=createGameServer({maxRooms:2,reconnectMs:500});
const port=await server.listen(0);
const clients:WebSocket[]=[];
async function client(message:unknown) {
  const socket=new WebSocket('ws://127.0.0.1:'+port+'/ws');clients.push(socket);
  const result={socket,id:'',code:'',token:'',state:null as MatchState|null,error:'',ack:-1};
  socket.on('message',data=>{
    const m=JSON.parse(data.toString());
    if(m.type==='welcome')Object.assign(result,{id:m.id,code:m.code,token:m.token});
    if(m.type==='state')result.state=m.state;
    if(m.type==='patch'&&result.state)applyPatch(result.state,m.patch);
    if(m.type==='error')result.error=m.message;
    if(m.type==='state'||m.type==='patch')result.ack=m.ack;
  });
  await new Promise<void>((resolve,reject)=>{socket.once('open',()=>{socket.send(JSON.stringify(message));resolve();});socket.once('error',reject);});
  await until(()=>!!result.state||!!result.error);
  return result;
}
async function until(fn:()=>boolean,timeout=3000) {
  const start=Date.now();
  while(!fn()){if(Date.now()-start>timeout)throw Error('Timed out waiting for network state');await new Promise(r=>setTimeout(r,20));}
}
const send=(socket:WebSocket,m:unknown)=>socket.send(JSON.stringify(m));
try {
  const a=await client({type:'create',name:'Ana',team:0});
  assert.equal(a.state!.players.length,10);
  const b=await client({type:'join',code:a.code,name:'Bruno',team:1});
  send(a.socket,{type:'ready',ready:true});send(b.socket,{type:'ready',ready:true});
  await until(()=>a.state!.humans.every(h=>h.ready));
  send(b.socket,{type:'configure',settings:{pace:'fast',difficulty:'hard'}});
  await until(()=>!!b.error);assert.match(b.error,/anfitrión/);
  send(a.socket,{type:'configure',settings:{pace:'slow',difficulty:'easy'}});
  await until(()=>a.state!.settings.pace==='slow'&&b.state!.settings.difficulty==='easy');
  assert.ok(a.state!.humans.every(h=>!h.ready));
  send(a.socket,{type:'ready',ready:true});send(b.socket,{type:'ready',ready:true});
  await until(()=>a.state!.humans.every(h=>h.ready));
  send(a.socket,{type:'start'});await until(()=>a.state!.phase==='kickoff');
  await until(()=>a.state!.phase==='playing',5000);
  const c=await client({type:'join',code:a.code,name:'Carla',team:0});
  assert.equal(c.state!.phase,'playing');assert.deepEqual(c.state!.settings,{pace:'slow',difficulty:'easy'});
  send(a.socket,{type:'configure',settings:{pace:'fast',difficulty:'normal'}});
  await until(()=>!!a.error);assert.match(a.error,/lobby/);
  send(c.socket,{type:'input',input:emptyInput(controlled(c.state!,c.id)!.epoch,9000)});
  await until(()=>c.ack===9000);
  const before=c.state!.humans.find(h=>h.id===c.id)!.fighterId;
  c.socket.terminate();await until(()=>a.state!.players.find(p=>p.id===before)!.controller===null);
  const re=await client({type:'reconnect',code:c.code,token:c.token});
  assert.equal(re.id,c.id);assert.ok(re.state!.players.some(p=>p.controller===re.id));assert.notEqual(re.token,c.token);
  send(re.socket,{type:'input',input:emptyInput(controlled(re.state!,re.id)!.epoch,1)});
  await until(()=>re.ack===1);
  assert.deepEqual(re.state!.settings,{pace:'slow',difficulty:'easy'});
  const full=[a,b,re];
  for(const team of [0,0,1,1,1])full.push(await client({type:'join',code:a.code,name:'Equipo completo',team}));
  await until(()=>a.state!.humans.length===8);
  const game=server.rooms.get(a.code)!.game,s=game.state;
  const original=controlled(s,a.id)!,receiver=controlled(s,re.id)!,oldEpoch=original.epoch;
  s.players.filter(p=>p.team===0&&!p.keeper).forEach((p,i)=>{p.x=-8;p.z=i%2?12:-12;});
  original.x=-27;original.z=0;receiver.x=-14;receiver.z=0;
  const keeper=s.players.find(p=>p.keeper&&p.team===0)!;catchBall(s,keeper);
  original.x=-26;original.z=10;
  await until(()=>controlled(a.state!,a.id)?.keeper===true&&full.every(c=>!!c.state!.keeperPossession));
  send(a.socket,{type:'input',input:emptyInput(oldEpoch,500)});
  await new Promise(r=>setTimeout(r,80));assert.notEqual(a.ack,500);
  send(a.socket,{type:'input',input:emptyInput(keeper.epoch,501)});await until(()=>a.ack===501);
  send(a.socket,{type:'input',input:{...emptyInput(keeper.epoch,502),moveX:1,pass:true}});
  await until(()=>a.state!.keeperPossession===null);
  assert.equal(controlled(a.state!,a.id)!.id,original.id);assert.equal(controlled(re.state!,re.id)!.id,receiver.id);
  assert.equal(a.state!.players.filter(p=>p.controller).length,8);
  assert.ok(a.state!.players.filter(p=>p.keeper).every(p=>p.controller===null));
  const bad=await client({type:'reconnect',code:c.code,token:c.token});assert.match(bad.error,/expiró/);
  const room2=await client({type:'create',name:'Dos',team:0});assert.ok(room2.code);
  const overflow=await client({type:'create',name:'Tres',team:0});assert.match(overflow.error,/ocupadas/);
  const still=server.rooms.get(a.code)!.game.state;
  send(a.socket,{type:'input',input:{seq:1,epoch:99999,moveX:999999,moveZ:0}});
  await new Promise(r=>setTimeout(r,100));assert.ok(still.players.every(p=>Number.isFinite(p.x)));
  a.socket.terminate();await until(()=>b.state!.host===b.id);
  console.log('PASS: host settings, readiness invalidation, lobby-only configuration, settings on join/reconnect, full-team keeper release and stale inputs; create, join, ready, start, late join, bot takeover, reconnect, token rotation, host transfer, room capacity, invalid input.');
  console.log(JSON.stringify(server.metrics));
} finally {for(const socket of clients)socket.terminate();await server.close();}
