import { FIELD, POKEMON, ROSTER } from './catalog.ts';
import { botInput } from './ai.ts';
import { castAbility, finishCast, updateEffects, useItem } from './abilities.ts';
import { dropBall, hit, passBall, shootBall } from './ball.ts';
import { clamp, distance, unit } from './math.ts';
import { updateBall, updateKeepers, updatePickups, resolvePlayers } from './physics.ts';
import { attackDirection, controlled, createState, emptyInput, event, moveFighter, resetPositions, sanitizeInput, transfer } from './state.ts';
import type { Fighter, Human, InputFrame, MatchState, Species, Team } from './types.ts';

export class Game {
  state: MatchState;
  private inputs=new Map<string,{frame:InputFrame,at:number}>();
  private previous=new Map<string,InputFrame>();
  acks=new Map<string,number>();
  constructor(seed=12345,regulation=300,overtime=120) {this.state=createState(seed,regulation,overtime);}
  addHuman(id:string,name:string,team:Team):Human {
    if(team!==0&&team!==1)throw Error('Equipo inválido.');
    if(this.state.humans.some(h=>h.id===id))throw Error('La sesión ya está en la sala.');
    if(this.state.humans.filter(h=>h.team===team).length>=4)throw Error('Ese equipo ya tiene cuatro jugadores.');
    const p=this.state.players.find(p=>p.team===team&&!p.keeper&&p.controller===null);
    if(!p)throw Error('No quedan puestos disponibles.');
    const h:Human={id,name:name.trim().slice(0,20)||'Entrenador',team,fighterId:p.id,ready:false,connected:true,captain:false};
    this.state.humans.push(h);p.controller=id;p.epoch=this.state.nextId++;
    if(!this.state.host)this.state.host=id;this.captains();event(this.state,'join',h.name+' entró a la cancha',p);return h;
  }
  disconnect(id:string) {
    const h=this.state.humans.find(h=>h.id===id);if(!h)return;
    h.connected=false;h.ready=false;
    const p=controlled(this.state,id);if(p){p.controller=null;p.epoch=this.state.nextId++;p.charge=0;}
    this.inputs.delete(id);this.previous.delete(id);this.acks.delete(id);
    if(this.state.host===id)this.state.host=this.state.humans.find(h=>h.connected)?.id??null;
    this.captains();
  }
  reconnect(id:string):boolean {
    const h=this.state.humans.find(h=>h.id===id);if(!h)return false;
    if(h.connected)return false;
    const p=this.state.players.find(p=>p.id===h.fighterId&&p.controller===null)??this.state.players.find(p=>p.team===h.team&&!p.keeper&&p.controller===null);
    if(!p)return false;
    h.connected=true;transfer(this.state,h,p);
    if(!this.state.host)this.state.host=id;
    this.captains();return true;
  }
  removeHuman(id:string) {this.disconnect(id);this.state.humans=this.state.humans.filter(h=>h.id!==id);this.acks.delete(id);this.captains();}
  private captains() {
    for(const h of this.state.humans)h.captain=false;
    for(const team of [0,1]){const h=this.state.humans.find(h=>h.team===team&&h.connected);if(h)h.captain=true;}
  }
  choose(id:string,slot:number,species:Species) {
    if(this.state.phase!=='lobby')throw Error('El plantel se elige antes del partido.');
    const h=this.state.humans.find(h=>h.id===id);
    if(!h||!h.connected||!ROSTER.some(p=>p.id===species))throw Error('Selección inválida.');
    const p=this.state.players.find(p=>p.team===h.team&&p.slot===slot&&!p.keeper);
    if(!p||p.controller!==id&&(!h.captain||p.controller!==null))throw Error('Solo puedes elegir tu Pokémon y, como capitán, los bots.');
    if(this.state.players.some(q=>q.team===h.team&&q.id!==p.id&&!q.keeper&&q.species===species))throw Error('Ese Pokémon ya está en tu equipo.');
    p.species=species;
    for(const mate of this.state.humans)if(mate.team===h.team)mate.ready=false;
  }
  changeTeam(id:string,team:Team) {
    if(this.state.phase!=='lobby'||team!==0&&team!==1)throw Error('No puedes cambiar de equipo ahora.');
    const h=this.state.humans.find(h=>h.id===id);if(!h||h.team===team)return;
    if(this.state.humans.filter(h=>h.team===team).length>=4)throw Error('Equipo completo.');
    const old=controlled(this.state,id);if(old){old.controller=null;old.epoch=this.state.nextId++;}
    h.team=team;h.ready=false;
    const target=this.state.players.find(p=>p.team===team&&!p.keeper&&p.controller===null)!;
    transfer(this.state,h,target);this.captains();
  }
  ready(id:string,value:boolean) {const h=this.state.humans.find(h=>h.id===id);if(h&&this.state.phase==='lobby')h.ready=value;}
  start(id:string) {
    const s=this.state;
    if(id!==s.host)throw Error('Solo el anfitrión puede iniciar.');
    if(s.phase!=='lobby')throw Error('El partido ya comenzó.');
    if(!s.humans.some(h=>h.connected)||s.humans.some(h=>h.connected&&!h.ready))throw Error('Falta que todos estén listos.');
    s.phase='kickoff';s.phaseTime=3;resetPositions(s,0);event(s,'start','¡A la cancha!');
    this.inputs.clear();this.previous.clear();
  }
  rematch(id:string) {
    if(this.state.phase!=='finished'||id!==this.state.host)throw Error('La revancha la abre el anfitrión al terminar.');
    const previous=this.state;
    this.state=createState(previous.seed,previous.regulation,previous.overtime);
    for(const p of this.state.players)p.species=previous.players.find(q=>q.id===p.id)!.species;
    this.state.nextId=previous.nextId;
    for(const h of previous.humans) {this.addHuman(h.id,h.name,h.team);if(!h.connected)this.disconnect(h.id);}
    this.state.host=id;this.inputs.clear();this.previous.clear();this.acks.clear();
  }
  input(id:string,raw:unknown):boolean {
    const frame=sanitizeInput(raw),p=controlled(this.state,id);
    if(!frame||!p||frame.epoch!==p.epoch||frame.seq<=(this.acks.get(id)??-1))return false;
    const prior=this.inputs.get(id);
    if(prior&&frame.seq<=prior.frame.seq)return false;
    this.inputs.set(id,{frame,at:this.state.time});return true;
  }
  private switch(id:string) {
    const h=this.state.humans.find(h=>h.id===id&&h.connected);if(!h)return;
    const candidates=this.state.players.filter(p=>p.team===h.team&&!p.keeper&&p.controller===null)
      .sort((a,b)=>distance(a,this.state.ball)-distance(b,this.state.ball));
    if(candidates[0])transfer(this.state,h,candidates[0]);
  }
  private act(p:Fighter,input:InputFrame,prev:InputFrame,dt:number) {
    const s=this.state;
    const edge=(key:keyof InputFrame)=>!!input[key]&&!prev[key];
    if(p.stun>0||p.cast>0){p.charge=0;return;}
    if(edge('switch')&&p.controller) {this.switch(p.controller);return;}
    moveFighter(p,input,dt);
    const running=input.sprint&&p.noSprint<=0&&Math.hypot(input.moveX,input.moveZ)>.1;
    p.stamina=clamp(p.stamina+(running?-23:16)*dt,0,100);
    if(edge('dodge')&&p.stamina>=25&&p.actionCd<=0) {
      p.stamina-=25;p.dodgeTime=.3;p.vx=p.facingX*13;p.vz=p.facingZ*13;p.actionCd=.45;
    }
    if(edge('simple'))castAbility(s,p,0);
    else if(edge('normal'))castAbility(s,p,1);
    else if(edge('special'))castAbility(s,p,2);
    if(edge('item'))useItem(s,p);
    if(p.cast>0)return;
    if(s.ball.owner===p.id) {
      if(edge('pass')||edge('lob'))passBall(s,p,input.lob);
      if(input.shoot&&p.actionCd<=0)p.charge=Math.min(1.2,p.charge+dt);
      if(!input.shoot&&prev.shoot&&p.charge>0)shootBall(s,p,p.charge);
    } else {
      p.charge=0;
      if(edge('shoot')&&p.actionCd<=0) {
        p.actionCd=.7;p.anim='tackle';p.cloak=0;
        const rivals=s.players.filter(q=>q.team!==p.team&&!q.keeper&&q.cloak<=0&&distance(p,q)<2.5)
          .sort((a,b)=>distance(a,p)-distance(b,p));
        const q=rivals[0];if(q){const v=unit(q.x-p.x,q.z-p.z);if(v.x*p.facingX+v.z*p.facingZ>-.1)hit(s,q,v.x,v.z,5+POKEMON[p.species].stats[1],.45);}
      }
    }
  }
  step(dt=1/30) {
    const s=this.state;s.tick++;s.time+=dt;
    if(s.phase==='lobby'||s.phase==='finished')return;
    if(s.phase==='kickoff'||s.phase==='goal'||s.phase==='halftime') {
      s.phaseTime-=dt;
      if(s.phaseTime<=0) {
        if(s.phase==='halftime'){s.half=2;s.remaining=s.regulation;resetPositions(s,1);s.phase='kickoff';s.phaseTime=3;}
        else {s.phase=s.half===3?'overtime':'playing';if(s.remaining<=0)this.endPeriod();}
      }
      return;
    }
    for(const p of s.players) {
      for(const key of ['simpleCd','stun','immunity','slowTime','shield','boost','buff','cloak','noSprint','actionCd','dodgeTime'] as const)p[key]=Math.max(0,p[key]-dt);
      if(p.cast>0){p.cast=Math.max(0,p.cast-dt);if(p.cast===0)finishCast(s,p);}
      if(p.keeper)continue;
      let input:InputFrame;
      if(p.controller) {
        const saved=this.inputs.get(p.controller);
        input=saved&&saved.frame.epoch===p.epoch&&s.time-saved.at<.25?saved.frame:emptyInput(p.epoch);
        if(saved&&saved.frame.epoch===p.epoch)this.acks.set(p.controller,saved.frame.seq);
      } else input=botInput(s,p,dt);
      const key=p.controller??'bot:'+p.id,prev=this.previous.get(key)??emptyInput(p.epoch);
      this.act(p,input,prev,dt);this.previous.set(key,{...input});
    }
    for(let i=0;i<2;i++) {
      updateKeepers(s,dt/2);resolvePlayers(s,dt/2);updateEffects(s,dt/2);updateBall(s,dt/2);
      if(!['playing','overtime'].includes(s.phase))break;
    }
    if(s.phase==='playing'||s.phase==='overtime') {
      updatePickups(s,dt);s.remaining=Math.max(0,s.remaining-dt);
      if(s.remaining<=0)this.endPeriod();
    }
    for(const p of s.players){p.x=clamp(p.x,-FIELD.halfWidth+.65,FIELD.halfWidth-.65);p.z=clamp(p.z,-FIELD.halfDepth+.65,FIELD.halfDepth-.65);}
  }
  private endPeriod() {
    const s=this.state;
    if(s.half===1){s.phase='halftime';s.phaseTime=10;event(s,'half','Entretiempo');}
    else if(s.half===2&&s.score[0]===s.score[1]) {
      s.half=3;s.remaining=s.overtime;s.phase='kickoff';s.phaseTime=3;resetPositions(s,0);event(s,'overtime','Gol de oro');
    } else {s.phase='finished';s.winner=s.score[0]===s.score[1]?null:s.score[0]>s.score[1]?0:1;event(s,'end','Final del partido');}
  }
}
