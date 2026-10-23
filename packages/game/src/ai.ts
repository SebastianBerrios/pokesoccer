import { FIELD, POKEMON } from './catalog.ts';
import { clamp, distance, unit } from './math.ts';
import { attackDirection, byId, emptyInput, random, movementSpeed } from './state.ts';
import { passTarget } from './ball.ts';
import { laneClearance, visibleRivals } from './keepers.ts';
import { BOT_PROFILES, botDifficulty } from './tuning.ts';
import type { Difficulty, Fighter, InputFrame, MatchState } from './types.ts';

export const DECISION_INTERVALS: Record<Difficulty, readonly [number,number]> = {
  easy:BOT_PROFILES.easy.reaction,normal:BOT_PROFILES.normal.reaction,hard:BOT_PROFILES.hard.reaction,
};
export function botInput(s:MatchState,p:Fighter,dt:number):InputFrame {
  const input=emptyInput(p.epoch,s.tick),t=s.tactics[p.team],difficulty=botDifficulty(s,p.team);
  const profile=BOT_PROFILES[difficulty],plan=s.teamPlans[p.team];
  // A directed pass interrupts the cached tactical decision on this very tick.
  if(!p.controller&&s.ball.passTarget===p.id&&!s.ball.owner) {
    const target=passInterception(s,p);
    p.aiTimer=0;p.aiX=0;p.aiZ=0;p.aiShoot=false;p.aiSprint=false;
    if(target) {
      const d=distance(p,target),v=unit(target.x-p.x,target.z-p.z);
      input.moveX=d>.12?v.x*Math.min(1,d/(movementSpeed(p,true,s.settings)*dt)):0;
      input.moveZ=d>.12?v.z*Math.min(1,d/(movementSpeed(p,true,s.settings)*dt)):0;
      input.sprint=d>1&&p.stamina>0;
      return input;
    }
    s.ball.passTarget=null;s.ball.passSession=null;s.ball.passer=null;
  }
  p.aiTimer-=dt;
  if(p.aiTimer>0) {
    input.moveX=p.aiX;input.moveZ=p.aiZ;input.shoot=p.aiShoot;input.sprint=p.aiSprint;
    if(s.ball.owner!==p.id&&t.presser!==p.id&&distance(p,t.targets[p.id]??p)<.7)input.moveX=input.moveZ=0;
    return input;
  }
  const [min,max]=profile.reaction;
  p.aiTimer=min+random(s)*(max-min);
  const dir=attackDirection(s,p.team),carrier=byId(s,s.ball.owner);
  const rivals=visibleRivals(s,p),allies=s.players.filter(q=>q.team===p.team&&!q.keeper&&q.id!==p.id);
  const focus=t.focus;
  let target=t.targets[p.id]??{x:0,z:0};
  if(carrier?.id===p.id) {
    const goalDistance=FIELD.halfWidth-dir*p.x;
    const pressure=rivals.some(q=>!q.keeper&&distance(q,p)<4.5);
    const corners=[-FIELD.goalHalf+.8,FIELD.goalHalf-.8].map(z=>({x:dir*FIELD.halfWidth,z}));
    corners.sort((a,b)=>laneClearance(s,p,b)-laneClearance(s,p,a));
    const shot=corners[0],shotClear=laneClearance(s,p,shot)>.9;
    const possession=plan.style==='possession',counter=plan.style==='counterattack';
    const passes=allies.filter(q=>{
      const aim=unit(q.x-p.x,q.z-p.z);
      return q.stun<=0&&distance(p,q)>4&&laneClearance(s,p,q)>1.6&&
        passTarget(s,{...p,facingX:aim.x,facingZ:aim.z})?.id===q.id;
    }).map(q=>({q,score:dir*(q.x-p.x)*(counter?.95:possession?.2:.55)+laneClearance(s,p,q)*1.1-distance(p,q)*(possession?.2:.08)}))
      .sort((a,b)=>b.score-a.score||a.q.id.localeCompare(b.q.id));
    const pass=passes[0];
    target={x:dir*(FIELD.halfWidth-6),z:clamp(p.z+(p.z>=0?2:-2),-FIELD.areaHalf-3,FIELD.areaHalf+3)};
    if(goalDistance<20&&shotClear) {
      // Match shootBall's lateral aim exactly, so the checked lane is the lane we shoot into.
      target={x:p.x+dir*Math.sqrt(16-shot.z*shot.z),z:p.z+shot.z};
      input.shoot=p.charge<(.3+POKEMON[p.species].stats[2]*.05);
    } else if(pass&&(pressure||pass.score>(possession?2:5)||goalDistance<10)) {
      target=pass.q;input.pass=true;
    } else if(goalDistance<7) {
      target={x:p.x-dir*3,z:p.z>=0?FIELD.areaHalf+2:-FIELD.areaHalf-2};
      if(shotClear)input.shoot=p.charge<.4;
    }
    input.sprint=!pressure&&p.stamina>45&&(counter||goalDistance<22)&&difficulty!=='easy';
  } else if(t.presser===p.id) {
    target={...focus};
    if(carrier&&carrier.team!==p.team) {
      const separation=distance(p,carrier);
      // Easy closes space deliberately instead of repeatedly charging the receiver.
      if(separation<profile.pressDistance+1&&p.actionCd<=0) {
        const commit=carrier.ghost<=0&&random(s)<profile.tackleChance;
        if(commit&&separation<2.3)input.shoot=true;
        if(!commit) {
          const v=unit(p.x-focus.x,p.z-focus.z);
          target={x:focus.x+v.x*profile.pressDistance,z:focus.z+v.z*profile.pressDistance};
        }
      }
    }
    input.sprint=difficulty!=='easy'&&distance(p,target)>9&&p.stamina>45;
  }
  const v=unit(target.x-p.x,target.z-p.z);
  if(distance(target,p)>.6){input.moveX=v.x;input.moveZ=v.z;}
  const nearEnemy=rivals.some(q=>!q.keeper&&distance(q,p)<6);
  const ballFree=!carrier&&distance(p,s.ball)<9;
  const useful=(slot:number)=>{
    const a=POKEMON[p.species].abilities[slot];
    if(a.kind==='shot')return carrier?.id===p.id&&FIELD.halfWidth-dir*p.x<21&&laneClearance(s,p,{x:dir*FIELD.halfWidth,z:0})>1;
    if(a.kind==='pull'||a.kind==='redirect')return ballFree;
    if(a.kind==='blink')return carrier?.id!==p.id&&t.presser===p.id&&distance(p,focus)>6;
    if(a.kind==='dash')return carrier?.id===p.id||t.presser===p.id&&nearEnemy;
    if(a.kind==='shield'||a.kind==='buff'||a.kind==='ghost')return nearEnemy;
    return nearEnemy&&(carrier?.team!==p.team||a.kind==='zone');
  };
  const powerWindow=s.time>=t.powerReadyAt&&random(s)<profile.powerChance;
  input.special=powerWindow&&p.special>=100&&useful(2);
  input.normal=!input.special&&powerWindow&&p.normal>=100&&useful(1);
  input.simple=!input.special&&!input.normal&&p.simpleCd<=0&&useful(0)&&random(s)<profile.powerChance;
  input.item=!!p.item&&(nearEnemy||p.item==='berry'&&distance(p,focus)>6)&&random(s)<profile.powerChance;
  p.aiX=input.moveX;p.aiZ=input.moveZ;p.aiShoot=input.shoot;p.aiSprint=input.sprint;
  return input;
}

// Predict the same gravity, bounce and drag as updateBall, without mutating state.
// First reachable low point wins; high lobs are met on their descent.
export function passInterception(s:MatchState,p:Fighter) {
  const b={...s.ball},step=1/60,speed=movementSpeed(p,true,s.settings);
  if(b.owner||b.passTarget!==p.id||b.lastTeam!==p.team)return null;
  for(let time=step;time<=6;time+=step) {
    if(b.curve){const a=Math.atan2(b.vz,b.vx)+b.curve*step*.35,v=Math.hypot(b.vx,b.vz);b.vx=Math.cos(a)*v;b.vz=Math.sin(a)*v;}
    b.vy-=9.8*step;b.x+=b.vx*step;b.z+=b.vz*step;b.y+=b.vy*step;
    if(Math.abs(b.x)>FIELD.halfWidth-.3||Math.abs(b.z)>FIELD.halfDepth-.3)return null;
    if(b.y<.35){b.y=.35;b.vy=Math.abs(b.vy)>.9?-b.vy*.42:0;}
    const drag=Math.exp(-(b.y>.4?.07:.5)*step);b.vx*=drag;b.vz*=drag;
    if(b.y<1.1&&distance(p,b)<=speed*time+.65)return {x:b.x,z:b.z};
  }
  return null;
}
