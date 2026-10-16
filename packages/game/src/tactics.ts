import { FIELD } from './catalog.ts';
import { fieldPoint } from './geometry.ts';
import { clamp, distance, unit } from './math.ts';
import { attackDirection, byId } from './state.ts';
import { positionFor } from './team-plan.ts';
import type { Fighter, MatchState, TacticalRole, Team, Vec } from './types.ts';

export function updateTactics(s: MatchState) {
  const carrier=byId(s,s.ball.owner);
  for(const team of [0,1] as Team[]) {
    const t=s.tactics[team],plan=s.teamPlans[team],dir=attackDirection(s,team);
    const allies=s.players.filter(p=>p.team===team&&!p.keeper);
    const own=carrier?.team===team,focus={x:s.ball.x,z:s.ball.z},forward=dir*focus.x;
    t.focus=focus;
    const possession=plan.style==='possession',counter=plan.style==='counterattack';
    const center=own?clamp(forward*.48-3,-15,12):clamp(forward*.38-(counter?16:11),-24,0);
    const length=FIELD.halfWidth*(possession?.4:.52),width=FIELD.halfDepth*(possession?.76:1);
    const roles:Record<string,TacticalRole>={},targets:Record<string,Vec>={};
    for(const p of allies) {
      const home=positionFor(plan,p.slot);
      let x=center+home.x*length,z=home.z*width+clamp(focus.z*.16,-3,3);
      if(home.role==='cover')x=Math.min(x,own?Math.min(-4,forward-10):forward-8);
      if(own&&home.role==='forward')x=Math.max(x,forward+(counter?11:7));
      if(own&&possession&&home.role!=='cover'&&home.role!=='forward')x=forward-5;
      if(!own&&counter&&home.role==='forward')x=Math.max(x,-4);
      roles[p.id]=home.role;
      targets[p.id]=fieldPoint({x:dir*x,z},3);
    }
    if(own&&carrier&&!carrier.keeper)roles[carrier.id]='carrier';

    // Only the designated press leaves the block. Keep a nearby press stable, never exchange home positions.
    if(!own) {
      const eligible=allies.filter(p=>p.stun<=0&&p.cast<=0);
      const human=eligible.filter(p=>p.controller&&distance(p,focus)<3.5)
        .sort((a,b)=>distance(a,focus)-distance(b,focus)||a.id.localeCompare(b.id))[0];
      let bots=eligible.filter(p=>!p.controller&&
        (roles[p.id]!=='cover'||forward<-10||allies.filter(q=>roles[q.id]==='cover').length>1)&&
        distance(targets[p.id],focus)<19);
      if(!bots.length)bots=eligible.filter(p=>!p.controller);
      bots.sort((a,b)=>distance(a,focus)-distance(b,focus)||a.id.localeCompare(b.id));
      const old=bots.find(p=>p.id===t.presser);
      const press=human??(old&&distance(old,focus)<distance(bots[0]??old,focus)+3?old:bots[0]);
      t.presser=press?.id??null;
      if(press){roles[press.id]='press';targets[press.id]=focus;}
    } else t.presser=null;

    // When a defender carries or a human leaves the block, one support covers until they return.
    const covered=allies.some(p=>roles[p.id]==='cover'&&(!p.controller||distance(p,targets[p.id])<8));
    if(!covered) {
      const coverPoint=fieldPoint({x:dir*Math.min(-6,forward-11),z:clamp(focus.z*.22,-5,5)},3);
      const substitute=allies.filter(p=>!p.controller&&p.id!==carrier?.id&&p.id!==t.presser)
        .sort((a,b)=>distance(a,coverPoint)-distance(b,coverPoint)||a.id.localeCompare(b.id))[0];
      if(substitute){roles[substitute.id]='cover';targets[substitute.id]=coverPoint;}
    }
    if(own&&carrier&&!carrier.keeper&&!allies.some(p=>p.id!==carrier.id&&roles[p.id]==='forward')) {
      const runner=allies.filter(p=>!p.controller&&p.id!==carrier.id&&roles[p.id]!=='cover')
        .sort((a,b)=>distance(a,carrier)-distance(b,carrier)||a.id.localeCompare(b.id))[0];
      if(runner){roles[runner.id]='forward';targets[runner.id]=fieldPoint({x:dir*(forward+9),z:clamp(runner.z*.65,-10,10)},3);}
    }
    if(own&&carrier) {
      for(const p of allies) {
        if(p.controller||p.id===carrier.id||roles[p.id]==='cover')continue;
        const target=targets[p.id];
        const blockers=[carrier,...allies.filter(q=>q.controller&&q.id!==carrier.id)];
        for(const human of blockers)if(distance(target,human)<6) {
          const v=unit(target.x-human.x,target.z-human.z||((p.slot%2)*2-1));
          Object.assign(target,fieldPoint({x:human.x+v.x*6,z:human.z+v.z*6},3));
        }
      }
    }
    t.roles=roles;t.targets=targets;t.collector=null;
    const cover=allies.find(p=>roles[p.id]==='cover');
    const choices=allies.filter(p=>!p.controller&&p.id!==carrier?.id&&roles[p.id]!=='press'&&roles[p.id]!=='cover')
      .flatMap(p=>s.pickups.filter(o=>(o.kind==='orb'?p.special<100:!p.item)&&distance(p,o)<9&&
        (own||!!cover&&dir*o.x<forward-2&&distance(o,targets[p.id])<5)).map(o=>({p,o,d:distance(p,o)})))
      .sort((a,b)=>a.d-b.d||a.p.id.localeCompare(b.p.id)||a.o.id-b.o.id);
    if(choices[0]){t.collector=choices[0].p.id;targets[choices[0].p.id]=choices[0].o;}
  }
}
