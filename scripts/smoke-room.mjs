import { WebSocket } from 'ws';
import { applyPatch } from '../packages/game/src/protocol.ts';
import { emptyInput } from '../packages/game/src/state.ts';
export async function smokeRoom(serverURL,origin) {
  const sockets=[],peers=[];
  const until=async(test,timeout=15000)=>{const start=Date.now();while(!test()){
    const error=peers.flatMap(p=>p.errors)[0];if(error)throw Error(error);
    if(Date.now()-start>timeout)throw Error('La comprobación online agotó el tiempo de espera.');
    await new Promise(r=>setTimeout(r,50));
  }};
  async function connect(message) {
    const url=new URL('/ws',serverURL);url.protocol=url.protocol==='https:'?'wss:':'ws:';
    const socket=new WebSocket(url,{origin,handshakeTimeout:30000}),peer={socket,id:'',code:'',state:null,ack:-1,errors:[]};
    sockets.push(socket);peers.push(peer);
    socket.on('error',error=>peer.errors.push(error.message));
    socket.on('message',data=>{
      try {
        const m=JSON.parse(data.toString());
        if(m.type==='welcome'){peer.id=m.id;peer.code=m.code;}
        if(m.type==='state')peer.state=m.state;
        if(m.type==='patch'&&peer.state)applyPatch(peer.state,m.patch);
        if(m.type==='state'||m.type==='patch')peer.ack=m.ack;
        if(m.type==='error')peer.errors.push(m.message);
      }catch(error){peer.errors.push(error.message);}
    });
    await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
    socket.send(JSON.stringify(message));await until(()=>!!peer.state);return peer;
  }
  const send=(peer,message)=>peer.socket.send(JSON.stringify(message));
  try {
    const a=await connect({type:'create',name:'Prueba de despliegue A',team:0});
    const b=await connect({type:'join',code:a.code,name:'Prueba de despliegue B',team:1});
    send(a,{type:'ready',ready:true});send(b,{type:'ready',ready:true});
    await until(()=>a.state.humans.filter(h=>h.connected).length===2&&a.state.humans.every(h=>h.ready));
    send(a,{type:'start'});await until(()=>peers.every(p=>p.state.phase==='playing'));
    const fighter=a.state.players.find(p=>p.controller===a.id),before=fighter.x;
    for(let seq=1;seq<=18;seq++){
      send(a,{type:'input',input:{...emptyInput(fighter.epoch,seq),moveX:1}});
      await new Promise(r=>setTimeout(r,1000/30));
    }
    send(a,{type:'input',input:emptyInput(fighter.epoch,19)});
    await until(()=>a.ack>=19);
    if(a.state.players.find(p=>p.controller===a.id).x<=before+1)throw Error('Los controles online no movieron al personaje.');
    if(peers.some(p=>p.state.players.length!==10||p.state.players.some(q=>q.keeper&&q.controller)))throw Error('Composición de equipos inválida.');
  } finally {
    for(const socket of sockets) {
      if(socket.readyState===WebSocket.OPEN) {
        await new Promise(resolve=>{
          const timer=setTimeout(()=>{socket.terminate();resolve();},1500);
          socket.once('close',()=>{clearTimeout(timer);resolve();});
          socket.send(JSON.stringify({type:'leave'}));socket.close();
        });
      } else socket.terminate();
    }
  }
}
