/// <reference lib="webworker" />
import { Game } from '../../../packages/game/src/engine.ts';
import type { ClientMessage } from '../../../packages/game/src/types.ts';
const game=new Game(Math.floor(Math.random()*0xffffffff));
let paused=false,acc=0,last=performance.now(),snap=0;
self.onmessage=(event:MessageEvent<ClientMessage|{type:'pause',value:boolean}>)=>{
  const msg=event.data;
  try {
    if(msg.type==='create') {game.addHuman('local',msg.name,msg.team);postMessage({type:'welcome',id:'local',code:'',token:''});}
    else if(msg.type==='input')game.input('local',msg.input);
    else if(msg.type==='choose')game.choose('local',msg.slot,msg.species);
    else if(msg.type==='team')game.changeTeam('local',msg.team);
    else if(msg.type==='configure')game.configure('local',msg.settings);
    else if(msg.type==='ready')game.ready('local',msg.ready);
    else if(msg.type==='start')game.start('local');
    else if(msg.type==='rematch')game.rematch('local');
    else if(msg.type==='pause')paused=msg.value;
    if(msg.type!=='input')postMessage({type:'state',state:game.state,ack:game.acks.get('local')??-1});
  }catch(error){postMessage({type:'error',message:error instanceof Error?error.message:'No se pudo realizar la acción.'});}
};
setInterval(()=>{
  const now=performance.now(),dt=Math.min(.2,(now-last)/1000);last=now;
  if(paused){acc=0;return;}acc+=dt;snap+=dt;
  while(acc>=1/30){game.step();acc-=1/30;}
  if(snap>=.05){snap%=.05;postMessage({type:'state',state:game.state,ack:game.acks.get('local')??-1});}
},8);
