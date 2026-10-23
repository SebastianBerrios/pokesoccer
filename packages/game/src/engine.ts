import { FIELD, POKEMON, ROSTER } from './catalog.ts';
import { keeperInput, updateKeeperPossession } from './keepers.ts';
import { updateTactics } from './tactics.ts';
import { botInput } from './ai.ts';
import { castAbility, finishCast, updateEffects, useItem } from './abilities.ts';
import { hit, passBall, shootBall } from './ball.ts';
import { clamp, distance, unit } from './math.ts';
import { updateBall, updateKeepers, updatePickups, resolvePlayers } from './physics.ts';
import { controlled, createState, emptyInput, event, moveFighter, resetPositions, sanitizeInput, transfer, validSettings, endKeeperPossession, constrainKeeperArea } from './state.ts';
import { automaticLineup, remapLineup, validFormation, validStyle, validLineup } from './team-plan.ts';
import { PACE_PROFILES, BOT_PROFILES, botDifficulty, REGULATION_SECONDS, OVERTIME_SECONDS } from './tuning.ts';
import { random, setAction } from './state.ts';
import type { Fighter, Human, InputFrame, MatchState, Species, Team, MatchMode, Lineup } from './types.ts';

export class Game {
  state: MatchState;
  private inputs=new Map<string,{frame:InputFrame,at:number}>();
  private previous=new Map<string,InputFrame>();
  private gates=new Map<string,{epoch:number; blocked:Set<string>}>();
  acks=new Map<string,number>();
  constructor(seed=12345,regulation=REGULATION_SECONDS,overtime=OVERTIME_SECONDS,mode:MatchMode='online') {this.state=createState(seed,regulation,overtime,mode);}
  addHuman(id:string,name:string,team:Team):Human {
    if(team!==0&&team!==1)throw Error('Equipo inválido.');
    if(this.state.humans.some(h=>h.id===id))throw Error('La sesión ya está en la sala.');
    if(this.state.humans.filter(h=>h.team===team).length>=4)throw Error('Ese equipo ya tiene cuatro jugadores.');
    const p=this.state.players.find(p=>p.team===team&&!p.keeper&&p.controller===null);
    if(!p)throw Error('No quedan puestos disponibles.');
    const h:Human={id,name:name.trim().slice(0,20)||'Entrenador',team,fighterId:p.id,ready:false,connected:true,captain:false};
    this.state.humans.push(h);p.controller=id;p.epoch=this.state.nextId++;
    this.gates.set(id,{epoch:p.epoch,blocked:new Set()});
    if(!this.state.host)this.state.host=id;this.captains();event(this.state,'join',h.name+' entró a la cancha',p);return h;
  }
  disconnect(id:string) {
    const h=this.state.humans.find(h=>h.id===id);if(!h)return;
    h.connected=false;h.ready=false;
    const p=controlled(this.state,id);if(p){p.controller=null;p.epoch=this.state.nextId++;p.charge=0;}
    const hold=this.state.keeperPossession;
    if(hold?.controller===id){h.fighterId=hold.previousFighterId??h.fighterId;hold.controller=null;}
    this.inputs.delete(id);this.previous.delete(id);this.acks.delete(id);
    if(this.state.host===id)this.state.host=this.state.humans.find(h=>h.connected)?.id??null;
    this.captains();
  }
  reconnect(id:string):boolean {
    const h=this.state.humans.find(h=>h.id===id);if(!h)return false;
    if(h.connected)return false;
    const p=this.state.players.find(p=>p.id===h.fighterId&&!p.keeper&&p.controller===null)??this.state.players.find(p=>p.team===h.team&&!p.keeper&&p.controller===null);
    if(!p)return false;
    h.connected=true;transfer(this.state,h,p);
    if(!this.state.host)this.state.host=id;
    this.captains();return true;
  }
  removeHuman(id:string) {this.disconnect(id);this.state.humans=this.state.humans.filter(h=>h.id!==id);this.acks.delete(id);this.gates.delete(id);this.captains();}
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
    if(this.state.autoLineup[h.team])this.state.teamPlans[h.team].lineup=automaticLineup(this.state.players.filter(p=>p.team===h.team&&!p.keeper),this.state.teamPlans[h.team].formation);
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
  configure(id:string,settings:unknown) {
    const s=this.state;
    if(id!==s.host||!s.humans.some(h=>h.id===id&&h.connected))throw Error('Solo el anfitrión puede configurar el partido.');
    if(s.phase!=='lobby')throw Error('Los ajustes se cambian en el lobby.');
    if(!validSettings(settings))throw Error('Ajustes inválidos.');
    if(s.settings.pace===settings.pace&&s.settings.difficulty===settings.difficulty)return;
    s.settings={pace:settings.pace,difficulty:settings.difficulty};
    s.orbTimer=PACE_PROFILES[settings.pace].orbInterval;s.itemTimer=PACE_PROFILES[settings.pace].itemInterval;
    for(const h of s.humans)h.ready=false;
  }
  private authorizePlan(id:string,team:Team) {
    const s=this.state,h=s.humans.find(h=>h.id===id&&h.connected);
    if(team!==0&&team!==1||!h)throw Error('Equipo inválido.');
    const ownCaptain=h.team===team&&h.captain;
    if(!ownCaptain)throw Error('Solo el capitán puede organizar este equipo.');
    if(s.phase==='finished')throw Error('El partido terminó.');
  }
  configureTeam(id:string,team:Team,formation:unknown,style:unknown) {
    this.authorizePlan(id,team);
    if(!validFormation(formation)||!validStyle(style))throw Error('Plan táctico inválido.');
    const s=this.state,active=s.teamPlans[team];
    const lineup=s.phase==='lobby'&&s.autoLineup[team]
      ? automaticLineup(s.players.filter(p=>p.team===team&&!p.keeper),formation)
      : remapLineup(active,formation);
    const plan={formation,style,lineup};
    if(s.phase==='lobby') {
      if(JSON.stringify(plan)===JSON.stringify(active))return;
      s.teamPlans[team]=plan;
      for(const h of s.humans)if(h.team===team)h.ready=false;
    } else {
      s.pendingTeamPlans[team]=JSON.stringify(plan)===JSON.stringify(active)?null:plan;
    }
  }
  setLineup(id:string,team:Team,lineup:unknown) {
    this.authorizePlan(id,team);
    const s=this.state;
    if(s.phase!=='lobby')throw Error('Los puestos se ordenan antes del partido.');
    if(lineup!=='auto'&&!validLineup(lineup))throw Error('La alineación debe incluir los cuatro puestos sin repetir.');
    s.autoLineup[team]=lineup==='auto';
    s.teamPlans[team].lineup=lineup==='auto'
      ? automaticLineup(s.players.filter(p=>p.team===team&&!p.keeper),s.teamPlans[team].formation)
      : [...lineup as Lineup];
    for(const h of s.humans)if(h.team===team)h.ready=false;
  }
  ready(id:string,value:boolean) {const h=this.state.humans.find(h=>h.id===id);if(h&&this.state.phase==='lobby')h.ready=value;}
  start(id:string) {
    const s=this.state;
    if(id!==s.host)throw Error('Solo el anfitrión puede iniciar.');
    if(s.phase!=='lobby')throw Error('El partido ya comenzó.');
    if(!s.humans.some(h=>h.connected)||s.humans.some(h=>h.connected&&!h.ready))throw Error('Falta que todos estén listos.');
    for(const team of [0,1] as Team[])if(!s.humans.some(h=>h.team===team)) {
      const formation=(['1-2-1','2-2','1-1-2'] as const)[Math.floor(random(s)*3)];
      const style=(['balanced','possession','counterattack'] as const)[Math.floor(random(s)*3)];
      s.teamPlans[team]={formation,style,lineup:automaticLineup(s.players.filter(p=>p.team===team&&!p.keeper),formation)};
      s.pendingTeamPlans[team]=null;s.autoLineup[team]=true;
    }
    s.phase='kickoff';s.phaseTime=3;s.restartTeam=0;event(s,'start','¡A la cancha!');
    this.inputs.clear();this.previous.clear();
    for(const p of s.players)if(p.controller)this.gates.set(p.controller,{epoch:p.epoch,blocked:new Set()});
  }
  rematch(id:string) {
    if(this.state.phase!=='finished'||id!==this.state.host)throw Error('La revancha la abre el anfitrión al terminar.');
    const previous=this.state;
    this.state=createState(previous.seed,previous.regulation,previous.overtime,previous.mode);
    for(const p of this.state.players)p.species=previous.players.find(q=>q.id===p.id)!.species;
    this.state.nextId=previous.nextId;this.state.settings={...previous.settings};
    this.state.teamPlans=previous.teamPlans.map(p=>({...p,lineup:[...p.lineup]})) as MatchState['teamPlans'];
    this.state.autoLineup=[...previous.autoLineup];
    this.state.orbTimer=PACE_PROFILES[previous.settings.pace].orbInterval;this.state.itemTimer=PACE_PROFILES[previous.settings.pace].itemInterval;
    for(const h of previous.humans) {this.addHuman(h.id,h.name,h.team);if(!h.connected)this.disconnect(h.id);}
    this.state.host=id;this.inputs.clear();this.previous.clear();this.acks.clear();
  }
  input(id:string,raw:unknown):boolean {
    const frame=sanitizeInput(raw),p=controlled(this.state,id);
    if(!frame||!p||frame.epoch!==p.epoch||frame.seq<=(this.acks.get(id)??-1))return false;
    const prior=this.inputs.get(id);
    if(prior&&frame.seq<=prior.frame.seq)return false;
    let gate=this.gates.get(id);
    const actions=['pass','lob','shoot','dodge','switch','simple','normal','special','item'] as const;
    if(!gate||gate.epoch!==p.epoch) {
      gate={epoch:p.epoch,blocked:new Set(actions)};this.gates.set(id,gate);
      this.previous.delete(id);
    }
    for(const action of actions) {
      if(!frame[action])gate.blocked.delete(action);
      if(gate.blocked.has(action))frame[action]=false;
    }
    this.inputs.set(id,{frame,at:this.state.time});return true;
  }
  private switch(id:string) {
    const h=this.state.humans.find(h=>h.id===id&&h.connected);if(!h)return;
    if(this.state.keeperPossession?.controller===id)return;
    if(this.state.ball.passSession===id)this.state.ball.passSession=null;
    const candidates=this.state.players.filter(p=>p.team===h.team&&!p.keeper&&p.controller===null)
      .sort((a,b)=>distance(a,this.state.ball)-distance(b,this.state.ball));
    if(candidates[0])transfer(this.state,h,candidates[0]);
  }
  private act(p:Fighter,input:InputFrame,prev:InputFrame,dt:number) {
    const s=this.state;
    const edge=(key:keyof InputFrame)=>!!input[key]&&!prev[key];
    if(p.keeper){keeperInput(s,p,input,prev);return;}
    if(p.stun>0||p.cast>0){p.charge=0;return;}
    if(edge('switch')&&p.controller) {this.switch(p.controller);return;}
    const before={x:p.x,z:p.z};
    moveFighter(p,input,dt,s.settings);
    constrainKeeperArea(s,p,before);
    const running=input.sprint&&p.noSprint<=0&&Math.hypot(input.moveX,input.moveZ)>.1;
    p.stamina=clamp(p.stamina+(running?-23:16)*dt,0,100);
    if(edge('dodge')&&p.stamina>=25&&p.actionCd<=0) {
      p.stamina-=25;p.dodgeTime=.3;p.vx=p.facingX*13*PACE_PROFILES[s.settings.pace].impulse;p.vz=p.facingZ*13*PACE_PROFILES[s.settings.pace].impulse;p.actionCd=.45;
      setAction(s,p,'dodge',.35);
    }
    if(edge('simple'))castAbility(s,p,0);
    else if(edge('normal'))castAbility(s,p,1);
    else if(edge('special'))castAbility(s,p,2);
    if(edge('item'))useItem(s,p);
    if(p.cast>0)return;
    if(s.ball.owner===p.id) {
      if(edge('pass')||edge('lob'))passBall(s,p,input.lob);
      if(input.shoot&&p.actionCd<=0)p.charge=Math.min(1.2,p.charge+dt);
      if(!input.shoot&&prev.shoot&&p.charge>0)shootBall(s,p,p.charge,1,0,false,p.controller?0:(random(s)*2-1)*BOT_PROFILES[botDifficulty(s,p.team)].shotError);
    } else {
      p.charge=0;
      if(edge('shoot')&&p.actionCd<=0) {
        p.actionCd=p.controller?.7:BOT_PROFILES[botDifficulty(s,p.team)].tackleCooldown;p.anim='tackle';setAction(s,p,'tackle',.4);
        const rivals=s.players.filter(q=>q.team!==p.team&&!q.keeper&&distance(p,q)<2.5)
          .sort((a,b)=>distance(a,p)-distance(b,p));
        const q=rivals[0];if(q){const v=unit(q.x-p.x,q.z-p.z);if(v.x*p.facingX+v.z*p.facingZ>-.1)hit(s,q,v.x,v.z,5+POKEMON[p.species].stats[1],.45,0,'contact');}
      }
    }
  }
  step(dt=1/30) {
    const s=this.state;s.tick++;s.time+=dt;
    if(s.phase==='lobby'||s.phase==='finished')return;
    if(s.phase==='kickoff'||s.phase==='goal'||s.phase==='halftime') {
      s.phaseTime-=dt;
      if(s.phaseTime<=0) {
        if(s.phase==='halftime'){
          s.half=2;s.remaining=s.regulation;s.restartTeam=1;s.phase='kickoff';s.phaseTime=3;
        } else if(s.remaining<=0) {
          this.endPeriod();
        } else {
          resetPositions(s,s.restartTeam??0);
          this.inputs.clear();this.previous.clear();
          s.phase=s.half===3?'overtime':'playing';
        }
      }
      return;
    }
    updateKeeperPossession(s);
    updateTactics(s);
    for(const p of s.players) {
      for(const key of ['confusion','confusionGuard','simpleCd','stun','immunity','slowTime','shield','boost','buff','ghost','noSprint','actionCd','dodgeTime'] as const)p[key]=Math.max(0,p[key]-dt);
      for(const id of Object.keys(p.statuses) as (keyof typeof p.statuses)[]) {
        p.statuses[id]=Math.max(0,p.statuses[id]!-dt);if(p.statuses[id]===0)delete p.statuses[id];
      }
      if(p.actionUntil<=s.time){p.action=null;p.actionAbility=null;}
      if(p.cast>0){p.cast=Math.max(0,p.cast-dt);if(p.cast===0)finishCast(s,p);}
      if(p.keeper&&!p.controller)continue;
      let input:InputFrame;
      if(p.controller) {
        const saved=this.inputs.get(p.controller);
        input=saved&&saved.frame.epoch===p.epoch&&s.time-saved.at<.25?saved.frame:emptyInput(p.epoch);
        if(saved&&saved.frame.epoch===p.epoch)this.acks.set(p.controller,saved.frame.seq);
      } else input=botInput(s,p,dt);
      const retreat=s.keeperPossession?.retreat[p.id];
      if(retreat){
        const v=unit(retreat.x-p.x,retreat.z-p.z);input={...emptyInput(p.epoch),moveX:v.x,moveZ:v.z};
        p.stun=0;p.cast=0;p.vx=0;p.vz=0;
      }
      const key=p.controller??'bot:'+p.id,savedPrev=this.previous.get(key);
      const prev=savedPrev?.epoch===p.epoch?savedPrev:emptyInput(p.epoch);
      this.act(p,input,prev,dt);this.previous.set(key,{...input});
    }
    for(let i=0;i<2;i++) {
      const positions=s.players.map(p=>({x:p.x,z:p.z}));
      updateKeepers(s,dt/2);resolvePlayers(s,dt/2);updateEffects(s,dt/2);
      s.players.forEach((p,index)=>constrainKeeperArea(s,p,positions[index]));
      updateBall(s,dt/2);
      if(!['playing','overtime'].includes(s.phase))break;
    }
    if(['goal'].includes(s.phase))s.remaining=Math.max(0,s.remaining-dt);
    if(s.phase==='playing'||s.phase==='overtime') {
      updatePickups(s,dt);s.remaining=Math.max(0,s.remaining-dt);
      if(s.remaining<=0)this.endPeriod();
    }
    for(const p of s.players){p.x=clamp(p.x,-FIELD.halfWidth+FIELD.playerRadius,FIELD.halfWidth-FIELD.playerRadius);p.z=clamp(p.z,-FIELD.halfDepth+FIELD.playerRadius,FIELD.halfDepth-FIELD.playerRadius);}
  }
  private endPeriod() {
    const s=this.state;endKeeperPossession(s);
    if(s.half===1){s.phase='halftime';s.phaseTime=10;event(s,'half','Entretiempo');}
    else if(s.half===2&&s.score[0]===s.score[1]) {
      s.half=3;s.remaining=s.overtime;s.phase='kickoff';s.phaseTime=3;s.restartTeam=0;event(s,'overtime','Gol de oro');
    } else {s.phase='finished';s.restartTeam=null;s.winner=s.score[0]===s.score[1]?null:s.score[0]>s.score[1]?0:1;event(s,'end','Final del partido');}
  }
}
