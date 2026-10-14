import { FIELD, POKEMON } from './catalog.ts';
import { clamp, distance, unit } from './math.ts';
import { attackDirection, byId, controlled, event, transfer } from './state.ts';
import type { Fighter, MatchState } from './types.ts';

export function gain(p:Fighter,amount:number) { if(!p.keeper) p.normal=Math.min(100,p.normal+amount); }
export function possession(s:MatchState,team:0|1) {
  if(s.possession!==team) {s.possession=team;for(const p of s.players)p.passCredit=0;}
}
export function dropBall(s:MatchState,p:Fighter,dx=p.facingX,dz=p.facingZ,power=5) {
  if(s.ball.owner!==p.id)return;
  const b=s.ball;b.owner=null;b.x=p.x+dx*.8;b.z=p.z+dz*.8;b.y=.4;
  b.vx=dx*power;b.vz=dz*power;b.vy=1.8;b.pickupLock=.25;b.passer=null;b.passTarget=null;b.passSession=null;b.shot=false;
}
export function hit(s:MatchState,target:Fighter,dx:number,dz:number,power:number,stun=.25,slow=0):boolean {
  if(target.keeper||target.dodgeTime>0||target.immunity>0)return false;
  if(target.shield>0) {target.shield=0;target.immunity=.3;event(s,'shield','¡Escudo!',target);return false;}
  const resisted=target.buff>0&&['machamp','snorlax','lucario'].includes(target.species);
  const factor=resisted?.2:1;
  target.vx+=dx*power*factor;target.vz+=dz*power*factor;
  if(!resisted) {
    target.stun=Math.min(.8,Math.max(target.stun,stun));
    target.immunity=target.stun+1.2;
    target.cast=0;target.castSlot=-1;target.charge=0;target.cloak=0;
    dropBall(s,target,dx,dz,Math.max(3,power*.7));
  }
  if(slow>0) {target.slow=Math.min(.4,Math.max(target.slow,slow));target.slowTime=2;}
  return true;
}
export function catchBall(s:MatchState,p:Fighter) {
  const b=s.ball;
  const passer=byId(s,b.passer), oldTeam=b.lastTeam;
  if(passer&&passer.team===p.team&&passer.id!==p.id&&!p.keeper) {
    const reward=Math.min(25,50-passer.passCredit);gain(passer,reward);passer.passCredit+=reward;
    if(b.passTarget===p.id&&b.passSession&&p.controller===null) {
      const h=s.humans.find(h=>h.id===b.passSession&&h.connected);
      if(h&&controlled(s,h.id)?.id===passer.id) transfer(s,h,p);
    }
  } else if(oldTeam!==null&&oldTeam!==p.team&&!p.keeper) gain(p,25);
  if(p.keeper&&b.shot) {const shooter=byId(s,b.lastTouch);if(shooter)gain(shooter,25);event(s,'save','¡Atajada!',p);}
  possession(s,p.team);
  b.owner=p.id;b.lastTouch=p.id;b.lastTeam=p.team;b.passer=null;b.passTarget=null;b.passSession=null;b.shot=false;b.curve=0;b.fiery=0;
  b.vx=0;b.vy=0;b.vz=0;p.aiTimer=p.keeper?.65:p.aiTimer;p.charge=0;
}
export function passBall(s:MatchState,p:Fighter,lob=false) {
  if(s.ball.owner!==p.id||p.actionCd>0)return;
  const dir={x:p.facingX,z:p.facingZ};
  const teammates=s.players.filter(q=>q.team===p.team&&q.id!==p.id&&!q.keeper);
  const scored=teammates.map(q=>{
    const v=unit(q.x-p.x,q.z-p.z), dot=v.x*dir.x+v.z*dir.z;
    return {q,score:dot*14-distance(p,q)*.15};
  }).sort((a,b)=>b.score-a.score);
  const target=scored[0]?.q;
  const v=target?unit(target.x-p.x,target.z-p.z):dir;
  const d=target?distance(p,target):10;
  const speed=lob?Math.max(9,d*.85):18+(POKEMON[p.species]?.stats[3]??3)*.8;
  const b=s.ball;
  b.owner=null;b.x=p.x+v.x*.95;b.z=p.z+v.z*.95;b.y=.45;b.vx=v.x*speed;b.vz=v.z*speed;
  b.vy=lob?Math.max(6.8,9.8*(d/speed)/2):.9;b.pickupLock=.15;
  b.passer=p.id;b.passSession=p.controller;b.passTarget=target?.id??null;
  b.lastTouch=p.id;b.lastTeam=p.team;b.shot=false;b.curve=0;b.fiery=0;
  p.actionCd=.3;p.anim='kick';p.cloak=0;p.charge=0;
}
export function shootBall(s:MatchState,p:Fighter,charge=.35,power=1,curve=0,fiery=false) {
  if(s.ball.owner!==p.id)return;
  const dir=attackDirection(s,p.team);
  // Shots always travel toward the opponent's goal. Lateral input chooses the corner.
  const targetZ=clamp(p.facingZ*4,-3.1,3.1);
  const v=unit(dir*FIELD.halfWidth-p.x,targetZ-p.z);
  const stat=POKEMON[p.species]?.stats[2]??3;
  const speed=(19+stat*1.1+clamp(charge,0,1)*9)*power*(p.buff>0&&p.species==='dragonite'?1.15:1);
  const b=s.ball;b.owner=null;b.x=p.x+v.x*.95;b.z=p.z+v.z*.95;b.y=.5;
  b.vx=v.x*speed;b.vz=v.z*speed;b.vy=2+clamp(charge,0,1)*2;
  b.lastTouch=p.id;b.lastTeam=p.team;b.passer=null;b.passSession=null;b.passTarget=null;
  b.pickupLock=.18;b.shot=true;b.curve=curve*(p.z>=0?-1:1);b.fiery=fiery?1.2:0;
  p.actionCd=.4;p.charge=0;p.anim='kick';p.cloak=0;
  event(s,'shot',power>1?'¡Tiro especial!':'',p);
}
