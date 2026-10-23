import { GLRenderer, camera } from './gl.ts';
import { drawPokemon } from './models.ts';
import { drawAbilityEffect, drawAbilityStates } from './ability-visuals.ts';
import { Game } from '../../../packages/game/src/engine.ts';
import { ROSTER, POKEMON } from '../../../packages/game/src/catalog.ts';
import { executeAbility, castAbility, updateEffects } from '../../../packages/game/src/abilities.ts';
import { updateBall } from '../../../packages/game/src/physics.ts';
import type { Species } from '../../../packages/game/src/types.ts';

document.head.insertAdjacentHTML('beforeend',`<style>
*{box-sizing:border-box}body{margin:0;background:#102b26;color:#f3edcb;font:14px 'Trebuchet MS',sans-serif}header{padding:24px 32px;background:#193d32;border-bottom:1px solid #577758}h1{margin:0 0 12px;font:32px Bahnschrift,sans-serif}a{color:#e2e89b}label{margin-right:24px}select,input{accent-color:#e2e89b}main{padding:24px 32px}h2{font:26px Bahnschrift,sans-serif;margin:32px 0 16px}.models,.powers{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.card{background:#1b3e32;border:1px solid #55734e;padding:12px;border-radius:6px}.card h3{margin:0 0 10px;font-size:17px}.views{display:flex;gap:6px}.views figure{margin:0;flex:1;min-width:0}.views img{width:100%;display:block;background:#09221f}.views figcaption{text-align:center;font-size:10px;color:#bfc9a0;margin-top:6px}.powers{grid-template-columns:repeat(3,minmax(0,1fr))}.scale{width:70px!important;height:70px;object-fit:contain;margin:auto}@media(max-width:900px){.models,.powers{grid-template-columns:1fr 1fr}}@media(max-width:600px){.models,.powers{grid-template-columns:1fr}header,main{padding:16px}}
</style>`);
document.body.innerHTML=`<header><h1>Personajes y poderes</h1><label>Calidad <select id="quality"><option value="high">Alta</option><option value="low">Baja</option></select></label><label>Instante <input id="time" type="range" min="0" max="100" value="40"></label><a href="/">Volver a la cancha ↗</a></header><main><h2>13 siluetas · frente, perfil y espalda</h2><section class="models"></section><h2>36 poderes · preparación, actividad e impacto</h2><section class="powers"></section></main>`;
const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-9999px;width:240px;height:210px';document.body.append(canvas);
const g=new GLRenderer(canvas);
const figure=(source:string,label:string,small=false)=>`<figure><img ${small?'class="scale"':''} src="${source}" alt="${label}"><figcaption>${label}</figcaption></figure>`;
function render() {
  const time=Number((document.querySelector('#time') as HTMLInputElement).value)/100;
  g.quality=(document.querySelector('#quality') as HTMLSelectElement).value as 'high'|'low';
  document.querySelector('.models')!.innerHTML=[...ROSTER.map(p=>p.id),'ditto' as Species].map(id=>{
    const angles=[0,Math.PI/2,Math.PI],labels=['Frente','Perfil','Espalda'];
    const images=angles.map((yaw,i)=>{g.begin();g.vp=camera(240,210,'portrait');drawPokemon(g,id,0,0,yaw,time,true);g.end();return figure(canvas.toDataURL(),labels[i]);});
    return `<article class="card" data-model="${id}"><h3>${id==='ditto'?'Ditto':POKEMON[id].name}</h3><div class="views">${images.join('')}</div></article>`;
  }).join('');
  document.querySelector('.powers')!.innerHTML=ROSTER.flatMap(pokemon=>pokemon.abilities.map((a,slot)=>{
    const images=[slot===2?'Preparación':'Instantáneo','Activo','Impacto / duración'].map((label,index)=>{
      const s=new Game(73).state,p=s.players[0];p.species=pokemon.id;p.x=0;p.z=0;p.facingX=1;p.facingZ=0;p.normal=p.special=100;p.immunity=0;
      s.ball.owner=a.kind==='shot'?p.id:null;s.ball.x=4;s.ball.z=0;
      s.players.filter(q=>q!==p).forEach(q=>{q.x=-20;q.z=-20;});
      const rival=s.players[5];rival.immunity=0;rival.z=0;
      rival.x=a.kind==='zone'?a.range:a.kind==='projectile'?a.radius===3?4.6:a.radius+4:Math.max(1,a.range*.65);
      if(index===0)castAbility(s,p,slot);else {
        executeAbility(s,p,a);
        const elapsed=index===1?.05:.22;
        for(let dt=0;dt<elapsed;dt+=1/60){s.time+=1/60;updateEffects(s,1/60);updateBall(s,1/60);}
      }
      const effect=s.effects.find(e=>e.kind!=='warning')??s.effects[0];
      const x=a.kind==='zone'||a.kind==='wall'?a.range:2,z=effect?.z??0,r=a.kind==='zone'||a.kind==='wall'||a.kind==='push'?Math.max(a.radius,a.range):4;
      g.begin({x:x*.5,z,span:Math.max(10,r*2+5)});
      g.shape('box',x,-.12,z,50,.2,40,'#397953');
      drawPokemon(g,p.species,p.x,p.z,Math.PI/2,time,false,1,false,index===0,{kind:'cast',progress:time,ability:a.id});
      if(['push','zone','projectile'].includes(a.kind)) {
        g.shape('ring',rival.x,.08,rival.z,.8,1,.8,'#6fdaec');
        drawPokemon(g,rival.species,rival.x,rival.z,-Math.PI/2,time,false,1,rival.stun>0);
        drawAbilityStates(g,rival,s,time);
      }
      for(const e of s.effects)drawAbilityEffect(g,e,time);
      const b=s.ball;
      if(b.abilityId)drawAbilityEffect(g,{id:0,abilityId:b.abilityId,kind:'burst',owner:p.id,team:p.team,x:b.x,z:b.z,vx:b.vx,vz:b.vz,radius:.7,life:.3,maxLife:.5,color:'#ffc575',power:0,slow:0,stun:0,allySpeed:0,noSprint:false,hits:[],reflect:false,trail:false},time);
      if(['shot','pull','redirect'].includes(a.kind))g.shape('sphere',b.x,b.y,b.z,.35,.35,.35,'#fff9dd');
      drawAbilityStates(g,p,s,time);g.end();return figure(canvas.toDataURL(),label);
    });
    return `<article class="card" data-ability="${a.id}"><h3>${pokemon.name} · ${a.name}</h3><div class="views">${images.join('')}</div></article>`;
  })).join('');
  document.body.dataset.ready='true';
}
document.querySelector('#quality')!.addEventListener('change',render);
document.querySelector('#time')!.addEventListener('input',render);
render();
