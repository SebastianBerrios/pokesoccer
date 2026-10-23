import { FIELD, POKEMON } from './catalog.ts';
import { clamp, distance, unit } from './math.ts';
import { attackDirection, assignPossession, beginKeeperPossession, byId, event } from './state.ts';
import { setAction } from './state.ts';
import { PACE_PROFILES } from './tuning.ts';
import type { Fighter, MatchState } from './types.ts';

export function gain(p:Fighter,amount:number) { if(!p.keeper) p.normal=Math.min(100,p.normal+amount); }
export function possession(s:MatchState,team:0|1) {
  if(s.possession!==team) {s.possession=team;for(const p of s.players)p.passCredit=0;}
}
export function dropBall(s:MatchState,p:Fighter,dx=p.facingX,dz=p.facingZ,power=5) {
  if(s.ball.owner!==p.id)return;
  const b=s.ball;b.owner=null;b.x=p.x+dx*.8;b.z=p.z+dz*.8;b.y=.4;
  b.vx=dx*power;b.vz=dz*power;b.vy=1.8;b.pickupLock=.25;b.passer=null;b.passTarget=null;b.passSession=null;b.shot=false;b.abilityId=null;
}
export function hit(s:MatchState,target:Fighter,dx:number,dz:number,power:number,stun=.25,slow=0,source:'contact'|'ability'='ability'):boolean {
  if(target.keeper||target.dodgeTime>0||target.immunity>0||source==='contact'&&target.ghost>0)return false;
  if(target.shield>0) {target.shield=0;target.immunity=.3;event(s,'shield','¡Escudo!',target);return false;}
  const resisted=target.buff>0&&['machamp','snorlax','lucario'].includes(target.species);
  const force=power*PACE_PROFILES[s.settings.pace].impulse,factor=resisted?.2:1;
  target.vx+=dx*force*factor;target.vz+=dz*force*factor;
  if(!resisted) {
    target.stun=Math.min(.8,Math.max(target.stun,stun));
    target.immunity=target.stun+1.2;
    target.cast=0;target.castSlot=-1;target.charge=0;setAction(s,target,'hit',target.stun);
    dropBall(s,target,dx,dz,Math.max(3,force*.7));
  }
  if(slow>0) {target.slow=Math.min(.4,Math.max(target.slow,slow));target.slowTime=2;}
  return true;
}
export function catchBall(s:MatchState,p:Fighter) {
  const b=s.ball;
  const passer=byId(s,b.passer), oldTeam=b.lastTeam;
  const preferred=b.passTarget===p.id&&passer?.team===p.team?b.passSession:null;
  if(passer&&passer.team===p.team&&passer.id!==p.id&&!p.keeper) {
    const reward=Math.min(25,50-passer.passCredit);gain(passer,reward);passer.passCredit+=reward;
  } else if(oldTeam!==null&&oldTeam!==p.team&&!p.keeper) gain(p,25);
  if(p.keeper&&b.shot) {const shooter=byId(s,b.lastTouch);if(shooter)gain(shooter,25);event(s,'save','¡Atajada!',p);}
  possession(s,p.team);
  b.owner=p.id;b.lastTouch=p.id;b.lastTeam=p.team;b.passer=null;b.passTarget=null;b.passSession=null;b.shot=false;b.abilityId=null;b.curve=0;b.fiery=0;
  b.vx=0;b.vy=0;b.vz=0;p.aiTimer=0;p.charge=0;
  if(p.keeper)beginKeeperPossession(s,p);else assignPossession(s,p,preferred);
}
export function passTarget(s:MatchState,p:Fighter):Fighter|undefined {
  const dir={x:p.facingX,z:p.facingZ};
  const teammates=s.players.filter(q=>q.team===p.team&&q.id!==p.id&&!q.keeper);
  const scored=teammates.map(q=>{
    const v=unit(q.x-p.x,q.z-p.z), dot=v.x*dir.x+v.z*dir.z;
    return {q,score:dot*14-distance(p,q)*.15};
  }).sort((a,b)=>b.score-a.score);
  return scored[0]?.q;
}
export function passBall(s:MatchState,p:Fighter,lob=false,recipient?:Fighter) {
  if(s.ball.owner!==p.id||p.actionCd>0)return;
  const dir=unit(p.facingX,p.facingZ);
  const target=recipient??passTarget(s,p);
  const v=target?unit(target.x-p.x,target.z-p.z):dir;
  const d=target?distance(p,target):10;
  const profile=PACE_PROFILES[s.settings.pace];
  const base=lob?Math.max(9,d*.85):Math.max(18+(POKEMON[p.species]?.stats[3]??3)*.8,d*.62+2);
  const flight=Math.max(1.1,d/(base*profile.ball));
  const speed=lob?d*.07/(1-Math.exp(-.07*flight)):base*profile.ball;
  const b=s.ball;
  b.owner=null;b.x=p.x+v.x*.95;b.z=p.z+v.z*.95;b.y=.45;b.vx=v.x*speed;b.vz=v.z*speed;
  b.vy=lob?9.8*flight/2:.9;b.pickupLock=.15;
  b.passer=p.id;b.passSession=p.controller;b.passTarget=target?.id??null;
  if(target&&!target.controller){target.aiTimer=0;target.aiShoot=false;target.aiSprint=false;}
  b.lastTouch=p.id;b.lastTeam=p.team;b.shot=false;b.abilityId=null;b.curve=0;b.fiery=0;
  p.actionCd=.3;p.anim='kick';p.charge=0;setAction(s,p,'pass',.35);
}
export function shootBall(s:MatchState,p:Fighter,charge=.35,power=1,curve=0,fiery=false,aimError=0) {
  if(s.ball.owner!==p.id)return;
  const dir=attackDirection(s,p.team);
  // Shots always travel toward the opponent's goal. Lateral input chooses the corner.
  const targetZ=clamp(p.facingZ*4,-FIELD.goalHalf+.5,FIELD.goalHalf-.5)+aimError;
  const v=unit(dir*FIELD.halfWidth-p.x,targetZ-p.z);
  const stat=POKEMON[p.species]?.stats[2]??3;
  const speed=(19+stat*1.1+clamp(charge,0,1)*9)*power*(p.buff>0&&p.species==='dragonite'?1.15:1)*PACE_PROFILES[s.settings.pace].ball;
  const b=s.ball;b.owner=null;b.x=p.x+v.x*.95;b.z=p.z+v.z*.95;b.y=.5;
  b.vx=v.x*speed;b.vz=v.z*speed;b.vy=2+clamp(charge,0,1)*2;
  b.lastTouch=p.id;b.lastTeam=p.team;b.passer=null;b.passSession=null;b.passTarget=null;
  b.pickupLock=.18;b.shot=true;b.abilityId=null;b.curve=curve*(p.z>=0?-1:1);b.fiery=fiery?1.2:0;
  p.actionCd=.4;p.charge=0;p.anim='kick';setAction(s,p,'shot',.45);
  event(s,'shot',power>1?'¡Tiro especial!':'',p);
}
