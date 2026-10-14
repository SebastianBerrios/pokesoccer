import { FIELD, POKEMON } from './catalog.ts';
import { distance, unit, clamp, segmentDistance } from './math.ts';
import { byId, event } from './state.ts';
import { hit, shootBall } from './ball.ts';
import type { Ability, Effect, Fighter, MatchState } from './types.ts';
function effect(s:MatchState,p:Fighter,a:Ability,kind:Effect['kind'],x=p.x,z=p.z):Effect {
  const e:Effect={id:s.nextId++,owner:p.id,team:p.team,kind,color:a.color,x,z,vx:0,vz:0,radius:a.radius,
    life:a.duration,maxLife:a.duration,power:a.power??0,slow:a.slow??0,stun:a.stun??0,
    allySpeed:a.allySpeed??0,noSprint:a.noSprint??false,hits:[],reflect:false,trail:a.trail??false};
  s.effects.push(e);return e;
}
function valid(s:MatchState,p:Fighter,a:Ability) {
  if(a.kind==='shot')return s.ball.owner===p.id;
  if(a.kind==='blink')return s.ball.owner!==p.id;
  if(a.kind==='pull'||a.kind==='redirect')return !s.ball.owner&&distance(p,s.ball)<=a.range;
  return true;
}
export function castAbility(s:MatchState,p:Fighter,slot:number):boolean {
  const a=POKEMON[p.species]?.abilities[slot];
  if(!a||p.stun>0||p.cast>0||p.actionCd>0||!valid(s,p,a))return false;
  if(slot===0&&p.simpleCd>0||slot===1&&p.normal<100||slot===2&&p.special<100)return false;
  if(slot===0)p.simpleCd=6;
  if(slot===1)p.normal=0;
  if(slot===2)p.special=0;
  p.cloak=0;p.charge=0;p.actionCd=.2;
  if(slot===2) {
    p.cast=.8;p.castSlot=slot;p.castX=p.facingX;p.castZ=p.facingZ;
    effect(s,p,{...a,duration:.8},'warning',p.x+p.facingX*a.range,p.z+p.facingZ*a.range);
    event(s,'cast',a.name,p);
  } else executeAbility(s,p,a);
  return true;
}
export function finishCast(s:MatchState,p:Fighter) {
  const slot=p.castSlot;p.castSlot=-1;
  const a=POKEMON[p.species]?.abilities[slot];
  if(!a||!valid(s,p,a))return;
  p.facingX=p.castX;p.facingZ=p.castZ;executeAbility(s,p,a);
}
export function executeAbility(s:MatchState,p:Fighter,a:Ability) {
  p.anim='cast';
  const dx=p.facingX,dz=p.facingZ;
  if(a.kind==='dash') {
    p.vx=dx*a.range*6;p.vz=dz*a.range*6;p.boost=1.2;
    for(const q of s.players)if(q.team!==p.team&&!q.keeper&&distance(q,p)<3)
      hit(s,q,dx,dz,a.power??6,.35);
  } else if(a.kind==='blink') {
    p.x=clamp(p.x+dx*a.range,-23,23);p.z=clamp(p.z+dz*a.range,-13,13);
    effect(s,p,{...a,duration:.4,radius:1.5},'burst');
  } else if(a.kind==='push') {
    for(const q of s.players) {
      const v=unit(q.x-p.x,q.z-p.z);
      if(q.team!==p.team&&distance(q,p)<a.range&&v.x*dx+v.z*dz>.25)
        hit(s,q,v.x,v.z,a.power??6,a.stun??.25,a.slow??0);
    }
    effect(s,p,{...a,duration:.35,radius:a.range*.65},'burst',p.x+dx*2,p.z+dz*2);
  } else if(a.kind==='projectile') {
    const count=a.count??1;
    for(let n=0;n<count;n++) {
      const angle=Math.atan2(dz,dx)+(n-(count-1)/2)*.24;
      const e=effect(s,p,{...a,duration:a.range/16},'projectile',p.x+dx,p.z+dz);
      e.vx=Math.cos(angle)*16;e.vz=Math.sin(angle)*16;
      e.radius=a.radius===3?.6:a.radius;
    }
  } else if(a.kind==='zone') {
    effect(s,p,a,'zone',clamp(p.x+dx*a.range,-23,23),clamp(p.z+dz*a.range,-13,13));
  } else if(a.kind==='wall') {
    const e=effect(s,p,a,'wall',clamp(p.x+dx*a.range,-22,22),clamp(p.z+dz*a.range,-12,12));
    e.reflect=p.species==='alakazam';
  } else if(a.kind==='shield') p.shield=a.duration;
  else if(a.kind==='buff') p.buff=a.duration;
  else if(a.kind==='cloak') { for(const q of s.players)if(q.team===p.team&&!q.keeper)q.cloak=a.duration; }
  else if(a.kind==='pull') {const v=unit(p.x-s.ball.x,p.z-s.ball.z);s.ball.vx=v.x*16;s.ball.vz=v.z*16;s.ball.vy=0;}
  else if(a.kind==='redirect') {s.ball.vx=dx*24;s.ball.vz=dz*24;s.ball.vy=1;s.ball.lastTouch=p.id;s.ball.lastTeam=p.team;s.ball.pickupLock=.1;}
  else if(a.kind==='shot') shootBall(s,p,1,a.power??1.3,a.curve??0,a.trail??false);
}
export function useItem(s:MatchState,p:Fighter):boolean {
  if(!p.item||p.stun>0||p.cast>0)return false;
  const kind=p.item;p.item=null;
  if(kind==='berry')p.boost=3;
  else if(kind==='shield')p.shield=4;
  else {
    const a:Ability={name:'Bomba',description:'',kind:'projectile',color:'#ffb56b',range:10,radius:2.8,duration:.6,power:9,stun:.6};
    const e=effect(s,p,a,'projectile',p.x+p.facingX,p.z+p.facingZ);
    e.vx=p.facingX*15;e.vz=p.facingZ*15;
  }
  return true;
}
export function updateEffects(s:MatchState,dt:number) {
  for(const e of s.effects) {
    e.life-=dt;
    const prev={x:e.x,z:e.z};e.x+=e.vx*dt;e.z+=e.vz*dt;
    if(e.kind==='warning'||e.kind==='burst')continue;
    if(Math.abs(e.x)>FIELD.halfWidth||Math.abs(e.z)>FIELD.halfDepth) {e.life=0;continue;}
    const targets=e.kind==='projectile'?s.players.slice().sort((a,b)=>
      ((a.x-prev.x)*e.vx+(a.z-prev.z)*e.vz)-((b.x-prev.x)*e.vx+(b.z-prev.z)*e.vz)):s.players;
    for(const p of targets) {
      if(p.keeper)continue;
      const d=e.kind==='projectile'?segmentDistance(p,prev,e):distance(p,e);
      if(d>e.radius+.6)continue;
      if(e.kind==='wall') {
        const v=unit(p.x-e.x,p.z-e.z);
        p.x=e.x+v.x*(e.radius+.65);p.z=e.z+v.z*(e.radius+.65);
      } else if(e.kind==='zone'&&p.team===e.team) { if(e.allySpeed)p.boost=Math.max(p.boost,.15); }
      else if(p.team!==e.team) {
        if(e.kind==='zone'&&e.slow) {p.slow=Math.max(p.slow,Math.min(.4,e.slow));p.slowTime=Math.max(p.slowTime,.2);}
        if(e.noSprint)p.noSprint=Math.max(p.noSprint,.2);
        if(!e.hits.includes(p.id)) {
          e.hits.push(p.id);const v=unit(p.x-e.x,p.z-e.z);
          if(e.power>0||e.stun>0)hit(s,p,e.kind==='projectile'?unit(e.vx,e.vz).x:v.x,e.kind==='projectile'?unit(e.vx,e.vz).z:v.z,e.power,e.stun,e.slow);
          if(e.kind==='projectile'&&e.radius<3){e.life=0;break;}
        }
      }
    }
    if(e.life>0&&!s.ball.owner&&segmentDistance(s.ball,prev,e)<e.radius+.3&&s.ball.y<3) {
      if(e.kind==='projectile') {
        s.ball.vx=e.vx*1.2;s.ball.vz=e.vz*1.2;s.ball.lastTouch=e.owner;s.ball.lastTeam=e.team;
        if(e.radius<3)e.life=0;
      }
    }
    if(e.kind==='wall'&&e.reflect) {
      for(const projectile of s.effects) if(projectile.kind==='projectile'&&projectile.team!==e.team&&distance(projectile,e)<e.radius+projectile.radius) {
        projectile.vx*=-1;projectile.vz*=-1;projectile.team=e.team;projectile.owner=e.owner;e.life=0;break;
      }
    }
  }
  s.effects=s.effects.filter(e=>e.life>0).slice(-100);
}
