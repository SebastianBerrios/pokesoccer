import { GLRenderer, multiply, transform, type Shape } from './gl.ts';
import { POKEMON } from '../../../packages/game/src/catalog.ts';
import type { Species } from '../../../packages/game/src/types.ts';

export function drawPokemon(gl:GLRenderer,id:Species,x:number,z:number,yaw:number,time:number,moving=false,scale=1,stun=false,casting=false) {
  const p=POKEMON[id],c=p?.color??'#c09bd8',accent=p?.accent??'#eadff1';
  const bob=moving?Math.abs(Math.sin(time*12))*.1:Math.sin(time*2)*.025;
  const base=transform(x,stun?.15:bob,z,scale,scale,scale,yaw,stun?.6:0);
  const part=(kind:Shape,lx:number,ly:number,lz:number,sx:number,sy:number,sz:number,color:string,rz=0,rx=0)=>{
    gl.add(kind,multiply(base,transform(lx,ly,lz,sx,sy,sz,0,rz,rx)),color);
  };
  const sphere=(lx:number,ly:number,lz:number,sx:number,sy:number,sz:number,color=c)=>part('sphere',lx,ly,lz,sx,sy,sz,color);
  const cone=(lx:number,ly:number,lz:number,sx:number,sy:number,sz:number,color=c,rz=0)=>part('cone',lx,ly,lz,sx,sy,sz,color,rz);
  const eye=(lx:number,ly:number,lz:number,size=.09)=>{sphere(lx,ly,lz,size,size*1.2,.055,'#172626');sphere(lx-.018,ly+.025,lz+.045,size*.3,size*.3,.025,'#ffffff');};
  const stride=moving?Math.sin(time*12)*.23:0;
  if(id==='ditto') {
    sphere(0,.65,0,.86,.7,.64);sphere(-.62,.28,.05,.43,.25,.46);sphere(.62,.28,.05,.43,.25,.46);
    eye(-.22,.88,.58,.065);eye(.22,.88,.58,.065);part('box',0,.63,.64,.22,.04,.04,'#563d67');
    sphere(-.94,.6,.05,.24,.28,.22,'#fbf3da');sphere(.94,.6,.05,.24,.28,.22,'#fbf3da');return;
  }
  const heavy=['snorlax','blastoise','venusaur'].includes(id);
  if(id==='lapras') {
    sphere(0,.56,-.18,.9,.48,1.05);sphere(0,.87,-.42,.85,.27,.86,accent);
    for(const side of [-1,1]){sphere(side*.9,.22,.22,.6,.1,.32);sphere(side*.6,.22,-.86,.42,.1,.3);}
    sphere(0,1.13,.6,.34,.86,.35);sphere(0,1.88,.76,.48,.38,.45);
    cone(-.32,2.16,.62,.18,.5,.18,c,-.5);cone(.32,2.16,.62,.18,.5,.18,c,.5);
    eye(-.23,1.94,1.13);eye(.23,1.94,1.13);
    for(const xx of [-.4,0,.4])cone(xx,1.18,-.5,.15,.5,.15,'#dce4de');
    return;
  }
  if(id==='venusaur') {
    sphere(0,.6,0,1,.58,.88);sphere(0,.84,.75,.67,.5,.55);
    for(const sx of [-1,1])for(const zz of [-.6,.6])sphere(sx*.65,.25,zz,.28,.32,.32);
    cone(-.48,1.22,.66,.2,.4,.19);cone(.48,1.22,.66,.2,.4,.19);
    eye(-.31,.94,1.22);eye(.31,.94,1.22);
    for(let i=0;i<5;i++){const a=i/5*Math.PI*2;sphere(Math.cos(a)*.62,1.17,Math.sin(a)*.62-.2,.65,.12,.35,'#38744d');sphere(Math.cos(a)*.43,1.73,Math.sin(a)*.43-.2,.5,.17,.45,accent);}
    part('cylinder',0,1.45,-.2,.15,.7,.15,'#6d7049');sphere(0,1.87,-.2,.25,.2,.25,'#e8ca62');
    return;
  }
  const bodyY=id==='snorlax'?1: .85;
  sphere(0,bodyY,0,heavy?.86:.51,heavy?.9:.64,heavy?.68:.43);
  for(const side of [-1,1]) {
    sphere(side*(heavy?.48:.31),.25,side*stride,heavy?.34:.23,.24,.38);
    const armY=casting?1.38:.93;
    sphere(side*(heavy?.83:.6),armY,.07,heavy?.25:.19,.38,.22,c);
  }
  const headY=heavy?1.68:1.62;
  sphere(0,headY,.13,heavy?.64:.56,.51,.47);
  if(['pikachu','snorlax','charizard','dragonite','blastoise','lucario'].includes(id))
    sphere(0,bodyY,.36,heavy?.62:.35,heavy?.62:.46,.18,id==='lucario'?accent:'#efe0b5');
  eye(-.21,headY+.08,.54);eye(.21,headY+.08,.54);
  if(id==='pikachu') {
    for(const side of [-1,1]){
      part('box',side*.38,2.18,.05,.2,.77,.18,c,-side*.22);
      part('box',side*.46,2.53,.05,.2,.25,.19,'#443f35',-side*.22);
      sphere(side*.39,1.52,.48,.15,.14,.065,'#e96846');
    }
    part('box',.62,.92,-.59,.22,.65,.18,accent,-.75);
    part('box',.86,1.23,-.66,.46,.23,.15,c,-.6);
    part('box',1.08,1.57,-.71,.39,.72,.18,c,-.4);
    part('box',0,1.38,.577,.13,.028,.035,'#564731');
  }
  if(id==='charizard'||id==='dragonite') {
    for(const side of [-1,1]) {
      part('cone',side*.96,1.2,-.28,.68,id==='charizard'?1.4:.85,.14,accent,side*.75);
      part('cone',side*1.1,1.27,-.3,.2,1.3,.12,c,side*.9);
      cone(side*.35,2.14,.03,.12,.38,.12,c,-side*.4);
    }
    sphere(0,1.55,.56,.32,.24,.39);
    sphere(0,.58,-.6,.27,.23,.7);sphere(0,.72,-1.14,.16,.25,.38);
    if(id==='charizard'){cone(0,1.15,-1.47,.27,.74,.22,'#ff8543');cone(0,1.17,-1.47,.13,.45,.14,'#ffe179');}
    else for(const side of [-1,1])part('cylinder',side*.2,2.27,.03,.035,.55,.035,'#f4dfb0',side*.3);
  }
  if(id==='blastoise') {
    sphere(0,1,-.44,.92,.91,.45,accent);sphere(0,1,-.77,.76,.77,.22,'#796245');
    for(const side of [-1,1]){
      part('cylinder',side*.51,1.69,-.28,.18,.85,.18,'#c3ccd0',0,Math.PI/2);
      part('cylinder',side*.51,1.69,.18,.13,.025,.13,'#344a50',0,Math.PI/2);
      cone(side*.37,2.1,.08,.18,.3,.14);
    }
  }
  if(id==='gengar') {
    for(const side of [-1,1]){cone(side*.4,2.1,0,.27,.5,.22,c,side*.25);sphere(side*.22,1.68,.56,.16,.1,.055,'#f57f98');}
    for(const xx of [-.5,0,.5])cone(xx,1.55,-.36,.25,.65,.25);
    part('box',0,1.4,.58,.59,.13,.055,'#f6efde');
    for(const xx of [-.2,0,.2])part('box',xx,1.4,.61,.02,.13,.025,'#6f537e');
  }
  if(id==='machamp') {
    for(const side of [-1,1]){sphere(side*.75,1.44,-.14,.28,.48,.26);sphere(side*.9,1.06,.15,.28,.22,.3);}
    part('box',0,.45,.05,1,.16,.7,'#3d4a4c');part('box',0,.45,.45,.3,.2,.08,accent);
    for(const xx of [-.25,0,.25])part('box',xx,2.07,.06,.11,.35,.42,accent);
    sphere(0,1.44,.55,.3,.1,.16,'#d9c8aa');
  }
  if(id==='alakazam') {
    part('cone',0,1.06,.32,.48,.7,.2,accent,Math.PI);
    for(const side of [-1,1]) {
      cone(side*.38,2.16,.04,.19,.61,.16,c,side*.3);
      part('cone',side*.35,1.4,.62,.1,.82,.11,'#f1d796',side*1.12);
      part('cylinder',side*.78,.85,.28,.035,.52,.035,'#d7e2df',side*.2);
      sphere(side*.84,1.15,.28,.13,.19,.065,'#d7e2df');
    }
  }
  if(id==='snorlax') {
    for(const side of [-1,1]){cone(side*.46,2.12,.06,.2,.44,.2);part('box',side*.23,1.79,.572,.18,.028,.035,'#263f42');}
    part('box',0,1.56,.618,.28,.026,.03,'#33474a');
  }
  if(id==='lucario') {
    for(const side of [-1,1]){
      cone(side*.35,2.25,.05,.19,.75,.16,'#334a57',side*.1);
      sphere(side*.25,1.68,.5,.23,.16,.08,'#314d5d');
      eye(side*.23,1.72,.575,.075);
      part('cone',side*.72,.91,.31,.12,.32,.12,'#e9e6c7',side*1.4);
      part('box',side*.25,.28,-.05,.26,.65,.28,'#324b5e');
    }
    part('cone',0,1.08,.6,.15,.42,.15,'#f0e5c9',0,Math.PI/2);
    sphere(0,1.44,.64,.22,.19,.23,c);
  }
  if(id==='greninja') {
    for(const side of [-1,1]){
      cone(side*.5,1.99,.08,.27,.8,.2,c,side*.8);
      sphere(side*.24,1.68,.53,.16,.14,.045,'#edf0d5');eye(side*.24,1.68,.58,.07);
      sphere(side*.65,.45,.13,.35,.15,.34);
    }
    part('cylinder',0,1.19,.06,.47,.18,.45,accent);
    part('box',.58,1.3,-.24,.95,.18,.21,accent,-.25);
    sphere(0,1.48,.48,.14,.12,.2,'#e7d9a2');
  }
}
