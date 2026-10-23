import { GLRenderer } from './gl.ts';
import { installCharacterMeshes } from './meshes.ts';
import type { Effect, Fighter, MatchState, AbilityId } from '../../../packages/game/src/types.ts';
import { POKEMON } from '../../../packages/game/src/catalog.ts';

const ABILITIES=new Map(Object.values(POKEMON).flatMap(p=>p.abilities).map(a=>[a.id,a]));
export const VISUALS: Record<AbilityId,string> = {
  'pikachu-simple':'Estela electrica','pikachu-normal':'Arcos frontales','pikachu-special':'Rayos verticales',
  'charizard-simple':'Rafaga de alas','charizard-normal':'Llamas','charizard-special':'Balon igneo',
  'blastoise-simple':'Chorro','blastoise-normal':'Caparazon','blastoise-special':'Ola y espuma',
  'venusaur-simple':'Cepas','venusaur-normal':'Esporas','venusaur-special':'Jardin',
  'gengar-simple':'Disolucion','gengar-normal':'Esfera oscura','gengar-special':'Niebla espectral',
  'machamp-simple':'Impacto de puno','machamp-normal':'Cuatro brazos','machamp-special':'Rafaga de punos',
  'alakazam-simple':'Portales','alakazam-normal':'Barrera facetada','alakazam-special':'Cucharas y vinculo',
  'snorlax-simple':'Polvo','snorlax-normal':'Postura firme','snorlax-special':'Impacto radial',
  'lapras-simple':'Aliento helado','lapras-normal':'Bloques de hielo','lapras-special':'Ventisca',
  'dragonite-simple':'Espiral de viento','dragonite-normal':'Energia ascendente','dragonite-special':'Estela draconica',
  'lucario-simple':'Puno metalico','lucario-normal':'Acero','lucario-special':'Esfera aural',
  'greninja-simple':'Burbujas','greninja-normal':'Shuriken','greninja-special':'Siluetas acuaticas',
  'item-bomb':'Bomba',
};
export function drawAbilityEffect(g:GLRenderer,e:Effect,time:number) {
  installCharacterMeshes(g);
  const id=e.abilityId,r=e.radius,n=g.quality==='high'?12:5,t=1-e.life/e.maxLife;
  const length=Math.hypot(e.vx,e.vz),dx=length?e.vx/length:e.directionX??1,dz=length?e.vz/length:e.directionZ??0;
  const shape=(kind:string,f:number,y:number,side:number,sx:number,sy:number,sz:number,color=e.color,angle=0)=>
    g.shape(kind,e.x+dx*f-dz*side,y,e.z+dz*f+dx*side,sx,sy,sz,color,-Math.atan2(dz,dx)+angle);
  const ring=(radius=r,y=.08,color=e.color)=>g.shape('ring',e.x,y,e.z,radius,1,radius,color);
  const mote=(i:number,radius=r*.8,y=.5,kind='sphere',size=.16,color=e.color)=>{
    const angle=i/n*Math.PI*2+time*.8;shape(kind,Math.cos(angle)*radius,y,Math.sin(angle)*radius,size,size,size,color,time+i);
  };
  if(e.stage==='impact')for(let i=0;i<n;i++)mote(i,r*(1+t),.3+t,'cone',.12,'#fff5d6');
  if(e.kind==='warning'&&(!id||ABILITIES.get(id)?.kind!=='push')) {
    ring();ring(r*.85,.09,'#fff0bc');
    for(let i=0;i<4;i++)mote(i,r*(.3+.6*t),.2,'cone',.15,'#fff0bc');return;
  }
  if(e.kind==='zone'||e.kind==='wall'||e.kind==='projectile')ring(r);
  // Cone telegraphs follow the actual dot-product threshold, not a circular area.
  if(['pikachu-normal','charizard-simple','machamp-simple','machamp-special','lapras-simple','dragonite-simple'].includes(id??'')) {
    const arc=Math.acos(.25);
    for(let i=0;i<=n;i++){const a=-arc+2*arc*i/n;shape('sphere',Math.cos(a)*r,.08,Math.sin(a)*r,.08,.04,.08);}
  }
  if(e.kind==='warning')return;
  switch(id) {
    case 'pikachu-simple':
      for(let i=0;i<n;i++)shape('box',-i*.22,.35,(i%2-.5)*.25,.45,.08,.1,'#ffe95f',i%2?.6:-.6);break;
    case 'pikachu-normal':
      for(let i=0;i<n;i++){const a=(i/n-.5)*2.4;shape('bolt',Math.cos(a)*r*.65,.5,Math.sin(a)*r*.65,.6,.8,.6,'#fff18b',a);}break;
    case 'pikachu-special':
      for(let i=0;i<(g.quality==='high'?5:3);i++){const a=i*2.4;shape('bolt',Math.cos(a)*r*.55,1.1+Math.sin(time*17+i)*.3,Math.sin(a)*r*.55,.6,2.4,.6,'#fff3a2');}break;
    case 'charizard-simple':
      for(let i=0;i<3;i++)shape('wing',.5+i*r/4,.5+i*.2,0,.8,1,.3,'#eaf1d4',time+i);break;
    case 'charizard-normal': case 'charizard-special':
      for(let i=0;i<n;i++){const a=i*2.4,rad=(.2+i/n*.65)*r;shape('cone',Math.cos(a)*rad,.4+Math.sin(time*12+i)*.2,Math.sin(a)*rad,.25,.9,.25,i%2?'#ff773b':'#ffe572');}break;
    case 'blastoise-simple':
      shape('sphere',0,1,0,r,.25,r,'#b0f2ff');
      for(let i=0;i<5;i++)shape('sphere',-i*.25,1,0,.22,.22,.22,i%2?'#ffffff':'#66cefa');break;
    case 'blastoise-normal':
      for(let i=0;i<6;i++){const a=i*Math.PI/3;shape('shell',Math.cos(a)*.8,1,Math.sin(a)*.8,.3,.8,.3,'#e2dbb1');}break;
    case 'blastoise-special':
      for(let i=0;i<n;i++){const side=(i/(n-1)-.5)*r*1.8;shape('sphere',0,.65,side,.5,.85,.5,'#4dbeef');shape('sphere',.25,1.5,side,.32,.25,.35,'#eefcff');}break;
    case 'venusaur-simple': case 'alakazam-special': {
      const tx=e.targetX??e.x+dx*r,tz=e.targetZ??e.z+dz*r;
      for(let i=0;i<=n;i++){const f=i/n;g.shape(id==='venusaur-simple'?'leaf':'sphere',e.x+(tx-e.x)*f,.7+Math.sin(f*Math.PI)*.7,e.z+(tz-e.z)*f,.16,.2,.16,e.color,time+i);}
      if(id==='alakazam-special')for(const side of [-1,1]){shape('cylinder',0,1,side*.5,.04,.8,.04,'#e3eef4');shape('sphere',0,1.45,side*.5,.15,.2,.06,'#e3eef4');}break;
    }
    case 'venusaur-normal':
      g.opacity=.5;for(let i=0;i<n;i++)mote(i,r*.65,.5+Math.sin(time+i)*.3,'sphere',.6,'#c69cce');g.opacity=1;break;
    case 'venusaur-special':
      for(let i=0;i<n;i++){mote(i,r*.75,.3,'leaf',.45,'#78da81');mote(i,r*.75,.7,'sphere',.2,i%2?'#ffabc5':'#fff1b0');}break;
    case 'gengar-simple':
      g.opacity=.5;for(let i=0;i<n;i++)mote(i,.3+t,.2+i*.09,'sphere',.3,'#61527c');g.opacity=1;break;
    case 'gengar-normal':
      shape('sphere',0,1,0,r*.85,r*.85,r*.85,'#483859');for(let i=0;i<n;i++)mote(i,r*.8,1+Math.sin(time*8+i)*.3,'sphere',.12,'#e999e8');break;
    case 'gengar-special':
      g.opacity=.5;for(let i=0;i<n;i++)mote(i,r*.65,.25+Math.sin(time+i)*.15,'sphere',.75,'#9276bb');g.opacity=1;
      for(let i=0;i<3;i++)mote(i,r*.5,1.2,'ring',.35,'#e8b5ff');break;
    case 'machamp-simple':
      shape('box',r*t,.9,0,.7,.6,.6,'#d1dfe0',.2);shape('ring',r*t,.9,0,.75,1,.75,'#ffe9c6');break;
    case 'machamp-normal':
      for(const side of [-1,1])for(const y of [.7,1.6])shape('box',.25,y,side*.9,.4,.35,.4,'#e7b579');break;
    case 'machamp-special':
      for(let i=0;i<6;i++)shape('box',r*(.2+((time*3+i*.15)% .7)),.6+(i%2)*.7,(i%3-1)*.7,.5,.4,.45,'#ffe6ca',i*.2);break;
    case 'alakazam-simple':
      // Keep the portal face readable from the fixed match camera, including sideways travel.
      for(const f of [-.2,.2])g.shape('ring',e.x+dx*f,1,e.z+dz*f,.85,1,1,'#f5a7ef',Math.sin(time*3)*.2,0,Math.PI/2);
      shape('sphere',0,1,0,.15,.7,.15,'#fff2ff');break;
    case 'alakazam-normal':
      g.opacity=.5;shape('shell',0,1.25,0,r,1.25,r,'#d9a4ec');g.opacity=1;
      for(let i=0;i<6;i++)mote(i,r,1.4,'box',.16,'#ffe5ff');break;
    case 'snorlax-simple':
      for(let i=0;i<n;i++)shape('sphere',-i*.16,.15,(i%3-1)*.4,.25+t*.25,.2,.25,'#d4c1a1');break;
    case 'snorlax-normal':
      for(const side of [-1,1])shape('box',0,.15,side*.65,.8,.12,.6,'#f3d39d');ring(1.1);break;
    case 'snorlax-special':
      ring(r*Math.max(.1,t));for(let i=0;i<n;i++)mote(i,r*t,.15+Math.sin(t*Math.PI)*.5,'box',.2,'#d4c5a1');break;
    case 'lapras-simple':
      for(let i=0;i<n;i++)shape('fin',r*(.2+i/n*.7),.6,Math.sin(i*3)*i/n*r*.6,.2,.3,.2,'#d7fbff',time+i);break;
    case 'lapras-normal':
      for(let i=0;i<6;i++){const a=i*Math.PI/3;shape('box',Math.cos(a)*r*.6,.85,Math.sin(a)*r*.6,r*.7,1.7,r*.7,i%2?'#a0ddeb':'#d4f5ff',a);}break;
    case 'lapras-special':
      for(let i=0;i<n;i++)mote(i,r*(.3+.6*(i%3)/2),2.5-((time+i*.2)%2.3),'fin',.18,'#efffff');break;
    case 'dragonite-simple':
      for(let i=0;i<n;i++)shape('sphere',i/n*r,.5+Math.sin(i*.8+time*8)*.3,Math.cos(i*.8+time*8)*.7,.22,.1,.22,'#d4efdb');break;
    case 'dragonite-normal':
      for(let i=0;i<n;i++)mote(i,.8,(time+i*.2)%2.8,'leaf',.15,'#ffc778');break;
    case 'dragonite-special':
      for(let i=0;i<n;i++)shape('sphere',-i*.18,.8+Math.sin(time*10+i*.4)*.2,Math.sin(i*.5)*.3,.2,.2,.2,i%2?'#94e0d5':'#ffc37c');break;
    case 'lucario-simple':
      shape('box',.5+t*2,1,0,.5,.45,.5,'#e4eff2',.2);for(let i=0;i<4;i++)shape('box',-i*.2,1,(i%2-.5)*.4,.5,.05,.05,'#a2dbe8');break;
    case 'lucario-normal':
      for(let i=0;i<6;i++)mote(i,.7,.7+(i%2)*.6,'shell',.3,'#d2e7ed');break;
    case 'lucario-special':
      shape('sphere',0,1,0,r*.8,r*.8,r*.8,'#4cbced');shape('sphere',0,1,0,r*.5,r*.5,r*.5,'#e0fbff');
      for(let i=0;i<n;i++)mote(i,r*.95,1+Math.sin(time*7+i)*.5,'cone',.2,'#bbf6ff');break;
    case 'greninja-simple':
      for(let i=0;i<4;i++)shape('sphere',Math.sin(i+time)*r*.4,.7+(i%2)*.3,Math.cos(i+time)*r*.4,.23,.23,.23,i%2?'#a0e4fa':'#ebfcff');break;
    case 'greninja-normal':
      for(let i=0;i<4;i++)shape('leaf',0,.8,0,r,r,.3,i%2?'#b7f4ff':'#4db5da',time*14+i*Math.PI/2);break;
    case 'greninja-special':
      g.opacity=.5;for(const side of [-1,1]){shape('chest',-.3,.9,side*.8,.3,.5,.25,'#86d6e4');shape('cheek',-.3,1.6,side*.8,.35,.25,.3,'#94e0ea');}g.opacity=1;break;
    default: ring(r*(.6+.4*t));break;
  }
}
export function drawAbilityStates(g:GLRenderer,p:Fighter,s:MatchState,time:number) {
  for(const [id,remaining] of Object.entries(p.statuses)) {
    const a=ABILITIES.get(id as AbilityId);
    if(!a||remaining<=0)continue;
    if(a.kind==='shield'&&p.shield<=0||a.kind==='buff'&&p.buff<=0||a.kind==='ghost'&&p.ghost<=0)continue;
    drawAbilityEffect(g,{id:0,abilityId:a.id,owner:p.id,team:p.team,kind:'burst',x:p.x,z:p.z,directionX:p.facingX,directionZ:p.facingZ,vx:0,vz:0,radius:1,life:remaining,maxLife:a.duration,color:a.color,power:0,slow:0,stun:0,allySpeed:0,noSprint:false,hits:[],reflect:false,trail:false},time);
  }
  if(p.confusion>0)for(let i=0;i<3;i++) {
    const a=time*p.confusionTurn*4+i*Math.PI*2/3;
    g.shape('ring',p.x+Math.cos(a)*.45,3.25,p.z+Math.sin(a)*.45,.16,1,.16,'#e9adff');
  }
}
