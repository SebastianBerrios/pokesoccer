import { GLRenderer, multiply, transform, type Shape } from './gl.ts';
import { installCharacterMeshes } from './meshes.ts';
import { POKEMON } from '../../../packages/game/src/catalog.ts';
import type { FighterAction, Species } from '../../../packages/game/src/types.ts';

export const MODEL_BOUNDS: Record<Species,{height:number;width:number}> = {
  pikachu:{height:2.85,width:2.1},charizard:{height:3.35,width:4.5},blastoise:{height:2.5,width:2.2},
  venusaur:{height:2.75,width:3},gengar:{height:2.4,width:2.25},machamp:{height:2.8,width:2.9},
  alakazam:{height:2.95,width:2.4},snorlax:{height:2.65,width:2.35},lapras:{height:3.05,width:2.8},
  dragonite:{height:3.25,width:3.1},lucario:{height:3.05,width:2.2},greninja:{height:2.55,width:2.8},
  ditto:{height:1.6,width:2.25},
};
export interface ModelAction { kind: FighterAction; progress: number; ability?: string | null }
export function drawPokemon(gl:GLRenderer,id:Species,x:number,z:number,yaw:number,time:number,moving=false,scale=1,stun=false,casting=false,action?:ModelAction) {
  installCharacterMeshes(gl);
  const c=POKEMON[id]?.color??'#bd94d7',accent=POKEMON[id]?.accent??'#eadff1';
  const cycle=time*9,stride=moving?Math.sin(cycle)*.48:0;
  const pulse=action?Math.sin(Math.min(1,action.progress)*Math.PI):0;
  const kick=action?.kind==='pass'||action?.kind==='shot'?pulse:0;
  const tackle=action?.kind==='tackle'||action?.kind==='dodge'?pulse:0;
  const cast=casting||action?.kind==='cast';
  const special=action?.ability?.endsWith('-special');
  const bounce=(moving?Math.abs(Math.sin(cycle))*.07:Math.sin(time*2)*.018)+(id==='snorlax'&&special?pulse*1.8:0);
  const base=transform(x,bounce+(stun?.1:0),z,scale,scale,scale,yaw,stun?.35:0,tackle*.3-kick*.12);
  const part=(kind:Shape,lx:number,ly:number,lz:number,sx:number,sy:number,sz:number,color=c,rz=0,rx=0,ry=0)=>{
    gl.add(kind,multiply(base,transform(lx,ly,lz,sx,sy,sz,ry,rz,rx)),color);
  };
  const oval=(lx:number,ly:number,lz:number,sx:number,sy:number,sz:number,color=c,rx=0)=>part('sphere',lx,ly,lz,sx,sy,sz,color,0,rx);
  const cone=(lx:number,ly:number,lz:number,sx:number,sy:number,sz:number,color=c,rz=0,rx=0)=>part('cone',lx,ly,lz,sx,sy,sz,color,rz,rx);
  const eye=(lx:number,ly:number,lz:number,size=.1,color='#17282a')=>{
    if(!['pikachu','ditto'].includes(id))oval(lx,ly,lz-.015,size*1.65,size*1.35,.055,'#fff9e7');
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
    part('pear',0,.68,0,.86,.69,.67);oval(0,.4,.08,.94,.32,.7);
    for(const side of [-1,1])oval(side*.55,.98,.03,.35,.3,.46);
    for(const side of [-1,1]) {
      oval(side*.65,.28,.05,.42,.22,.43);
      oval(side*.9,.72+Math.sin(time*3)*.06,.05,.22,.3,.22,c);
      eye(side*.24,.92,.61,.055);
    }
    mouth(.66,.7,.25,'#654973');return;
  }
  if(id==='pikachu') {
    part('pear',0,.84,-.06,.53,.65,.4);part('cheek',0,1.7,.08,.64,.52,.48);
    for(const side of [-1,1]) {
      limb(side*.46,1.15,.06,.55,.16,c,cast?-1.6:-.25+side*stride*.6);
      foot(side,.29,.2,.15,.22,.16,.34);
      part('ear',side*.39,2.28,.04,.44,.73,.7,c,-side*.25);
      part('ear',side*.49,2.65,.04,.27,.25,.72,'#302e2a',-side*.25);
      oval(side*.47,1.57,.47,.145,.13,.05,'#ea5546');
      eye(side*.25,1.83,.51,.105);
    }
    cone(0,1.68,.59,.07,.09,.06,'#342d2d',0,Math.PI);mouth(1.5,.53,.15);
    part('box',0,1.1,-.425,.56,.13,.035,'#925330');part('box',0,.83,-.45,.52,.12,.035,'#925330');
    part('bolt',.48,.6,-.62,1,1,.8,c,-.18+Math.sin(time*3)*.08);return;
  }
  if(id==='venusaur') {
    part('pear',0,.72,-.05,1.03,.62,.93);part('cheek',0,.84,.78,.8,.48,.62);
    for(const side of [-1,1]) {
      for(const zz of [-.62,.6]){oval(side*.67,.32,zz+stride*side*.12,.28,.32,.3);claws(side*.67,.2,zz+.27);}
      cone(side*.55,1.22,.69,.21,.47,.18,c,-side*.2);
      oval(side*.34,1,1.33,.2,.13,.045,'#f9e7cc');eye(side*.34,1,1.37,.09,'#b85168');
      oval(side*.63,.75,1.12,.09,.065,.035,'#4a8277');
      cone(side*.38,.62,1.32,.065,.16,.055,'#fff2d3',0,Math.PI);
    }
    mouth(.66,1.4,.64);part('cylinder',0,1.45,-.3,.25,1.25,.24,'#846543');
    for(let i=0;i<6;i++){
      const a=i*Math.PI/3;part('leaf',Math.cos(a)*.65,1.4,Math.sin(a)*.65-.3,.64,.95,.8,'#327849',0,1.1,a);
      oval(Math.cos(a)*.54,2.13,Math.sin(a)*.54-.3,.6,.18,.46,'#e87991');
      oval(Math.cos(a)*.7,2.24,Math.sin(a)*.66-.3,.12,.026,.1,'#f6c0ba');
    }
    oval(0,2.4,-.3,.29,.28,.28,'#eec65e');return;
  }
  if(id==='lapras') {
    part('pear',0,.59,-.25,.82,.46,1.05);part('shell',0,.89,-.46,.78,.28,.84,'#b5b4ce');
    oval(0,1.59,.59,.34,1.02,.35);oval(0,2.4,.76,.47,.4,.45);
    oval(0,2.25,1.09,.34,.19,.3,'#dce0bf');cone(0,2.82,1,.09,.42,.09,'#ebdfb4');
    for(const side of [-1,1]) {
      part('fin',side*.8,.24,.2,.65,.75,.8,c,0,Math.PI/2+side*stride*.2,side*.8);
      oval(side*.57,.23,-1.03,.4,.08,.32);
      oval(side*.43,2.57,.55,.24,.13,.2,c);
      part('ring',side*.43,2.58,.56,.12,1,.12,'#467aab',0,Math.PI/2);
      eye(side*.23,2.44,1.12,.09);
    }
    for(const xx of [-.45,0,.45])for(const zz of [-.85,-.28])cone(xx,1.25,zz,.14,.5,.13,'#d7d7df');
    mouth(2.19,1.34,.19);return;
  }
  if(id==='gengar') {
    part('pear',0,1.03,0,.85,.92,.65);
    for(let i=-2;i<=2;i++)cone(i*.2,1.72-Math.abs(i)*.13,-.52,.19,.55,.18,c,i*.25);
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
    part('pear',0,1.13,0,1.02,1.03,.78);oval(0,1.07,.48,.74,.79,.33,'#ead9b4');
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
    part('shell',0,1.1,-.24,.88,.93,.65,'#e0ccb1');part('shell',0,1.1,-.51,.8,.82,.5,'#8a6845');
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
  if(id==='charizard') {
    part('pear',0,1.08,-.08,.57,.86,.46);oval(0,1.08,.29,.44,.67,.22,'#f6d9a3');
    // Long neck and angular muzzle distinguish the fire dragon from Dragonite.
    oval(0,1.92,.02,.25,.63,.27);part('cheek',0,2.48,.12,.38,.34,.34);
    part('chest',0,2.35,.48,.3,.19,.42);oval(0,2.26,.49,.28,.065,.38,'#f2d5a1');
    for(const side of [-1,1]) {
      cone(side*.27,2.9,-.04,.13,.65,.13,c,-side*.27);
      eye(side*.23,2.55,.37,.085,'#397e9b');cone(side*.19,2.23,.7,.045,.12,.045,'#fff6e0',0,Math.PI);
      limb(side*.59,1.68,.1,.62,.16,c,cast?-1.45:-.35+side*stride*.4);
      foot(side,.43,.23,.24,.29,.22,.42);claws(side*.43,.22,.6);
      const flap=Math.sin(time*(moving?7:2.5))*.16;
      part('wing',side*.32,1.43,-.28,side*1.35,1.45,.8,c,side*flap);
      part('wing',side*.37,1.47,-.19,side*1.19,1.25,.35,accent,side*flap);
      limb(side*.36,1.89,-.22,.7,.07,c,-1.8);
    }
    oval(0,.52,-.65,.24,.24,.65);oval(.17,.62,-1.2,.17,.2,.47,c,-.35);
    cone(.26,1.04,-1.55,.25,.72+Math.sin(time*14)*.08,.2,'#ed582c');
    cone(.26,1.06,-1.52,.13,.45,.12,'#ffe471');mouth(2.3,.84,.22);return;
  }
  if(id==='dragonite') {
    part('pear',0,1.22,0,.77,.98,.61);oval(0,1.16,.44,.58,.79,.23,'#f2d5a1');
    for(const yy of [.72,1.02,1.32,1.62])part('box',0,yy,.65,.8,.035,.025,'#d5b786');
    part('cheek',0,2.27,.06,.53,.56,.43);oval(0,2.13,.43,.42,.24,.36);
    for(const side of [-1,1]) {
      eye(side*.23,2.45,.43,.11,'#395e62');oval(side*.13,2.23,.76,.035,.025,.025,'#674b35');
      limb(side*.76,1.67,.08,.69,.23,c,cast?-1.5:-.2+side*stride*.3);
      foot(side,.48,.23,.23,.34,.22,.46);claws(side*.48,.22,.62);
      part('cylinder',side*.24,2.92,.02,.035,.45,.035,'#f7e5b9',side*.4);
      oval(side*.34,3.13,.02,.065,.065,.065,'#f7e5b9');
      const flap=Math.sin(time*3)*.12;
      part('wing',side*.48,1.66,-.37,side*.65,.8,.7,c,side*(.3+flap));
      part('wing',side*.5,1.7,-.29,side*.55,.67,.35,accent,side*(.3+flap));
    }
    oval(0,.5,-.64,.32,.25,.66);oval(.2,.54,-1.14,.2,.18,.46);oval(.38,.58,-1.51,.09,.1,.22);
    mouth(1.99,.735,.27);return;
  }
  if(id==='machamp') {
    part('chest',0,1.23,0,.66,.7,.42);oval(0,1.55,.15,.73,.37,.35);
    for(const side of [-1,1])oval(side*.29,1.62,.38,.28,.2,.1);
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
    part('chest',0,1.21,0,.44,.6,.3);part('cone',0,1.31,.2,.53,.85,.23,accent,Math.PI);
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
    part('chest',0,1.34,0,.38,.58,.3,'#e5d7b1');oval(0,.82,0,.44,.35,.33,c);
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
  part('chest',0,1.09,-.05,.43,.52,.31);part('cheek',0,1.83,.06,.6,.39,.35);
  cone(0,1.58,.37,.3,.54,.22,'#e0d6a6',Math.PI);
  for(const side of [-1,1]) {
    oval(side*.56,.63,-.06,.36,.22,.4);
    limb(side*.75,.58,.04,.45,.14,c,-.55+side*stride);
    foot(side,.86,.14,.26,.36,.09,.39);
    limb(side*.45,1.33,.06,.65,.12,c,cast?-1.65:-.7+side*stride*.4);
    oval(side*.64,.96,.51,.22,.1,.23);
    part('fin',side*.22,1.93,-.06,.58,.61,.9,c,-side*.75);
    part('box',side*.26,1.96,.37,.28,.16,.04,'#f8efcf',side*.2);
    eye(side*.26,1.96,.41,.075,'#b94359');
    oval(side*.55,1.53,.1,.13,.13,.12,'#b7d8e2');
  }
  part('cylinder',0,1.48,.01,.49,.18,.39,accent);
  part('box',.68,1.57,-.29,1.04,.19,.19,accent,-.2-Math.sin(time*4)*.08);
  cone(1.17,1.71,-.29,.16,.39,.09,accent,-1.3);
}
