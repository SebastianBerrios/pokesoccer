import { FIELD, fieldPoint } from './geometry.ts';
import { clamp, distance, unit } from './math.ts';
import { attackDirection, byId } from './state.ts';
import type { Fighter, MatchState, TacticalRole, Team, Vec } from './types.ts';

type Anchor = {role:TacticalRole; point:Vec};
function assign(people:Fighter[], anchors:Anchor[], previous:Record<string,TacticalRole>) {
  let best:Anchor[] = [], bestCost=Infinity;
  function visit(rest:Anchor[], chosen:Anchor[], cost:number) {
    if(cost>=bestCost)return;
    const p=people[chosen.length];
    if(!p){best=chosen;bestCost=cost;return;}
    for(const anchor of rest)visit(rest.filter(a=>a!==anchor),[...chosen,anchor],
      cost+distance(p,anchor.point)+(previous[p.id]===anchor.role?0:3));
  }
  visit(anchors,[],0);return best;
}
export function updateTactics(s:MatchState) {
  const carrier=byId(s,s.ball.owner);
  for(const team of [0,1] as Team[]) {
    const t=s.tactics[team], dir=attackDirection(s,team);
    const allies=s.players.filter(p=>p.team===team&&!p.keeper);
    const rivals=s.players.filter(p=>p.team!==team&&!p.keeper&&p.cloak<=0);
    const own=carrier?.team===team;
    // Remember the last visible location; an invisible opponent never supplies a target.
    if(!carrier||own||carrier.cloak<=0)t.focus={x:s.ball.x,z:s.ball.z};
    const focus=t.focus, forward=dir*focus.x;
    let anchors:Anchor[];
    if(own) {
      t.presser=null;
      const wingX=carrier?.keeper?forward+12:forward-1;
      anchors=[
        {role:'cover',point:{x:dir*Math.min(-5,forward-11),z:clamp(focus.z*.25,-4,4)}},
        {role:'left',point:{x:dir*wingX,z:-FIELD.halfDepth*.68}},
        {role:'right',point:{x:dir*wingX,z:FIELD.halfDepth*.68}},
        {role:'forward',point:{x:dir*(forward+10),z:-focus.z*.5}},
      ];
      if(carrier&&!carrier.keeper) {
        // The carrier occupies one flank; the other three preserve cover, width and depth.
        anchors=anchors.filter(a=>a.role!==(carrier.z<0?'left':'right'));
      }
    } else {
      const eligible=allies.filter(p=>p.stun<=0&&p.cast<=0);
      const human=eligible.filter(p=>p.controller&&distance(p,focus)<3.5)
        .sort((a,b)=>distance(a,focus)-distance(b,focus)||a.id.localeCompare(b.id))[0];
      const bots=eligible.filter(p=>!p.controller).sort((a,b)=>distance(a,focus)-distance(b,focus)||a.id.localeCompare(b.id));
      const old=bots.find(p=>p.id===t.presser);
      const press=human??(old&&distance(old,focus)<(bots[0]?distance(bots[0],focus):0)+7?old:bots[0]);
      t.presser=press?.id??null;
      anchors=[
        {role:'cover',point:{x:dir*Math.min(-7,forward-10),z:clamp(focus.z*.4,-4,4)}},
        {role:'left',point:{x:dir*(forward-5),z:-FIELD.halfDepth*.43}},
        {role:'right',point:{x:dir*(forward-5),z:FIELD.halfDepth*.43}},
      ];
      // Shift the two screen positions into visible passing lanes, retaining their side.
      for(const anchor of anchors.filter(a=>a.role!=='cover')) {
        const threat=rivals.filter(p=>p.id!==carrier?.id&&(anchor.role==='left'?p.z<0:p.z>=0))
          .sort((a,b)=>dir*a.x-dir*b.x)[0];
        if(threat)anchor.point={x:dir*Math.min(forward-3,dir*threat.x-2),z:(focus.z+threat.z)*.5};
      }
      if(!press)anchors.push({role:'forward',point:focus});
    }
    for(const anchor of anchors)anchor.point=fieldPoint(anchor.point,3);
    const active=allies.filter(p=>own?p.id!==carrier?.id:p.id!==t.presser);
    // Humans consume the nearest useful space before bots are placed around them.
    active.sort((a,b)=>Number(!!b.controller)-Number(!!a.controller)||a.id.localeCompare(b.id));
    const assigned=assign(active,anchors,t.roles),roles:Record<string,TacticalRole>={},targets:Record<string,Vec>={};
    active.forEach((p,i)=>{
      const anchor=assigned[i];if(!anchor)return;
      roles[p.id]=anchor.role;let point=anchor.point;
      if(own&&carrier&&distance(point,carrier)<6) {
        const v=unit(point.x-carrier.x,point.z-carrier.z||1);
        point=fieldPoint({x:carrier.x+v.x*6,z:carrier.z+v.z*6},2);
      }
      targets[p.id]=point;
    });
    if(own&&carrier&&!carrier.keeper){roles[carrier.id]='carrier';targets[carrier.id]={x:carrier.x,z:carrier.z};}
    if(t.presser){roles[t.presser]='press';targets[t.presser]={...focus};}
    t.roles=roles;t.targets=targets;t.collector=null;
    const cover=allies.find(p=>roles[p.id]==='cover');
    const choices=allies.filter(p=>!p.controller&&p.id!==carrier?.id&&roles[p.id]!=='press'&&roles[p.id]!=='cover')
      .flatMap(p=>s.pickups.filter(o=>(o.kind==='orb'?p.special<100:!p.item)&&distance(p,o)<7&&
        (own||!!cover&&dir*o.x<forward-2&&distance(o,targets[p.id]??p)<4)).map(o=>({p,o,d:distance(p,o)})))
      .sort((a,b)=>a.d-b.d||a.p.id.localeCompare(b.p.id)||a.o.id-b.o.id);
    if(choices[0]){t.collector=choices[0].p.id;targets[choices[0].p.id]=choices[0].o;}
  }
}
