import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../apps/server/src/server.ts';
import { applyPatch } from '../packages/game/src/protocol.ts';
import { emptyInput } from '../packages/game/src/state.ts';
import type { MatchState, Team } from '../packages/game/src/types.ts';

const server=createGameServer({maxRooms:2,regulation:3,overtime:2});
const port=await server.listen(0);
const clients:Peer[]=[],timers=new Set<ReturnType<typeof setTimeout>>();
let sending:ReturnType<typeof setInterval>|undefined;
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until(fn:()=>boolean,timeout=35000) {
  const start=Date.now();while(!fn()){assert.ok(Date.now()-start<timeout,'Timed out');await wait(20);}
}
function delayed(fn:()=>void,ms:number) {
  const timer=setTimeout(()=>{timers.delete(timer);fn();},ms);timers.add(timer);
}
class Peer {
  socket=new WebSocket('ws://127.0.0.1:'+port+'/ws');
  id='';code='';state:MatchState|null=null;seq=0;ack=-1;frames=0;maxAckMs=0;maxPingMs=0;
  errors:string[]=[];sent=new Map<number,number>();phases=new Set<string>();
  delay:number;
  constructor(delay:number) {
    this.delay=delay;
    this.socket.on('error',error=>this.errors.push(error.message));
    this.socket.on('message',data=>delayed(()=>{
      const m=JSON.parse(data.toString());
      if(m.type==='welcome'){this.id=m.id;this.code=m.code;}
      if(m.type==='state')this.state=m.state;
      if(m.type==='patch'&&this.state)applyPatch(this.state,m.patch);
      if(m.type==='error')this.errors.push(m.message);
      if(m.type==='pong')this.maxPingMs=Math.max(this.maxPingMs,Date.now()-m.at);
      if(m.type==='state'||m.type==='patch') {
        this.frames++;this.ack=m.ack;this.phases.add(this.state!.phase);
        const at=this.sent.get(m.ack);if(at)this.maxAckMs=Math.max(this.maxAckMs,Date.now()-at);
        for(const seq of this.sent.keys())if(seq<=m.ack)this.sent.delete(seq);
      }
    },this.delay));
  }
  send(message:unknown) {delayed(()=>{if(this.socket.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(message));},this.delay);}
}
async function peer(message:unknown,index:number) {
  const p=new Peer([50,75,100][index%3]);clients.push(p);
  await new Promise<void>(resolve=>p.socket.once('open',()=>resolve()));
  p.send(message);await until(()=>!!p.state||p.errors.length>0,5000);assert.deepEqual(p.errors,[]);return p;
}
try {
  const start=Date.now();
  for(let room=0;room<2;room++) {
    const host=await peer({type:'create',name:'Host '+room,team:0},clients.length);
    for(let n=1;n<8;n++)await peer({type:'join',code:host.code,name:'Jugador '+room+'-'+n,team:(n<4?0:1) as Team},clients.length);
  }
  assert.equal(server.rooms.size,2);
  for(const room of server.rooms.values())for(const p of room.game.state.players)if(!p.keeper){p.normal=100;p.special=100;p.item='bomb';}
  for(const p of clients)p.send({type:'ready',ready:true});
  await until(()=>clients.every(p=>p.state!.humans.length===8&&p.state!.humans.every(h=>h.ready)));
  clients[0].send({type:'start'});clients[8].send({type:'start'});
  sending=setInterval(()=>{
    for(const [i,p] of clients.entries()) {
      const s=p.state;if(!s||!['playing','overtime'].includes(s.phase))continue;
      const fighter=s.players.find(q=>q.controller===p.id)!;
      const angle=(p.seq/25)+i,seq=++p.seq;
      const input={...emptyInput(fighter.epoch,seq),moveX:Math.cos(angle),moveZ:Math.sin(angle),
        sprint:seq%60<20,shoot:seq%45<15,pass:seq%30===0,lob:seq%31===0,
        simple:seq%50===4,normal:seq%70===8,special:seq===12,item:seq===40,dodge:seq%65===0};
      p.sent.set(seq,Date.now());p.send({type:'input',input});
      if(seq%30===1)p.send({type:'ping',at:Date.now()});
    }
  },1000/30);
  await until(()=>clients.every(p=>p.state!.phase==='finished'));
  clearInterval(sending);
  for(const p of clients) {
    assert.deepEqual(p.errors,[]);assert.ok(p.ack>10,'Server acknowledged input');
    assert.ok(p.maxPingMs>=p.delay*2&&p.maxPingMs<1000,'Round-trip latency remained bounded');
    assert.ok(p.frames>200,'Received continuous snapshots');
    assert.ok(p.phases.has('halftime'),'Observed halftime');
    const s=p.state!,authority=server.rooms.get(p.code)!.game.state;
    assert.deepEqual(s.score,authority.score);assert.equal(s.winner,authority.winner);
    assert.equal(s.players.length,10);assert.ok(s.players.every(q=>Number.isFinite(q.x)&&Number.isFinite(q.z)));
    assert.equal(s.players.filter(q=>q.keeper&&q.controller!==null).length,0);
    for(const h of s.humans)assert.equal(s.players.filter(q=>q.controller===h.id).length,1);
  }
  await wait(250);clients[0].send({type:'rematch'});clients[8].send({type:'rematch'});
  await until(()=>clients.every(p=>p.state!.phase==='lobby'));
  for(const p of clients) {
    assert.deepEqual(p.state!.score,[0,0]);assert.ok(p.state!.humans.every(h=>!h.ready));
    assert.ok(p.state!.players.every(q=>q.special===0&&q.normal===0));
    p.send({type:'ready',ready:true});
  }
  await until(()=>clients.every(p=>p.state!.humans.every(h=>h.ready)));
  clients[0].send({type:'start'});clients[8].send({type:'start'});
  await until(()=>clients.every(p=>p.state!.phase==='kickoff'));
  const seconds=(Date.now()-start)/1000;
  console.log('PASS: 16 clients, 2 complete rooms, simulated 100/150/200 ms RTT, halftime, final-score agreement, rematch and restart.');
  console.log(JSON.stringify({...server.metrics,seconds,maxRoundTripMs:Math.max(...clients.map(p=>p.maxPingMs)),
    uncompressedKBpsPerClient:Math.round(server.metrics.bytes/seconds/16/1024*10)/10}));
  assert.ok(server.metrics.maxStepMs<33.3,'Two-room simulation fits a 30 Hz tick on this machine');
} finally {
  clearInterval(sending);for(const timer of timers)clearTimeout(timer);
  for(const p of clients)p.socket.terminate();await server.close();
}
