import { GLRenderer } from './gl.ts';
import { drawPokemon } from './models.ts';
import { lerp } from '../../../packages/game/src/math.ts';
import { POKEMON } from '../../../packages/game/src/catalog.ts';
import type { MatchState, Team } from '../../../packages/game/src/types.ts';

export const TEAM_COLORS=['#ff9d67','#6fdaec'];
export class Scene {
  renderer:GLRenderer;
  state:MatchState|null=null;previous:MatchState|null=null;
  received=0;hero=true;myId='';myTeam:Team=0;
  predicted:{x:number,z:number}|null=null;
  labels:HTMLDivElement;
  private labelNodes=new Map<string,HTMLElement>();
  constructor(public canvas:HTMLCanvasElement) {
    this.renderer=new GLRenderer(canvas);
    this.labels=document.createElement('div');this.labels.className='player-labels';canvas.parentElement!.append(this.labels);
  }
  setState(state:MatchState) {this.previous=this.state;this.state=state;this.received=performance.now();}
  draw(time:number) {
    const g=this.renderer;g.begin(this.hero);this.stadium(time);
    const s=this.state;
    if(s) {
      const alpha=Math.min(1,(performance.now()-this.received)/50);
      for(const p of s.players) {
        const hidden=p.cloak>0&&p.team!==this.myTeam&&!this.hero;
        let label=this.labelNodes.get(p.id);
        if(!label){label=document.createElement('div');label.className='player-label';this.labels.append(label);this.labelNodes.set(p.id,label);}
        label.hidden=this.hero||hidden;
        if(hidden)continue;
        const old=this.previous?.players.find(q=>q.id===p.id)??p;
        let x=lerp(old.x,p.x,alpha),z=lerp(old.z,p.z,alpha);
        const controlled=p.controller===this.myId;
        if(controlled&&this.predicted){x=this.predicted.x;z=this.predicted.z;}
        const team=TEAM_COLORS[p.team];
        g.shape('sphere',x,.035,z,p.keeper?1.2:.9,.025,.68,'#164038');
        g.shape('ring',x,.06,z,controlled?1.15:.87,1,controlled?1.15:.87,controlled?'#f8e99a':team);
        if(controlled)g.shape('cone',x,3.5+Math.sin(time*4)*.12,z,.22,.42,.22,'#ffed9f',0,Math.PI);
        const yaw=Math.atan2(p.facingX,p.facingZ);
        drawPokemon(g,p.species,x,z,yaw,time,p.anim==='run',p.keeper?.85:1,p.stun>0,p.cast>0);
        if(p.shield>0||p.buff>0)g.shape('ring',x,1.1,z,1.15,1,1.15,'#caeaff',0,0,Math.PI/2);
        if(p.charge>0)g.shape('ring',x,.09,z,1+p.charge,1,1+p.charge,'#fff4c4');
        if(!this.hero) {
          const point=g.project(x,2.75,z);
          const h=s.humans.find(h=>h.id===p.controller);
          label.textContent=controlled?'TÚ':h?h.name:p.keeper?'POR':'BOT';
          label.style.transform='translate('+point.x+'px,'+point.y+'px) translate(-50%,-50%)';
          label.style.color=controlled?'#fff3bb':team;
          label.classList.toggle('is-you',controlled);
        }
      }
      for(const e of s.effects) {
        if(e.kind==='projectile') {
          g.shape('sphere',e.x,.8,e.z,e.radius,.5,e.radius,e.color);
          g.shape('ring',e.x,.09,e.z,e.radius*1.2,1,e.radius*1.2,e.color);
        } else if(e.kind==='wall') {
          g.shape('cylinder',e.x,1,e.z,e.radius,2,e.radius,e.color);
          g.shape('ring',e.x,2.1,e.z,e.radius*1.1,1,e.radius*1.1,'#eaf9f4');
        } else {
          const pulse=e.kind==='warning'?1+Math.sin(time*16)*.08:1;
          g.shape('ring',e.x,.075,e.z,e.radius*pulse,1,e.radius*pulse,e.color);
          if(e.kind==='zone') {
            for(let i=0;i<7;i++){const a=i/7*Math.PI*2+time;g.shape('cone',e.x+Math.cos(a)*e.radius*.8,.2,e.z+Math.sin(a)*e.radius*.8,.12,.35,.12,e.color);}
          }
        }
      }
      for(const o of s.pickups) {
        const color=o.kind==='orb'?'#ffe79a':o.kind==='berry'?'#99e59b':o.kind==='shield'?'#a4deff':'#ffb985';
        g.shape('ring',o.x,.06,o.z,.9,1,.9,color);
        g.shape(o.kind==='orb'?'sphere':'box',o.x,.8+Math.sin(time*3+o.id)*.17,o.z,.42,.42,.42,color,time*1.5,Math.PI/4);
      }
      const b=s.ball,old=this.previous?.ball??b;
      const x=lerp(old.x,b.x,alpha),z=lerp(old.z,b.z,alpha),y=lerp(old.y,b.y,alpha);
      g.shape('sphere',x,.04,z,.52,.022,.36,'#173e32');
      g.shape('sphere',x,y,z,.38,.38,.38,b.fiery>0?'#ffd67e':'#fff8dc');
      g.shape('sphere',x,y+.29,z,.17,.11,.17,'#314b46');
      g.shape('sphere',x+.27,y+.06,z+.17,.11,.16,.13,'#314b46');
      g.shape('ring',x,.075,z,.52,1,.52,'#f9f6dc');
    }
    g.end();
  }
  private stadium(time:number) {
    const g=this.renderer;
    g.shape('box',0,-1,0,57,1.8,36,'#153d35');
    g.shape('box',0,-.15,0,49,.3,29,'#357452');
    for(let i=0;i<12;i++)g.shape('box',-22+i*4,.012,0,4,.012,28,i%2?'#397953':'#418259');
    const line='#d1dfad';
    g.shape('box',0,.03,-14,48,.035,.12,line);g.shape('box',0,.03,14,48,.035,.12,line);
    g.shape('box',-24,.03,0,.12,.035,28,line);g.shape('box',24,.03,0,.12,.035,28,line);
    g.shape('box',0,.035,0,.12,.035,28,line);g.shape('ring',0,.045,0,4.1,1,4.1,line);
    g.shape('sphere',0,.06,0,.18,.04,.18,line);
    for(const side of [-1,1]) {
      g.shape('box',side*20,.03,-6,8,.035,.12,line);g.shape('box',side*20,.03,6,8,.035,.12,line);
      g.shape('box',side*16,.03,0,.12,.035,12,line);
      for(const z of [-14.6,14.6])g.shape('box',0,.55,z,49,1.1,.5,'#225349');
      for(const z of [-9,9])g.shape('box',side*24.6,.55,z,.5,1.1,10,'#225349');
      const color=TEAM_COLORS[side===-1?(this.state?.half===2?1:0):(this.state?.half===2?0:1)];
      for(const z of [-3.6,3.6]) {
        g.shape('cylinder',side*24,1.6,z,.1,3.2,.1,color);
        g.shape('box',side*25.1,.1,z,2.2,.12,.12,'#cadfd3');
      }
      g.shape('box',side*24,3.2,0,.18,.18,7.3,color);
      g.shape('box',side*26,1.6,0,.1,3.2,7.2,'#214b42');
      for(let z=-3.6;z<=3.6;z+=.6)g.shape('box',side*26,1.6,z,.06,3.2,.035,'#6c9681');
      for(let y=.6;y<3.3;y+=.6)g.shape('box',side*26,y,0,.06,.035,7.2,'#6c9681');
      for(let i=0;i<3;i++) {
        const z=side*(16.2+i*1.05),y=.6+i*.45;
        g.shape('box',0,y,z,51,.5,.9,i%2?'#1c4940':'#234f43');
        if(this.renderer.quality==='high')for(let j=0;j<30;j++) {
          const x=-24+j*1.65;
          g.shape('box',x,y+.35,z,.42,.45,.4,j%3===0?color:j%3===1?'#486853':'#7d8c69');
        }
      }
    }
    for(const x of [-25,25])for(const z of [-16,16]) {
      g.shape('cylinder',x,3.5,z,.12,7,.12,'#6a8475');
      g.shape('box',x,7.1,z,2,.65,.4,'#e8edbd');
    }
    for(let i=0;i<8;i++) {
      const x=-21+i*6;
      g.shape('box',x,.6,-14.88,4.8,.55,.03,i%2?'#da925b':'#91c2ad');
      g.shape('box',x,.6,14.88,4.8,.55,.03,i%2?'#91c2ad':'#da925b');
    }
  }
}
