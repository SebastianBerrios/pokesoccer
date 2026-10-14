import { FIELD, POKEMON } from './catalog.ts';
import { distance, unit } from './math.ts';
import { attackDirection, byId, emptyInput, random } from './state.ts';
import type { Fighter, InputFrame, MatchState } from './types.ts';

export function botInput(s:MatchState,p:Fighter,dt:number):InputFrame {
  const input=emptyInput(p.epoch,s.tick);
  p.aiTimer-=dt;
  if(p.aiTimer>0) { input.moveX=p.aiX;input.moveZ=p.aiZ;input.shoot=p.aiShoot;return input; }
  p.aiTimer=.18+random(s)*.12;
  const dir=attackDirection(s,p.team);
  const carrier=byId(s,s.ball.owner);
  const rivals=s.players.filter(q=>q.team!==p.team&&!q.keeper&&q.cloak<=0);
  const allies=s.players.filter(q=>q.team===p.team&&!q.keeper);
  const focus=carrier&&carrier.cloak<=0?carrier:s.ball;
  const closest=[...allies].sort((a,b)=>distance(a,focus)-distance(b,focus))[0];
  let target={x:0,z:0};
  if(carrier?.id===p.id) {
    target={x:dir*21,z:p.z*.6};
    const goalDistance=Math.abs(dir*24-p.x);
    const pressure=rivals.some(q=>distance(q,p)<3);
    if(goalDistance<17) {
      input.shoot=p.charge<(.3+POKEMON[p.species].stats[2]*.05);
      if(p.charge>0&&!input.shoot)p.aiTimer=.22;
    } else if(pressure) {
      const forward=allies.filter(q=>q.id!==p.id&&dir*(q.x-p.x)>2).sort((a,b)=>Math.abs(a.z-p.z)-Math.abs(b.z-p.z))[0];
      if(forward) { target=forward;input.pass=true;input.lob=rivals.some(q=>distance(q,p)<1.8); }
      else input.dodge=true;
    }
    input.sprint=!pressure&&p.stamina>25;
  } else if(closest?.id===p.id&&(!carrier||carrier.team!==p.team)) {
    target=focus;
    if(carrier&&carrier.team!==p.team&&carrier.cloak<=0&&distance(p,carrier)<2.2&&p.actionCd<=0)input.shoot=true;
    input.sprint=distance(p,target)>5&&p.stamina>35;
  } else {
    const advance=carrier?.team===p.team?5:-5;
    target={x:Math.max(-18,Math.min(18,s.ball.x+dir*(p.slot===3?-10:advance))),z:[0,-8,8,0][p.slot]};
    if(carrier?.team===p.team&&p.slot===0)target.x=Math.max(-20,Math.min(20,carrier.x+dir*7));
    const pickup=s.pickups.filter(o=>(o.kind==='orb'?p.special<100:!p.item)&&distance(p,o)<8)
      .sort((a,b)=>distance(p,a)-distance(p,b))[0];
    if(pickup)target=pickup;
  }
  const v=unit(target.x-p.x,target.z-p.z);
  if(distance(target,p)>.6) {input.moveX=v.x;input.moveZ=v.z;}
  const nearEnemy=rivals.some(q=>distance(q,p)<6);
  const ballFree=!carrier&&distance(p,s.ball)<9;
  const abilities=POKEMON[p.species].abilities;
  const useful=(slot:number)=>{
    const a=abilities[slot];
    if(a.kind==='shot')return carrier?.id===p.id&&Math.abs(dir*24-p.x)<21;
    if(a.kind==='pull'||a.kind==='redirect')return ballFree;
    if(a.kind==='blink')return carrier?.id!==p.id&&distance(p,focus)>6;
    if(a.kind==='dash')return carrier?.id===p.id||nearEnemy;
    if(a.kind==='shield'||a.kind==='buff'||a.kind==='cloak')return nearEnemy;
    return nearEnemy&&(carrier?.team!==p.team||a.kind==='zone');
  };
  input.special=p.special>=100&&useful(2)&&random(s)>.3;
  input.normal=p.normal>=100&&useful(1);
  input.simple=p.simpleCd<=0&&useful(0);
  input.item=!!p.item&&(nearEnemy||p.item==='berry'&&distance(p,focus)>6);
  p.aiX=input.moveX;p.aiZ=input.moveZ;p.aiShoot=input.shoot;
  return input;
}
