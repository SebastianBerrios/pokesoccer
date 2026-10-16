import { GLRenderer, multiply, transform, type Shape } from './gl.ts';
import { POKEMON } from '../../../packages/game/src/catalog.ts';
import type { FighterAction, Species } from '../../../packages/game/src/types.ts';

export const MODEL_BOUNDS: Record<Species,{height:number;width:number}> = {
  pikachu:{height:2.85,width:2.1},charizard:{height:3.05,width:3.7},blastoise:{height:2.5,width:2.2},
  venusaur:{height:2.75,width:3},gengar:{height:2.4,width:2.25},machamp:{height:2.8,width:2.9},
  alakazam:{height:2.95,width:2.4},snorlax:{height:2.65,width:2.35},lapras:{height:3.05,width:2.8},
  dragonite:{height:3.15,width:2.9},lucario:{height:3.05,width:2.2},greninja:{height:2.55,width:2.8},
  ditto:{height:1.6,width:2.25},
};
export interface ModelAction { kind: FighterAction; progress: number }
export function drawPokemon(gl:GLRenderer,id:Species,x:number,z:number,yaw:number,time:number,moving=false,scale=1,stun=false,casting=false,action?:ModelAction) {
  const c=POKEMON[id]?.color??'#bd94d7',accent=POKEMON[id]?.accent??'#eadff1';
  const cycle=time*9,stride=moving?Math.sin(cycle)*.48:0;
  const pulse=action?Math.sin(Math.min(1,action.progress)*Math.PI):0;
  const kick=action?.kind==='pass'||action?.kind==='shot'?pulse:0;
  const tackle=action?.kind==='tackle'||action?.kind==='dodge'?pulse:0;
  const cast=casting||action?.kind==='cast';
  const bounce=moving?Math.abs(Math.sin(cycle))*.07:Math.sin(time*2)*.018;
  const base=transform(x,bounce+(stun?.1:0),z,scale,scale,scale,yaw,stun?.35:0,tackle*.3-kick*.12);
  const part=(kind:Shape,lx:number,ly:number,lz:number,sx:number,sy:number,sz:number,color=c,rz=0,rx=0,ry=0)=>{
    gl.add(kind,multiply(base,transform(lx,ly,lz,sx,sy,sz,ry,rz,rx)),color);
  };
  const oval=(lx:number,ly:number,lz:number,sx:number,sy:number,sz:number,color=c,rx=0)=>part('sphere',lx,ly,lz,sx,sy,sz,color,0,rx);
  const cone=(lx:number,ly:number,lz:number,sx:number,sy:number,sz:number,color=c,rz=0,rx=0)=>part('cone',lx,ly,lz,sx,sy,sz,color,rz,rx);
  const eye=(lx:number,ly:number,lz:number,size=.1,color='#17282a')=>{
    oval(lx,ly,lz,size,size*1.2,.045,color);
    oval(lx-.025,ly+.032,lz+.035,size*.3,size*.3,.018,'#fffdf0');
  };
  const mouth=(ly:number,lz:number,width=.22,color='#473e43')=>part('box',0,ly,lz,width,.035,.035,color);
  const limb=(lx:number,ly:number,lz:number,length:number,radius:number,color:string,angle:number)=>{
    oval(lx,ly-Math.cos(angle)*length*.5,lz+Math.sin(angle)*length*.5,radius,length*.58,radius,color,angle);
  };
  const foot=(side:number,lx:number,ly:number,lz:number,sx:number,sy:number,sz:number,color=c)=>{
    oval(side*lx,ly+Math.max(0,side*stride)*.12,lz+side*stride*.28+(side===1?kick*.5:0),sx,sy,sz,color);
  };
  const claws=(lx:number,ly:number,lz:number)=>{for(const dx of [-.12,0,.12])cone(lx+dx,ly,lz,.055,.19,.065,'#f7ead0',0,Math.PI/2);};
  if(id==='ditto') {
    oval(0,.65,0,.83,.68,.68);oval(0,.4,.08,.94,.32,.7);
    for(const side of [-1,1]) {
      oval(side*.65,.28,.05,.42,.22,.43);
      oval(side*.9,.72+Math.sin(time*3)*.06,.05,.22,.3,.22,'#fff2d3');
      eye(side*.24,.92,.61,.055);
    }
    mouth(.66,.7,.25,'#654973');return;
  }
  if(id==='pikachu') {
    oval(0,.84,-.06,.51,.62,.4);oval(0,1.7,.08,.64,.52,.48);
    for(const side of [-1,1]) {
      limb(side*.46,1.15,.06,.55,.16,c,cast?-1.6:-.25+side*stride*.6);
      foot(side,.29,.2,.15,.22,.16,.34);
      part('box',side*.39,2.32,.04,.2,.82,.18,c,-side*.25);
      part('box',side*.49,2.67,.04,.21,.27,.19,'#302e2a',-side*.25);
      oval(side*.47,1.57,.47,.145,.13,.05,'#ea5546');
      eye(side*.25,1.83,.51,.105);
    }
    cone(0,1.68,.59,.07,.09,.06,'#342d2d',0,Math.PI);mouth(1.5,.53,.15);
    part('box',0,1.1,-.425,.56,.13,.035,'#925330');part('box',0,.83,-.45,.52,.12,.035,'#925330');
    const sway=Math.sin(time*3)*.08;
    part('box',.55,.65,-.6,.18,.6,.16,'#925330',-.6+sway);
    part('box',.76,1,-.65,.55,.22,.16,c,-.4+sway);
    part('box',1.02,1.38,-.65,.29,.72,.15,c,-.4+sway);
    part('box',1.19,1.69,-.65,.54,.3,.15,c,.12+sway);return;
  }
  if(id==='venusaur') {
    oval(0,.72,-.05,.96,.6,.93);oval(0,.84,.78,.78,.48,.62);
    for(const side of [-1,1]) {
      for(const zz of [-.62,.6]){oval(side*.67,.32,zz+stride*side*.12,.28,.32,.3);claws(side*.67,.2,zz+.27);}
      cone(side*.55,1.22,.69,.21,.47,.18,c,-side*.2);
      oval(side*.34,1,1.33,.2,.13,.045,'#f9e7cc');eye(side*.34,1,1.37,.09,'#b85168');
      oval(side*.63,.75,1.12,.09,.065,.035,'#4a8277');
      cone(side*.38,.62,1.32,.065,.16,.055,'#fff2d3',0,Math.PI);
    }
    mouth(.66,1.4,.64);part('cylinder',0,1.45,-.3,.25,1.25,.24,'#846543');
    for(let i=0;i<6;i++){
      const a=i*Math.PI/3;part('cone',Math.cos(a)*.68,1.32,Math.sin(a)*.63-.3,.4,1.2,.15,'#327849',Math.PI/2,0,a);
      oval(Math.cos(a)*.54,2.13,Math.sin(a)*.54-.3,.6,.18,.46,'#e87991');
      oval(Math.cos(a)*.7,2.24,Math.sin(a)*.66-.3,.12,.026,.1,'#f6c0ba');
    }
    oval(0,2.4,-.3,.29,.28,.28,'#eec65e');return;
  }
  if(id==='lapras') {
    oval(0,.59,-.25,.82,.46,1.05);oval(0,.89,-.46,.78,.28,.84,'#b5b4ce');
    oval(0,1.59,.59,.34,1.02,.35);oval(0,2.4,.76,.47,.4,.45);
    oval(0,2.25,1.09,.34,.19,.3,'#dce0bf');cone(0,2.82,1,.09,.42,.09,'#ebdfb4');
    for(const side of [-1,1]) {
      oval(side*.91,.24,.2,.58,.1,.35,c,side*stride*.2);
      oval(side*.57,.23,-1.03,.4,.08,.32);
      oval(side*.43,2.57,.55,.24,.13,.2,c);
      part('ring',side*.43,2.58,.56,.12,1,.12,'#467aab',0,Math.PI/2);
      eye(side*.23,2.44,1.12,.09);
    }
    for(const xx of [-.45,0,.45])for(const zz of [-.85,-.28])cone(xx,1.25,zz,.14,.5,.13,'#d7d7df');
    mouth(2.19,1.34,.19);return;
  }
  if(id==='gengar') {
    oval(0,1.03,0,.8,.92,.65);
    for(const side of [-1,1]) {
      cone(side*.54,1.98,-.03,.3,.73,.24,c,-side*.38);
      oval(side*.85,1.02,.03,.33,.22,.29,c,cast?-1:stride*.3);
      foot(side,.43,.18,.15,.3,.16,.36);
      oval(side*.31,1.49,.59,.24,.13,.055,'#ed5b83');
      oval(side*.3,1.49,.65,.055,.11,.02,'#3a294d');
      for(const zz of [-.4,-.7])cone(side*.43,1.47,zz,.22,.55,.2,c,side*.6);
    }
    cone(0,1.91,-.4,.24,.62,.22);oval(0,1.04,.617,.51,.25,.055,'#fcf2d7');
    for(const xx of [-.3,-.15,0,.15,.3])part('box',xx,1.05,.679,.025,.3,.015,'#715585');
    return;
  }
  if(id==='snorlax') {
    oval(0,1.13,0,.91,1.03,.73);oval(0,1.07,.48,.74,.79,.33,'#ead9b4');
    oval(0,2.04,.04,.64,.49,.52);oval(0,2.04,.39,.5,.34,.22,'#efdfbe');
    for(const side of [-1,1]) {
      cone(side*.47,2.4,.03,.2,.47,.18,c,-side*.23);
      limb(side*.89,1.57,.01,.74,.28,c,cast?-1.2:-.15);
      foot(side,.55,.22,.42,.37,.2,.42,'#ead9b4');claws(side*.55,.23,.79);
      part('box',side*.22,2.12,.6,.18,.027,.03,'#273c3c',-side*.12);
      cone(side*.17,1.83,.62,.055,.13,.04,'#fff6df',0,Math.PI);
    }
    mouth(1.87,.635,.28);return;
  }
  if(id==='blastoise') {
    oval(0,1.1,-.24,.85,.91,.62,'#e0ccb1');oval(0,1.1,-.51,.76,.8,.49,'#8a6845');
    for(const yy of [.69,1.04,1.38])part('box',0,yy,-.98,.9,.055,.045,'#62492f');
    oval(0,1.02,.25,.65,.7,.4,'#dec7a0');
    for(const yy of [.69,.97,1.25])part('box',0,yy,.643,1.05,.035,.025,'#a58a63');
    oval(0,1.91,.27,.56,.39,.47);oval(0,1.76,.57,.43,.19,.34);
    for(const side of [-1,1]) {
      limb(side*.72,1.44,.08,.68,.25,c,cast?-1.2:-.3+stride*side*.25);
      foot(side,.48,.2,.19,.32,.19,.4);claws(side*.48,.22,.53);
      cone(side*.4,2.19,.13,.18,.32,.15);
      eye(side*.26,1.99,.65,.09);
      part('cylinder',side*.58,1.88,-.27,.18,1.19,.18,'#aabcc4',0,Math.PI/2-.13);
      part('cylinder',side*.58,1.97,.32,.13,.035,.13,'#273d49',0,Math.PI/2-.13);
      part('cylinder',side*.58,1.96,.24,.21,.12,.21,'#dee5df',0,Math.PI/2-.13);
    }
    mouth(1.66,.873,.3);return;
  }
  if(id==='charizard'||id==='dragonite') {
    const dragon=id==='dragonite',bodyWidth=dragon?.67:.57;
    oval(0,1.18,0,bodyWidth,.91,.51);oval(0,1.12,.39,bodyWidth*.78,.69,.22,'#f2d5a1');
    oval(0,2.05,.04,dragon?.49:.37,dragon?.55:.54,.38);
    oval(0,dragon?2.25:2.1,.36,dragon?.39:.37,.25,.4);
    for(const side of [-1,1]) {
      limb(side*(bodyWidth+.12),1.59,.05,.61,.18,c,cast?-1.45:-.3+side*stride*.4);
      foot(side,.43,.21,.2,.28,.2,.4);claws(side*.43,.21,.56);
      const flap=Math.sin(time*(moving?7:2.5))*.12;
      const wingSpan=dragon?1:1.36;
      part('cone',side*wingSpan,1.7,-.31,dragon?.48:.72,dragon?1.05:1.65,.1,accent,side*(.8+flap));
      part('cone',side*(wingSpan+.17),1.8,-.34,.13,dragon?1.18:1.76,.12,c,side*(.85+flap));
      eye(side*.22,2.37,.63,.083);
      if(dragon){
        part('cylinder',side*.22,2.87,.03,.035,.48,.035,'#f7e5b9',side*.35);
        oval(side*.3,3.08,.03,.06,.06,.06,'#f7e5b9');
      }else cone(side*.28,2.7,-.08,.14,.64,.13,c,-side*.25);
    }
    oval(0,.52,-.64,.28,.24,.63);oval(.16,.69,-1.12,.18,.23,.44,c,-.5);
    if(!dragon) {
      cone(.25,1.02+Math.sin(time*14)*.04,-1.48,.25,.68,.2,'#f36b35');
      cone(.25,1.04,-1.48,.12,.43,.12,'#ffe471');
    }else oval(.16,.71,-1.42,.11,.17,.2);
    mouth(dragon?2.1:1.96,.73,.23);return;
  }
  if(id==='machamp') {
    oval(0,1.23,0,.61,.7,.4);oval(0,1.55,.15,.73,.37,.35);
    oval(0,2.15,.05,.44,.43,.37);
    part('box',0,.67,.01,1.06,.28,.69,'#2e3742');
    part('box',0,.78,.38,.33,.25,.07,'#e2b65c');part('box',0,.78,.43,.14,.11,.025,'#8b7046');
    for(const side of [-1,1]) {
      limb(side*.35,.7,.02,.56,.24,c,side*stride);foot(side,.37,.17,.18,.29,.15,.35);
      for(const upper of [false,true]) {
        const yy=upper?1.83:1.25,lx=upper?.76:.68;
        oval(side*lx,yy,-.13,.27,.26,.25);
        limb(side*(lx+.23),yy,-.08,.55,.24,c,cast?-1.7:upper?-.8:-.2);
        oval(side*(lx+.28),yy-(cast?-.1:upper?.28:.48),cast?.5:.24,.26,.23,.27);
      }
      eye(side*.18,2.22,.4,.085);
    }
    for(const xx of [-.2,0,.2])part('box',xx,2.55,-.02,.12,.41,.4,'#d7c39d');
    oval(0,1.99,.42,.31,.12,.18,'#d6c09d');mouth(2.01,.599,.34);return;
  }
  if(id==='alakazam') {
    oval(0,1.21,0,.4,.6,.3);part('cone',0,1.31,.2,.53,.85,.23,accent,Math.PI);
    oval(0,2.03,.02,.47,.42,.34);cone(0,1.82,.33,.18,.55,.24,c,Math.PI);
    for(const side of [-1,1]) {
      cone(side*.38,2.48,0,.2,.8,.17,c,-side*.25);
      limb(side*.24,.8,.02,.58,.14,c,side*stride);foot(side,.27,.17,.14,.24,.13,.34);
      limb(side*.5,1.6,.02,.62,.14,c,cast?-1.5:-.9+side*stride*.25);
      oval(side*.76,1.19,.28,.19,.16,.2);
      part('cylinder',side*.84,1.36,.38,.032,.68,.032,'#d5e2e2',-side*.23);
      oval(side*.92,1.72,.38,.13,.19,.055,'#e5ebde');
      part('box',side*.21,2.09,.35,.21,.045,.025,'#3c3530',side*.17);
      cone(side*.38,1.85,.45,.1,.89,.09,'#f3d78e',side*1.23);
    }
    return;
  }
  if(id==='lucario') {
    oval(0,1.34,0,.35,.58,.3,'#e5d7b1');oval(0,.82,0,.44,.35,.33,c);
    oval(0,2.08,0,.45,.4,.34);oval(0,1.94,.34,.26,.21,.33,c);
    cone(0,1.93,.63,.11,.22,.1,'#2e3c49',0,Math.PI/2);
    for(const side of [-1,1]) {
      limb(side*.25,.71,.02,.53,.17,'#2f4053',side*stride);foot(side,.28,.16,.14,.24,.14,.36,'#2f4053');
      limb(side*.46,1.58,.02,.65,.17,c,cast?-1.5:-.25+side*stride*.4);
      oval(side*.58,1.02,.15,.21,.19,.25,'#2f4053');
      cone(side*.62,1.06,.37,.1,.32,.1,'#f3edcf',0,Math.PI/2);
      cone(side*.3,2.67,-.02,.15,.75,.14,'#2f4053',-side*.1);
      cone(side*.3,2.59,.06,.065,.45,.055,c,-side*.1);
      oval(side*.23,2.12,.29,.24,.14,.07,'#273c51');
      eye(side*.23,2.14,.355,.07,'#c64d51');
      limb(side*.37,2.07,-.23,.62,.12,'#2f4053',-.3);
    }
    cone(0,1.43,.4,.12,.43,.12,'#fff0cf',0,Math.PI/2);
    oval(.13,.82,-.49,.14,.17,.51,c,.35);return;
  }
  // Greninja has a low, wide frog stance, long articulated legs and a tongue scarf.
  oval(0,1.09,-.05,.4,.52,.31);oval(0,1.83,.06,.58,.39,.35);
  cone(0,1.58,.37,.3,.54,.22,'#e0d6a6',Math.PI);
  for(const side of [-1,1]) {
    oval(side*.56,.63,-.06,.36,.22,.4);
    limb(side*.75,.58,.04,.45,.14,c,-.55+side*stride);
    foot(side,.86,.14,.26,.36,.09,.39);
    limb(side*.45,1.33,.06,.65,.12,c,cast?-1.65:-.7+side*stride*.4);
    oval(side*.64,.96,.51,.22,.1,.23);
    cone(side*.5,2.15,-.02,.27,.75,.21,c,-side*.8);
    part('box',side*.26,1.96,.37,.28,.16,.04,'#f8efcf',side*.2);
    eye(side*.26,1.96,.41,.075,'#b94359');
    oval(side*.55,1.53,.1,.13,.13,.12,'#b7d8e2');
  }
  part('cylinder',0,1.48,.01,.49,.18,.39,accent);
  part('box',.68,1.57,-.29,1.04,.19,.19,accent,-.2-Math.sin(time*4)*.08);
  cone(1.17,1.71,-.29,.16,.39,.09,accent,-1.3);
}
