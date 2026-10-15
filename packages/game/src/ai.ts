import { FIELD, POKEMON } from './catalog.ts';
import { clamp, distance, unit } from './math.ts';
import { attackDirection, byId, emptyInput, random } from './state.ts';
import { passTarget } from './ball.ts';
import { laneClearance, visibleRivals } from './keepers.ts';
import type { Difficulty, Fighter, InputFrame, MatchState } from './types.ts';

export const DECISION_INTERVALS: Record<Difficulty, readonly [number,number]> = {
  easy:[.35,.5], normal:[.18,.3], hard:[.1,.16],
};
export function botInput(s:MatchState,p:Fighter,dt:number):InputFrame {
  const input=emptyInput(p.epoch,s.tick);
  p.aiTimer-=dt;
  if(p.aiTimer>0) {input.moveX=p.aiX;input.moveZ=p.aiZ;input.shoot=p.aiShoot;input.sprint=p.aiSprint;return input;}
  const [min,max]=DECISION_INTERVALS[s.settings.difficulty];
  p.aiTimer=min+random(s)*(max-min);
  const dir=attackDirection(s,p.team),carrier=byId(s,s.ball.owner),t=s.tactics[p.team];
  const rivals=visibleRivals(s,p),allies=s.players.filter(q=>q.team===p.team&&!q.keeper&&q.id!==p.id);
  const focus=t.focus;
  let target=t.targets[p.id]??{x:0,z:0};
  if(carrier?.id===p.id) {
    const goalDistance=FIELD.halfWidth-dir*p.x;
    const pressure=rivals.some(q=>!q.keeper&&distance(q,p)<4);
    const corners=[-FIELD.goalHalf+.8,FIELD.goalHalf-.8].map(z=>({x:dir*FIELD.halfWidth,z}));
    corners.sort((a,b)=>laneClearance(s,p,b)-laneClearance(s,p,a));
    const shot=corners[0],shotClear=laneClearance(s,p,shot)>1.15;
    const passes=allies.filter(q=>{
      const aim=unit(q.x-p.x,q.z-p.z);
      return q.stun<=0&&distance(p,q)>5&&laneClearance(s,p,q)>1.8&&
        passTarget(s,{...p,facingX:aim.x,facingZ:aim.z})?.id===q.id;
    })
      .map(q=>({q,score:dir*(q.x-p.x)*.55+laneClearance(s,p,q)*1.1-distance(p,q)*.08}))
      .sort((a,b)=>b.score-a.score||a.q.id.localeCompare(b.q.id));
    const pass=passes[0];
    target={x:dir*(FIELD.halfWidth-6),z:clamp(p.z+(p.z>=0?2:-2),-FIELD.areaHalf-3,FIELD.areaHalf+3)};
    if(goalDistance<19&&shotClear) {
      target={x:p.x+dir*4,z:p.z+shot.z};
      input.shoot=p.charge<(.3+POKEMON[p.species].stats[2]*.05);
    } else if(pass&&(pressure||pass.score>5||goalDistance<10)) {
      target=pass.q;input.pass=true;
    } else if(goalDistance<7) {
      // Open an angle instead of repeatedly dribbling into Ditto.
      target={x:p.x-dir*3,z:p.z>=0?FIELD.areaHalf+2:-FIELD.areaHalf-2};
      if(shotClear)input.shoot=p.charge<.4;
    }
    input.sprint=!pressure&&p.stamina>25;
  } else if(t.presser===p.id) {
    target=focus;
    if(carrier&&carrier.team!==p.team&&carrier.cloak<=0&&distance(p,carrier)<2.2&&p.actionCd<=0)input.shoot=true;
    input.sprint=distance(p,target)>5&&p.stamina>35;
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
    if(a.kind==='shield'||a.kind==='buff'||a.kind==='cloak')return nearEnemy;
    return nearEnemy&&(carrier?.team!==p.team||a.kind==='zone');
  };
  input.special=p.special>=100&&useful(2)&&random(s)>.3;
  input.normal=p.normal>=100&&useful(1);
  input.simple=p.simpleCd<=0&&useful(0);
  input.item=!!p.item&&(nearEnemy||p.item==='berry'&&distance(p,focus)>6);
  p.aiX=input.moveX;p.aiZ=input.moveZ;p.aiShoot=input.shoot;p.aiSprint=input.sprint;
  return input;
}
