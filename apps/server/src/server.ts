import { createServer, type IncomingMessage } from 'node:http';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { WebSocketServer, WebSocket } from 'ws';
import { Game } from '../../../packages/game/src/engine.ts';
import { makePatch, wireState } from '../../../packages/game/src/protocol.ts';
import type { ClientMessage, MatchState, Team } from '../../../packages/game/src/types.ts';

interface Seat { id:string; token:string; socket:WebSocket|null; expires:number; }
interface Room { code:string; game:Game; seats:Map<string,Seat>; previous:MatchState|null; lastActive:number; }
interface Peer { socket:WebSocket; room?:Room; seat?:Seat; count:number; window:number; alive:boolean; }
export interface ServerOptions { maxRooms?:number; allowedOrigins?:string[]; reconnectMs?:number; regulation?:number; overtime?:number }
export function createGameServer(options:ServerOptions={}) {
  const rooms=new Map<string,Room>();
  const maxRooms=options.maxRooms??2,reconnectMs=options.reconnectMs??30000;
  const metrics={ticks:0,maxStepMs:0,snapshots:0,bytes:0,connections:0};
  const http=createServer((req,res)=>{
    if(req.url==='/health') {
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
      res.end(JSON.stringify({ok:true,rooms:rooms.size,capacity:maxRooms,players:[...rooms.values()].reduce((n,r)=>n+r.game.state.humans.filter(h=>h.connected).length,0)}));
    } else {res.writeHead(404,{'content-type':'text/plain'});res.end('PokeSoccer game server');}
  });
  const ws=new WebSocketServer({noServer:true,maxPayload:4096,perMessageDeflate:{threshold:512,serverNoContextTakeover:false,clientNoContextTakeover:true}});
  http.on('upgrade',(req,socket,head)=>{
    const origin=req.headers.origin;
    const allowed=options.allowedOrigins??['http://localhost:5173','http://127.0.0.1:5173'];
    let sameHost=false;
    try{sameHost=!!origin&&new URL(origin).host===req.headers.host;}catch{socket.destroy();return;}
    if(req.url!=='/ws'||ws.clients.size>=32||origin&&!allowed.includes(origin)&&!sameHost) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;
    }
    ws.handleUpgrade(req,socket,head,sock=>ws.emit('connection',sock,req));
  });
  function send(socket:WebSocket,data:unknown) {
    if(socket.readyState!==WebSocket.OPEN)return;
    if(socket.bufferedAmount>256000){socket.close(1013,'Conexión lenta');return;}
    const text=JSON.stringify(data);metrics.bytes+=Buffer.byteLength(text);socket.send(text);
  }
  function snapshot(peer:Peer) {
    if(peer.room&&peer.seat)send(peer.socket,{type:'state',state:wireState(peer.room.game.state),ack:peer.room.game.acks.get(peer.seat.id)??-1,serverAt:Date.now()});
  }
  function attach(peer:Peer,room:Room,seat:Seat) {
    peer.room=room;peer.seat=seat;seat.socket=peer.socket;seat.expires=0;room.lastActive=Date.now();
    // A new client needs the same baseline as existing peers before receiving deltas.
    room.previous=null;
    send(peer.socket,{type:'welcome',id:seat.id,code:room.code,token:seat.token});snapshot(peer);
  }
  function leave(peer:Peer,permanent:boolean) {
    const {room,seat}=peer;if(!room||!seat||seat.socket!==peer.socket)return;
    seat.socket=null;room.lastActive=Date.now();
    if(permanent){room.game.removeHuman(seat.id);room.seats.delete(seat.id);}
    else {seat.expires=Date.now()+reconnectMs;room.game.disconnect(seat.id);}
    peer.room=undefined;peer.seat=undefined;
  }
  ws.on('connection',(socket:WebSocket,_req:IncomingMessage)=>{
    metrics.connections++;
    const peer:Peer={socket,count:0,window:Date.now(),alive:true};
    const helloTimeout=setTimeout(()=>{if(!peer.room)socket.close(1008,'Entra a una sala');},15000);
    socket.on('pong',()=>peer.alive=true);
    socket.on('message',data=>{
      try {
        if(Date.now()-peer.window>1000){peer.window=Date.now();peer.count=0;}
        if(++peer.count>100){socket.close(1008,'Demasiadas solicitudes');return;}
        const message=JSON.parse(data.toString()) as ClientMessage;
        if(!message||typeof message.type!=='string')throw Error('Mensaje inválido.');
        if(message.type==='ping'){send(socket,{type:'pong',at:message.at});return;}
        if(message.type==='leave'){leave(peer,true);socket.close(1000);return;}
        if(['create','join','reconnect'].includes(message.type)&&peer.room)throw Error('Ya estás dentro de una sala.');
        if(message.type==='create') {
          if(rooms.size>=maxRooms)throw Error('Las dos canchas están ocupadas. Prueba más tarde o juega en solitario.');
          let code:string;do{code=randomBytes(4).toString('hex').slice(0,6).toUpperCase();}while(rooms.has(code));
          const game=new Game(randomBytes(4).readUInt32LE(),options.regulation??300,options.overtime??120);
          const room:Room={code,game,seats:new Map(),previous:null,lastActive:Date.now()};
          const seat:Seat={id:randomBytes(8).toString('hex'),token:randomBytes(24).toString('hex'),socket:null,expires:0};
          if(typeof message.name!=='string')throw Error('Apodo inválido.');
          game.addHuman(seat.id,message.name,message.team);room.seats.set(seat.id,seat);rooms.set(code,room);attach(peer,room,seat);return;
        }
        if(message.type==='join') {
          const room=rooms.get(String(message.code).toUpperCase());
          if(!room)throw Error('No encontramos esa sala. Puede haber terminado o reiniciado.');
          if(typeof message.name!=='string')throw Error('Apodo inválido.');
          const seat:Seat={id:randomBytes(8).toString('hex'),token:randomBytes(24).toString('hex'),socket:null,expires:0};
          room.game.addHuman(seat.id,message.name,message.team);room.seats.set(seat.id,seat);attach(peer,room,seat);return;
        }
        if(message.type==='reconnect') {
          const room=rooms.get(String(message.code).toUpperCase());
          const seat=room&&[...room.seats.values()].find(s=>s.token===message.token);
          if(!room||!seat||seat.socket||seat.expires<Date.now()||!room.game.reconnect(seat.id)) {
            send(socket,{type:'error',fatal:true,message:'La reserva expiró o el servidor reinició. Entra otra vez a una sala.'});return;
          }
          seat.token=randomBytes(24).toString('hex');attach(peer,room,seat);return;
        }
        if(!peer.room||!peer.seat)throw Error('Primero entra a una sala.');
        const game=peer.room.game,id=peer.seat.id;
        switch(message.type) {
          case 'input':game.input(id,message.input);break;
          case 'choose':game.choose(id,message.slot,message.species);break;
          case 'team':game.changeTeam(id,message.team);break;
          case 'ready':game.ready(id,message.ready===true);break;
          case 'start':game.start(id);break;
          case 'rematch':game.rematch(id);break;
          default:throw Error('Acción desconocida.');
        }
      } catch(error) {send(socket,{type:'error',message:error instanceof Error?error.message:'No se pudo realizar la acción.'});}
    });
    const heartbeat=setInterval(()=>{if(!peer.alive){socket.terminate();return;}peer.alive=false;socket.ping();},10000);
    socket.on('error',()=>{});
    socket.on('close',()=>{clearTimeout(helloTimeout);clearInterval(heartbeat);leave(peer,false);});
  });
  let last=performance.now(),accumulator=0,snapshotAcc=0;
  const timer=setInterval(()=>{
    const now=performance.now(),elapsed=Math.min(.25,(now-last)/1000);last=now;accumulator+=elapsed;snapshotAcc+=elapsed;
    let steps=0;
    while(accumulator>=1/30&&steps++<6) {
      const start=performance.now();
      for(const room of rooms.values())if([...room.seats.values()].some(s=>s.socket))room.game.step();
      metrics.ticks++;metrics.maxStepMs=Math.max(metrics.maxStepMs,performance.now()-start);accumulator-=1/30;
    }
    if(snapshotAcc>=.05) {
      snapshotAcc%=.05;
      for(const room of rooms.values()) {
        const state=wireState(room.game.state);
        const patch=room.previous?makePatch(room.previous,state):null;
        for(const seat of room.seats.values())if(seat.socket) {
          send(seat.socket,patch?{type:'patch',patch,ack:room.game.acks.get(seat.id)??-1,serverAt:Date.now()}:
            {type:'state',state,ack:room.game.acks.get(seat.id)??-1,serverAt:Date.now()});
        }
        room.previous=state;metrics.snapshots++;
      }
    }
    for(const room of rooms.values()) {
      for(const seat of room.seats.values())if(!seat.socket&&seat.expires<Date.now()){room.game.removeHuman(seat.id);room.seats.delete(seat.id);}
      if(room.seats.size===0)rooms.delete(room.code);
    }
  },8);
  return {http,ws,rooms,metrics,
    listen:async(port=2567,host='127.0.0.1')=>await new Promise<number>(resolve=>http.listen(port,host,()=>resolve((http.address() as {port:number}).port))),
    close:async()=>{clearInterval(timer);for(const client of ws.clients)client.terminate();await new Promise<void>(resolve=>ws.close(()=>resolve()));await new Promise<void>(resolve=>http.close(()=>resolve()));}
  };
}
