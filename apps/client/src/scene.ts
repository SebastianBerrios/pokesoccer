import { GLRenderer } from './gl.ts';
import { drawPokemon, MODEL_BOUNDS } from './models.ts';
import { drawAbilityEffect, drawAbilityStates } from './ability-visuals.ts';
import { MatchCamera } from './match-camera.ts';
import { clamp, lerp } from '../../../packages/game/src/math.ts';
import { FIELD, POKEMON } from '../../../packages/game/src/catalog.ts';
import type { MatchState, Team } from '../../../packages/game/src/types.ts';

export const TEAM_COLORS=['#ff9d67','#6fdaec'];
export class Scene {
  renderer:GLRenderer;
  state:MatchState|null=null;previous:MatchState|null=null;
  received=0;hero=true;myId='';myTeam:Team=0;
  predicted:{x:number,z:number}|null=null;
  labels:HTMLDivElement;
  minimap:HTMLCanvasElement;
  camera=new MatchCamera();
  metrics:Record<string,{height:number;x:number;y:number;visible:boolean}>={};
  private lastDraw=0;
  private labelNodes=new Map<string,HTMLElement>();
  private offscreen:HTMLDivElement;
  private ballMarker:HTMLDivElement;
  constructor(public canvas:HTMLCanvasElement) {
    this.renderer=new GLRenderer(canvas);
    this.labels=document.createElement('div');this.labels.className='player-labels';canvas.parentElement!.append(this.labels);
    this.minimap=document.createElement('canvas');this.minimap.className='minimap';this.minimap.width=216;this.minimap.height=142;
    this.minimap.setAttribute('aria-label','Mapa de la cancha: diez jugadores y balón');canvas.parentElement!.append(this.minimap);
    this.offscreen=document.createElement('div');this.offscreen.className='offscreen-player';this.labels.append(this.offscreen);
    this.ballMarker=document.createElement('div');this.ballMarker.className='ball-marker';this.ballMarker.setAttribute('aria-hidden','true');this.labels.append(this.ballMarker);
  }
  setState(state:MatchState) {
    const prior=this.state;
    const restart=prior&&((prior.phase==='goal'||prior.phase==='kickoff')&&(state.phase==='playing'||state.phase==='overtime')||state.tick<prior.tick);
    this.previous=restart?null:prior;this.state=state;this.received=performance.now();
    if(restart)this.camera.reset();
  }
  draw(time:number) {
    const g=this.renderer,s=this.state,dt=this.lastDraw?time-this.lastDraw:1;
    this.lastDraw=time;
    const alpha=Math.min(1,(performance.now()-this.received)/50);
    const players=s?.players.map(p=>{
      const old=this.previous?.players.find(q=>q.id===p.id)??p;
      const own=p.controller===this.myId;
      return {...p,x:own&&this.predicted?this.predicted.x:lerp(old.x,p.x,alpha),z:own&&this.predicted?this.predicted.z:lerp(old.z,p.z,alpha)};
    })??[];
    const b=s?.ball,oldBall=this.previous?.ball??b;
    const ball=b&&oldBall?{x:lerp(oldBall.x,b.x,alpha),z:lerp(oldBall.z,b.z,alpha),y:lerp(oldBall.y,b.y,alpha)}:{x:0,z:0,y:0};
    const own=players.find(p=>p.controller===this.myId);
    const view=this.hero?true:this.camera.update(ball,own,this.canvas.clientWidth,this.canvas.clientHeight,dt);
    g.begin(view);this.stadium(time);this.metrics={};
    this.minimap.hidden=this.hero;this.offscreen.hidden=true;this.ballMarker.hidden=this.hero||!s;
    if(s) {
      const simTime=lerp(this.previous?.time??s.time,s.time,alpha);
      for(const p of players) {
        let label=this.labelNodes.get(p.id);
        if(!label){label=document.createElement('div');label.className='player-label';this.labels.append(label);this.labelNodes.set(p.id,label);}
        const controlled=p.controller===this.myId,team=TEAM_COLORS[p.team],bounds=MODEL_BOUNDS[p.species];
        const recipient=s.keeperPossession?.targetId===p.id&&s.keeperPossession.controller===this.myId;
        g.shape('sphere',p.x,.035,p.z,.79,.025,.62,'#1c4b3b');
        g.shape('ring',p.x,.06,p.z,controlled?1.02:.8,1,controlled?1.02:.8,controlled?'#fff2aa':team);
        if(recipient)g.shape('ring',p.x,.1,p.z,1.4,1,1.4,'#fff3bb');
        if(controlled)g.shape('cone',p.x,bounds.height+.5+Math.sin(time*4)*.07,p.z,.18,.3,.18,'#ffed9f',0,Math.PI);
        const yaw=Math.atan2(p.facingX,p.facingZ);
        g.opacity=p.ghost>0?.5:1;
        drawPokemon(g,p.species,p.x,p.z,yaw,simTime,p.anim==='run',1,p.stun>0,p.cast>0,
          p.action&&p.actionUntil>simTime?{kind:p.action,ability:p.actionAbility,progress:clamp((simTime-p.actionStarted)/(p.actionUntil-p.actionStarted),0,1)}:undefined);
        g.opacity=1;drawAbilityStates(g,p,s,simTime);
        if(p.ghost>0) {
          g.shape('ring',p.x,.15,p.z,1.2,1,1.2,'#b9e9f2');
          g.shape('ring',p.x,bounds.height*.48,p.z,.82,1,.82,'#c1b7ef');
        }
        if(p.shield>0||p.buff>0)g.shape('ring',p.x,1.1,p.z,1.15,1,1.15,'#caeaff',0,0,Math.PI/2);
        if(p.charge>0)g.shape('ring',p.x,.09,p.z,1+p.charge*.6,1,1+p.charge*.6,'#fff4c4');
        const point=g.project(p.x,bounds.height+.28,p.z),feet=g.project(p.x,0,p.z),head=g.project(p.x,bounds.height,p.z);
        this.metrics[p.id]={height:Math.abs(feet.y-head.y),x:feet.x,y:feet.y,visible:feet.inView};
        label.hidden=this.hero||!point.inView||point.y<80||point.y>this.canvas.clientHeight-118;
        if(!this.hero) {
          const human=s.humans.find(h=>h.id===p.controller);
          label.textContent=controlled?(p.keeper?'TÚ · SAQUE':'TÚ · '+POKEMON[p.species].name):recipient?'PASE':human?human.name:p.keeper?'Ditto':POKEMON[p.species].name;
          if(p.confusion>0)label.textContent+=' · CONFUSIÓN';
          label.classList.toggle('is-target',recipient);label.classList.toggle('is-ghost',p.ghost>0);
          label.style.transform='translate('+clamp(point.x,64,this.canvas.clientWidth-64)+'px,'+point.y+'px) translate(-50%,-50%)';
          label.style.color=controlled?'#fff3bb':team;label.classList.toggle('is-you',controlled);
          if(controlled&&!feet.inView) {
            this.offscreen.hidden=false;
            this.offscreen.textContent=(feet.x<this.canvas.clientWidth/2?'← ':'→ ')+(p.keeper?'Ditto':POKEMON[p.species].name);
            this.offscreen.style.left=clamp(feet.x,75,this.canvas.clientWidth-75)+'px';
            this.offscreen.style.top=clamp(feet.y,116,this.canvas.clientHeight-155)+'px';
          }
        }
      }
      for(const e of s.effects)drawAbilityEffect(g,e,time);
      for(const o of s.pickups) {
        const color=o.kind==='orb'?'#ffe79a':o.kind==='berry'?'#99e59b':o.kind==='shield'?'#a4deff':'#ffb985';
        g.shape('ring',o.x,.06,o.z,.9,1,.9,color);
        g.shape(o.kind==='orb'?'sphere':'box',o.x,.8+Math.sin(time*3+o.id)*.17,o.z,.42,.42,.42,color,time*1.5,Math.PI/4);
      }
      const {x,z,y}=ball;
      if(s.ball.abilityId)drawAbilityEffect(g,{id:0,abilityId:s.ball.abilityId,kind:'burst',owner:s.ball.lastTouch??'',team:s.ball.lastTeam??0,x,z,vx:s.ball.vx,vz:s.ball.vz,radius:.7,life:.3,maxLife:.5,color:'#ffc575',power:0,slow:0,stun:0,allySpeed:0,noSprint:false,hits:[],reflect:false,trail:false},time);
      g.shape('sphere',x,.04,z,.52,.022,.36,'#173e32');
      g.shape('sphere',x,y,z,.38,.38,.38,s.ball.fiery>0?'#ffd67e':'#fff8dc');
      g.shape('sphere',x,y+.29,z,.17,.11,.17,'#314b46');
      g.shape('sphere',x+.27,y+.06,z+.17,.11,.16,.13,'#314b46');
      g.shape('ring',x,.075,z,.52,1,.52,'#f9f6dc');
      const point=g.project(x,y+.25,z);
      this.ballMarker.hidden=this.hero||!point.inView;
      this.ballMarker.style.transform='translate('+point.x+'px,'+point.y+'px) translate(-50%,-50%)';
      if(!this.hero)this.drawMinimap(players,ball);
    }
    g.end();
  }
  private drawMinimap(players:MatchState['players'],ball:{x:number;z:number}) {
    const ctx=this.minimap.getContext('2d')!;
    const width=this.minimap.width,height=this.minimap.height,pad=14;
    const project=(x:number,z:number)=>({x:pad+(x/FIELD.halfWidth+1)*(width-pad*2)/2,y:pad+(z/FIELD.halfDepth+1)*(height-pad*2)/2});
    ctx.clearRect(0,0,width,height);ctx.fillStyle='#0b2726e8';ctx.fillRect(0,0,width,height);
    ctx.strokeStyle='#739c8b';ctx.lineWidth=1;ctx.strokeRect(pad,pad,width-2*pad,height-2*pad);
    ctx.beginPath();ctx.moveTo(width/2,pad);ctx.lineTo(width/2,height-pad);ctx.stroke();
    ctx.beginPath();ctx.ellipse(width/2,height/2,11,10,0,0,Math.PI*2);ctx.stroke();
    ctx.save();ctx.beginPath();ctx.rect(pad,pad,width-2*pad,height-2*pad);ctx.clip();
    const v=this.camera.view,spanZ=v.span/(this.canvas.clientWidth/this.canvas.clientHeight)/Math.SQRT1_2;
    const tl=project(v.x-v.span/2,v.z-spanZ/2),br=project(v.x+v.span/2,v.z+spanZ/2);
    ctx.fillStyle='#d5e88c12';ctx.fillRect(tl.x,tl.y,br.x-tl.x,br.y-tl.y);
    ctx.strokeStyle='#d5e88c77';ctx.strokeRect(tl.x,tl.y,br.x-tl.x,br.y-tl.y);
    for(const p of players) {
      const point=project(p.x,p.z);ctx.fillStyle=TEAM_COLORS[p.team];
      ctx.beginPath();ctx.arc(point.x,point.y,p.keeper?2.5:3.1,0,Math.PI*2);ctx.fill();
      if(p.controller===this.myId){ctx.strokeStyle='#fff3b8';ctx.lineWidth=2;ctx.beginPath();ctx.arc(point.x,point.y,5.5,0,Math.PI*2);ctx.stroke();}
    }
    const point=project(ball.x,ball.z);ctx.fillStyle='#fff6d8';ctx.beginPath();ctx.arc(point.x,point.y,2.4,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  private stadium(time:number) {
    const g=this.renderer, w=FIELD.halfWidth, d=FIELD.halfDepth;
    g.shape('box',0,-1,0,w*2+9,1.8,d*2+8,'#153d35');
    g.shape('box',0,-.15,0,w*2+1,.3,d*2+1,'#357452');
    for(let i=0;i<12;i++)g.shape('box',-w+(i+.5)*w/6,.012,0,w/6,.012,d*2,i%2?'#397953':'#418259');
    const line='#d1dfad';
    g.shape('box',0,.03,-d,w*2,.035,.12,line);g.shape('box',0,.03,d,w*2,.035,.12,line);
    g.shape('box',-w,.03,0,.12,.035,d*2,line);g.shape('box',w,.03,0,.12,.035,d*2,line);
    g.shape('box',0,.035,0,.12,.035,d*2,line);g.shape('ring',0,.045,0,4.1,1,4.1,line);
    g.shape('sphere',0,.06,0,.18,.04,.18,line);
    for(const side of [-1,1]) {
      g.shape('box',side*(w-FIELD.areaDepth/2),.03,-FIELD.areaHalf,FIELD.areaDepth,.035,.12,line);g.shape('box',side*(w-FIELD.areaDepth/2),.03,FIELD.areaHalf,FIELD.areaDepth,.035,.12,line);
      g.shape('box',side*(w-FIELD.areaDepth),.03,0,.12,.035,FIELD.areaHalf*2,line);
      for(const z of [-d-.6,d+.6])g.shape('box',0,.16,z,w*2+1,.32,.5,'#225349');
      for(const z of [-(d+FIELD.goalHalf)/2,(d+FIELD.goalHalf)/2])g.shape('box',side*(w+.6),.16,z,.5,.32,d-FIELD.goalHalf,'#225349');
      const color=TEAM_COLORS[side===-1?(this.state?.half===2?1:0):(this.state?.half===2?0:1)];
      for(const z of [-FIELD.goalHalf,FIELD.goalHalf]) {
        g.shape('cylinder',side*w,FIELD.goalHeight/2,z,.1,FIELD.goalHeight,.1,color);
        g.shape('box',side*(w+1.1),.1,z,2.2,.12,.12,'#cadfd3');
      }
      g.shape('box',side*w,FIELD.goalHeight,0,.18,.18,FIELD.goalHalf*2+.1,color);
      g.shape('box',side*(w+2),FIELD.goalHeight/2,0,.1,FIELD.goalHeight,FIELD.goalHalf*2,'#214b42');
      for(let z=-FIELD.goalHalf;z<=FIELD.goalHalf;z+=.6)g.shape('box',side*(w+2),FIELD.goalHeight/2,z,.06,FIELD.goalHeight,.035,'#6c9681');
      for(let y=.6;y<FIELD.goalHeight+.1;y+=.6)g.shape('box',side*(w+2),y,0,.06,.035,FIELD.goalHalf*2,'#6c9681');
      for(let i=0;i<(side===1&&!this.hero?1:3);i++) {
        const z=side*(d+2.2+i*1.05),y=.6+i*.45;
        g.shape('box',0,y,z,w*2+3,.5,.9,i%2?'#1c4940':'#234f43');
        if(this.renderer.quality==='high')for(let j=0;j<30;j++) {
          const x=-w+j*(w*2/29);
          g.shape('box',x,y+.35,z,.42,.45,.4,j%3===0?color:j%3===1?'#486853':'#7d8c69');
        }
      }
    }
    for(const x of [-w-1,w+1])for(const z of [-d-2,d+2]) {
      g.shape('cylinder',x,3.5,z,.12,7,.12,'#6a8475');
      g.shape('box',x,7.1,z,2,.65,.4,'#e8edbd');
    }
    for(let i=0;i<8;i++) {
      const x=-w+(i+.5)*w/4;
      g.shape('box',x,.6,-d-.88,4.8,.55,.03,i%2?'#da925b':'#91c2ad');
      g.shape('box',x,.6,d+.88,4.8,.55,.03,i%2?'#91c2ad':'#da925b');
    }
  }
}
