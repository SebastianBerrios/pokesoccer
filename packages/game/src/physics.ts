import { FIELD } from './catalog.ts';
import { clamp, distance, segmentDistance, unit } from './math.ts';
import { attackDirection, byId, event, random, resetPositions, endKeeperPossession } from './state.ts';
import { catchBall, gain, hit } from './ball.ts';
import type { Fighter, MatchState, Team } from './types.ts';

export function updateKeepers(s:MatchState,dt:number) {
  for(const p of s.players.filter(p=>p.keeper)) {
    if(s.keeperPossession?.keeperId===p.id)continue;
    const dir=attackDirection(s,p.team);
    const targetZ=clamp(s.ball.z*.65,-FIELD.goalHalf+.8,FIELD.goalHalf-.8);
    p.z+=clamp(targetZ-p.z,-4.2*dt,4.2*dt);
    p.x=-dir*(FIELD.halfWidth-FIELD.keeperInset);p.facingX=dir;p.facingZ=0;
    p.aiTimer-=dt;
  }
}
export function resolvePlayers(s:MatchState,dt:number) {
  for(const p of s.players) {
    if(p.keeper)continue;
    p.x+=p.vx*dt;p.z+=p.vz*dt;
    p.vx*=Math.exp(-6*dt);p.vz*=Math.exp(-6*dt);
    const wall=Math.abs(p.x)>(FIELD.halfWidth-FIELD.playerRadius)||Math.abs(p.z)>(FIELD.halfDepth-FIELD.playerRadius);
    if(wall&&Math.hypot(p.vx,p.vz)>6)hit(s,p,0,0,0,.5);
    p.x=clamp(p.x,-(FIELD.halfWidth-FIELD.playerRadius),(FIELD.halfWidth-FIELD.playerRadius));p.z=clamp(p.z,-(FIELD.halfDepth-FIELD.playerRadius),(FIELD.halfDepth-FIELD.playerRadius));
  }
  for(let i=0;i<s.players.length;i++)for(let j=i+1;j<s.players.length;j++) {
    const a=s.players[i],b=s.players[j],d=distance(a,b);
    if(d<1.2&&d>.001) {
      const v=unit(a.x-b.x,a.z-b.z),push=(1.2-d)*.5;
      if(!a.keeper){a.x+=v.x*push;a.z+=v.z*push;}
      if(!b.keeper){b.x-=v.x*push;b.z-=v.z*push;}
    }
  }
}
export function scoreGoal(s:MatchState,side:number) {
  const scoring=(attackDirection(s,0)===side?0:1) as Team;
  s.score[scoring]++;
  const scorer=byId(s,s.ball.lastTouch);
  if(scorer?.team===scoring)gain(scorer,50);
  event(s,'goal','¡GOOOL!',scorer);
  if(s.half===3) {endKeeperPossession(s);s.phase='finished';s.winner=scoring;return;}
  s.phase='goal';s.phaseTime=3;
  resetPositions(s,scoring===0?1:0);
}
export function updateBall(s:MatchState,dt:number) {
  const b=s.ball;
  b.pickupLock=Math.max(0,b.pickupLock-dt);b.fiery=Math.max(0,b.fiery-dt);
  const owner=byId(s,b.owner);
  if(owner) {
    b.x=owner.x+owner.facingX*.8;b.z=owner.z+owner.facingZ*.8;b.y=.35;b.vx=0;b.vz=0;b.vy=0;
    return;
  }
  const prev={x:b.x,z:b.z};
  if(b.curve) {const speed=Math.hypot(b.vx,b.vz),a=Math.atan2(b.vz,b.vx)+b.curve*dt*.35;b.vx=Math.cos(a)*speed;b.vz=Math.sin(a)*speed;}
  b.vy-=9.8*dt;b.x+=b.vx*dt;b.z+=b.vz*dt;b.y+=b.vy*dt;
  if(b.y<.35){b.y=.35;b.vy=Math.abs(b.vy)>.9?-b.vy*.42:0;}
  const drag=b.y>.4?.07:.5;
  b.vx*=Math.exp(-drag*dt);b.vz*=Math.exp(-drag*dt);
  if(Math.abs(b.z)>FIELD.halfDepth-.3){b.z=clamp(b.z,-FIELD.halfDepth+FIELD.ballRadius,FIELD.halfDepth-FIELD.ballRadius);b.vz*=-.82;}
  for(const e of s.effects)if(e.kind==='wall'&&b.y<3&&segmentDistance(e,prev,b)<e.radius+.3) {
    const v=unit(b.x-e.x,b.z-e.z),dot=b.vx*v.x+b.vz*v.z;
    if(dot<0){b.vx-=2*dot*v.x;b.vz-=2*dot*v.z;b.x=e.x+v.x*(e.radius+.35);b.z=e.z+v.z*(e.radius+.35);if(e.reflect)e.life=0;}
  }
  // Swept catches run before the goal-line crossing, preventing tunneling through keepers.
  for(const p of s.players) {
    if(p.stun>0||p.cast>0||b.pickupLock>0&&p.id===b.lastTouch)continue;
    if(p.keeper) {
      if(p.aiTimer>0&&s.ball.lastTeam===p.team)continue;
      if(b.y<2.7&&segmentDistance(p,prev,b)<1.2) {catchBall(s,p);return;}
    } else if(b.y<1.15&&segmentDistance(p,prev,b)<.85) {catchBall(s,p);return;}
  }
  if(Math.abs(b.x)>FIELD.halfWidth-.3) {
    const plane=Math.sign(b.x)*FIELD.halfWidth;
    const t=(plane-prev.x)/(b.x-prev.x||1);
    const crossingZ=prev.z+(b.z-prev.z)*clamp(t,0,1);
    if(Math.abs(b.x)>=FIELD.halfWidth&&Math.abs(crossingZ)<FIELD.goalHalf-.25&&b.y<FIELD.goalHeight-.2) {scoreGoal(s,Math.sign(b.x));return;}
    if(Math.abs(crossingZ)>=FIELD.goalHalf-.25||b.y>=FIELD.goalHeight-.2) {
      b.x=clamp(b.x,-FIELD.halfWidth+FIELD.ballRadius,FIELD.halfWidth-FIELD.ballRadius);b.vx*=-.85;
    }
  }
  if(b.fiery>0&&s.tick%3===0) {
    const id=s.nextId++;
    s.effects.push({id,owner:b.lastTouch??'',team:b.lastTeam??0,kind:'zone',color:'#ff793f',x:b.x,z:b.z,vx:0,vz:0,
      radius:1,life:.7,maxLife:.7,power:0,stun:0,slow:.25,allySpeed:0,noSprint:false,hits:[],reflect:false,trail:true});
  }
}
export function updatePickups(s:MatchState,dt:number) {
  s.orbTimer-=dt;s.itemTimer-=dt;
  if(s.orbTimer<=0) {s.orbTimer=30;if(!s.pickups.some(o=>o.kind==='orb'))s.pickups.push({id:s.nextId++,kind:'orb',x:0,z:0,life:9999});}
  if(s.itemTimer<=0) {
    s.itemTimer=20;
    for(const z of [-FIELD.halfDepth*.72,FIELD.halfDepth*.72])if(!s.pickups.some(o=>o.kind!=='orb'&&Math.abs(o.z-z)<1)) {
      const kind=(['berry','shield','bomb'] as const)[Math.floor(random(s)*3)];
      s.pickups.push({id:s.nextId++,kind,x:0,z,life:20});
    }
  }
  for(const o of s.pickups) {
    o.life-=dt;
    for(const p of s.players)if(!p.keeper&&p.stun<=0&&distance(p,o)<1.3) {
      if(o.kind==='orb') {if(p.special>=100)continue;p.special=100;event(s,'orb','Especial listo',p);}
      else {if(p.item)continue;p.item=o.kind;}
      o.life=0;break;
    }
  }
  s.pickups=s.pickups.filter(o=>o.life>0);
}
