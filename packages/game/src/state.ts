import { DEFAULT_TEAMS, FIELD, POKEMON } from './catalog.ts';
import type { Ball, Fighter, Human, InputFrame, MatchState, Species, Team } from './types.ts';
import { clamp, unit } from './math.ts';

export function emptyInput(epoch = 0, seq = 0): InputFrame {
  return { seq, epoch, moveX:0, moveZ:0, pass:false,lob:false,shoot:false,dodge:false,sprint:false,switch:false,simple:false,normal:false,special:false,item:false };
}
export function sanitizeInput(raw: unknown): InputFrame | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string,unknown>;
  if (!Number.isSafeInteger(r.seq) || !Number.isSafeInteger(r.epoch) || (r.seq as number) < 0) return null;
  const i = emptyInput(r.epoch as number, r.seq as number);
  i.moveX = typeof r.moveX === 'number' && Number.isFinite(r.moveX) ? clamp(r.moveX,-1,1) : 0;
  i.moveZ = typeof r.moveZ === 'number' && Number.isFinite(r.moveZ) ? clamp(r.moveZ,-1,1) : 0;
  if (Math.hypot(i.moveX,i.moveZ)>1) { const v=unit(i.moveX,i.moveZ); i.moveX=v.x;i.moveZ=v.z; }
  for (const key of ['pass','lob','shoot','dodge','sprint','switch','simple','normal','special','item'] as const) i[key]=r[key]===true;
  return i;
}
export function fighter(team: Team, slot: number, species: Species, keeper=false): Fighter {
  return { id:team+'-'+slot,team,slot,species,keeper,x:0,z:0,vx:0,vz:0,facingX:team===0?1:-1,facingZ:0,
    controller:null,epoch:0,stamina:100,simpleCd:0,normal:0,special:0,item:null,
    stun:0,immunity:0,slow:0,slowTime:0,shield:0,boost:0,buff:0,cloak:0,noSprint:0,
    actionCd:0,dodgeTime:0,charge:0,cast:0,castSlot:-1,castX:1,castZ:0,
    aiTimer:0,aiX:0,aiZ:0,aiShoot:false,passCredit:0,anim:'idle' };
}
export function freshBall(): Ball {
  return {x:0,z:0,y:.35,vx:0,vy:0,vz:0,owner:null,lastTouch:null,passer:null,passSession:null,passTarget:null,shot:false,pickupLock:0,curve:0,fiery:0,lastTeam:null};
}
export function createState(seed=12345, regulation=300, overtime=120): MatchState {
  const state: MatchState = {version:1,tick:0,time:0,phase:'lobby',remaining:regulation,phaseTime:0,half:1,score:[0,0],
    players:[],ball:freshBall(),effects:[],pickups:[],humans:[],host:null,events:[],seed,nextId:1,
    orbTimer:30,itemTimer:20,possession:null,regulation,overtime,winner:null};
  for (const team of [0,1] as Team[]) {
    DEFAULT_TEAMS[team].forEach((id,slot)=>state.players.push(fighter(team,slot,id)));
    state.players.push(fighter(team,4,'ditto',true));
  }
  resetPositions(state,0); return state;
}
export function attackDirection(s: MatchState, team: Team): number {
  const base=team===0?1:-1;
  return s.half===2 ? -base : base;
}
export function resetPositions(s: MatchState, kickoff: Team) {
  for (const p of s.players) {
    const dir=attackDirection(s,p.team);
    p.x=-dir*(p.keeper?22:[6,12,12,17][p.slot]); p.z=p.keeper?0:[0,-8,8,0][p.slot];
    p.vx=0;p.vz=0;p.stun=0;p.immunity=1;p.cast=0;p.castSlot=-1;p.charge=0;p.anim='idle';p.facingX=dir;p.facingZ=0;
    p.aiTimer=.3;
  }
  s.ball=freshBall(); s.effects=[];
  const taker=s.players.find(p=>p.team===kickoff&&p.slot===0)!;
  taker.x=-attackDirection(s,kickoff)*1; taker.z=0;
  s.ball.owner=taker.id; s.ball.lastTouch=taker.id;s.ball.lastTeam=kickoff;
  s.possession=kickoff;
}
export function random(s: MatchState): number {
  s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0; return s.seed/4294967296;
}
export function event(s: MatchState, kind:string, text:string, actor?:Fighter) {
  s.events.push({id:s.nextId++,kind,text,actor:actor?.id,team:actor?.team});
  if(s.events.length>10)s.events.shift();
}
export function byId(s:MatchState,id:string|null|undefined) { return s.players.find(p=>p.id===id); }
export function controlled(s:MatchState,id:string) { return s.players.find(p=>p.controller===id); }
export function transfer(s:MatchState, human:Human, target:Fighter): boolean {
  if(target.keeper || target.team!==human.team || target.controller!==null) return false;
  const old=controlled(s,human.id);
  if(old) {old.controller=null;old.epoch=s.nextId++;old.charge=0;}
  target.controller=human.id;target.epoch=s.nextId++;target.charge=0;human.fighterId=target.id;
  return true;
}
export function movementSpeed(p:Fighter, sprint=false): number {
  const stats=POKEMON[p.species]?.stats ?? [3,3,3,3];
  let speed=5.8+stats[0]*.42;
  if(sprint&&p.stamina>0&&p.noSprint<=0)speed*=1.45;
  if(p.boost>0)speed*=1.25;
  if(p.buff>0&&p.species==='dragonite')speed*=1.18;
  if(p.buff>0&&p.species==='snorlax')speed*=.65;
  if(p.slowTime>0)speed*=1-Math.min(.4,p.slow);
  if(p.charge>0)speed*=.55;
  return speed;
}
export function moveFighter(p:Fighter,input:Pick<InputFrame,'moveX'|'moveZ'|'sprint'>,dt:number) {
  if(p.stun>0||p.cast>0) return;
  const speed=movementSpeed(p,input.sprint);
  p.x=clamp(p.x+input.moveX*speed*dt,-FIELD.halfWidth+.65,FIELD.halfWidth-.65);
  p.z=clamp(p.z+input.moveZ*speed*dt,-FIELD.halfDepth+.65,FIELD.halfDepth-.65);
  if(Math.hypot(input.moveX,input.moveZ)>.1) {const v=unit(input.moveX,input.moveZ);p.facingX=v.x;p.facingZ=v.z;p.anim='run';}
  else p.anim='idle';
}
