import { DEFAULT_TEAMS, FIELD, POKEMON } from './catalog.ts';
import type { Ball, Fighter, Human, InputFrame, MatchState, Species, Team, MatchSettings, Vec } from './types.ts';
import { areaExit, fieldPoint, inArea } from './geometry.ts';
import { clamp, distance, unit } from './math.ts';
import { automaticLineup, defaultTeamPlan, positionFor } from './team-plan.ts';
import { PACE_PROFILES, REGULATION_SECONDS, OVERTIME_SECONDS } from './tuning.ts';
import type { FighterAction, MatchMode } from './types.ts';

export const DEFAULT_SETTINGS: MatchSettings = { pace: 'balanced', difficulty: 'normal' };
export const PACE_MULTIPLIER = { slow: PACE_PROFILES.slow.movement, balanced: PACE_PROFILES.balanced.movement, fast: PACE_PROFILES.fast.movement } as const;
export function validSettings(raw: unknown): raw is MatchSettings {
  if (!raw || typeof raw !== 'object') return false;
  const settings = raw as MatchSettings;
  return ['slow', 'balanced', 'fast'].includes(settings.pace) && ['easy', 'normal', 'hard'].includes(settings.difficulty);
}
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
    stun:0,immunity:0,slow:0,slowTime:0,shield:0,boost:0,buff:0,ghost:0,noSprint:0,
    actionCd:0,dodgeTime:0,charge:0,cast:0,castSlot:-1,castX:1,castZ:0,
    aiTimer:0,aiX:0,aiZ:0,aiShoot:false,aiSprint:false,passCredit:0,anim:'idle',action:null,actionStarted:0,actionUntil:0 };
}
export function freshBall(): Ball {
  return {x:0,z:0,y:.35,vx:0,vy:0,vz:0,owner:null,lastTouch:null,passer:null,passSession:null,passTarget:null,shot:false,pickupLock:0,curve:0,fiery:0,lastTeam:null};
}
export function createState(seed=12345, regulation=REGULATION_SECONDS, overtime=OVERTIME_SECONDS, mode:MatchMode='online'): MatchState {
  const state: MatchState = {settings:{...DEFAULT_SETTINGS},keeperPossession:null,tactics:[0,1].map(()=>({focus:{x:0,z:0},presser:null,collector:null,powerReadyAt:0,roles:{},targets:{}})) as MatchState['tactics'],mode,teamPlans:[defaultTeamPlan(),defaultTeamPlan()],pendingTeamPlans:[null,null],autoLineup:[true,true],restartTeam:null,version:1,tick:0,time:0,phase:'lobby',remaining:regulation,phaseTime:0,half:1,score:[0,0],
    players:[],ball:freshBall(),effects:[],pickups:[],humans:[],host:null,events:[],seed,nextId:1,
    orbTimer:PACE_PROFILES.balanced.orbInterval,itemTimer:PACE_PROFILES.balanced.itemInterval,possession:null,regulation,overtime,winner:null};
  for (const team of [0,1] as Team[]) {
    DEFAULT_TEAMS[team].forEach((id,slot)=>state.players.push(fighter(team,slot,id)));
    state.players.push(fighter(team,4,'ditto',true));
  }
  for (const team of [0,1] as Team[]) state.teamPlans[team].lineup=automaticLineup(state.players.filter(p=>p.team===team&&!p.keeper),'1-2-1');
  resetPositions(state,0); return state;
}
export function attackDirection(s: MatchState, team: Team): number {
  const base=team===0?1:-1;
  return s.half===2 ? -base : base;
}
export function resetPositions(s: MatchState, kickoff: Team) {
  endKeeperPossession(s);
  for (const team of [0,1] as Team[]) {
    const pending=s.pendingTeamPlans[team];
    if(pending)s.teamPlans[team]={...pending,lineup:[...pending.lineup]};
    s.pendingTeamPlans[team]=null;
  }
  s.restartTeam=null;
  for (const t of s.tactics) {t.focus={x:0,z:0};t.presser=null;t.collector=null;t.roles={};t.targets={};t.powerReadyAt=s.time;}
  for (const p of s.players) {
    const dir=attackDirection(s,p.team);
    if(p.keeper){p.x=-dir*(FIELD.halfWidth-FIELD.keeperInset);p.z=0;}
    else {
      const position=positionFor(s.teamPlans[p.team],p.slot);
      p.x=dir*(-FIELD.halfWidth*.48+position.x*FIELD.halfWidth*.48);
      p.z=position.z*FIELD.halfDepth;
    }
    p.vx=0;p.vz=0;p.stun=0;p.immunity=1;p.ghost=0;p.cast=0;p.castSlot=-1;p.charge=0;p.anim='idle';
    p.action=null;p.actionStarted=s.time;p.actionUntil=s.time;p.facingX=dir;p.facingZ=0;
    p.aiTimer=.3;p.aiX=0;p.aiZ=0;p.aiShoot=false;p.aiSprint=false;
    if(p.controller)p.epoch=s.nextId++;
  }
  s.ball=freshBall();s.effects=[];
  const plan=s.teamPlans[kickoff];
  const attackingSlot=plan.lineup.find(slot=>positionFor(plan,slot).role==='forward')??plan.lineup[0];
  const taker=s.players.find(p=>p.team===kickoff&&!p.keeper&&p.controller)??s.players.find(p=>p.team===kickoff&&p.slot===attackingSlot)!;
  taker.x=-attackDirection(s,kickoff);taker.z=0;
  s.ball.owner=taker.id;s.ball.lastTouch=taker.id;s.ball.lastTeam=kickoff;
  s.possession=kickoff;
  assignPossession(s,taker);
}
export function setAction(s: MatchState, p: Fighter, action: FighterAction, duration: number) {
  p.action=action;p.actionStarted=s.time;p.actionUntil=s.time+duration;
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
  if(!human.connected || target.team!==human.team || target.controller!==null || target.keeper && (s.keeperPossession?.keeperId!==target.id || s.ball.owner!==target.id)) return false;
  const old=controlled(s,human.id);
  if(old) {old.controller=null;old.epoch=s.nextId++;old.charge=0;}
  target.controller=human.id;target.epoch=s.nextId++;target.charge=0;target.aiTimer=0;target.aiShoot=false;target.aiSprint=false;human.fighterId=target.id;
  return true;
}
export function movementSpeed(p:Fighter, sprint=false, settings:MatchSettings=DEFAULT_SETTINGS): number {
  const stats=POKEMON[p.species]?.stats ?? [3,3,3,3];
  let speed=5.8+stats[0]*.42;
  if(sprint&&p.stamina>0&&p.noSprint<=0)speed*=1.45;
  if(p.boost>0)speed*=1.25;
  if(p.buff>0&&p.species==='dragonite')speed*=1.18;
  if(p.buff>0&&p.species==='snorlax')speed*=.65;
  if(p.slowTime>0)speed*=1-Math.min(.4,p.slow);
  if(p.charge>0)speed*=.55;
  return speed*(p.keeper?1:PACE_MULTIPLIER[settings.pace]);
}
export function moveFighter(p:Fighter,input:Pick<InputFrame,'moveX'|'moveZ'|'sprint'>,dt:number,settings:MatchSettings=DEFAULT_SETTINGS) {
  if(p.keeper||p.stun>0||p.cast>0) return;
  const speed=movementSpeed(p,input.sprint,settings);
  p.x=clamp(p.x+input.moveX*speed*dt,-FIELD.halfWidth+FIELD.playerRadius,FIELD.halfWidth-FIELD.playerRadius);
  p.z=clamp(p.z+input.moveZ*speed*dt,-FIELD.halfDepth+FIELD.playerRadius,FIELD.halfDepth-FIELD.playerRadius);
  if(Math.hypot(input.moveX,input.moveZ)>.1) {const v=unit(input.moveX,input.moveZ);p.facingX=v.x;p.facingZ=v.z;p.anim='run';}
  else p.anim='idle';
}

// All control acquisition goes through one deterministic choice, including rebounds.
export function assignPossession(s: MatchState, target: Fighter, preferred: string | null = null) {
  if (target.controller || target.keeper) return;
  const humans = s.humans.filter(h => h.connected && h.team === target.team && controlled(s, h.id));
  humans.sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred) ||
    distance(controlled(s, a.id)!, target) - distance(controlled(s, b.id)!, target) || a.id.localeCompare(b.id));
  if (humans[0]) transfer(s, humans[0], target);
}
export function beginKeeperPossession(s: MatchState, keeper: Fighter) {
  endKeeperPossession(s);
  const humans = s.humans.filter(h => h.connected && h.team === keeper.team && controlled(s, h.id));
  humans.sort((a, b) => distance(controlled(s, a.id)!, keeper) - distance(controlled(s, b.id)!, keeper) || a.id.localeCompare(b.id));
  const human = humans[0];
  const hold = s.keeperPossession = { keeperId: keeper.id, capturedAt: s.time, remaining: 8,
    controller: human?.id ?? null, previousFighterId: human?.fighterId ?? null,
    targetId: null as string | null, retreat: {} as Record<string, Vec> };
  const dir = attackDirection(s, keeper.team);
  for (const p of s.players) if (p.team !== keeper.team && !p.keeper && inArea(p, dir, FIELD.playerRadius)) {
    hold.retreat[p.id] = areaExit(p, dir); p.vx = 0; p.vz = 0; p.cast = 0; p.castSlot = -1; p.charge = 0;
  }
  keeper.facingX = dir; keeper.facingZ = 0; keeper.actionCd = 0;
  if (human) transfer(s, human, keeper);
}
export function endKeeperPossession(s: MatchState, recipient?: Fighter) {
  const hold = s.keeperPossession;
  if (!hold) return;
  s.keeperPossession = null;
  if(s.ball.owner===hold.keeperId)s.ball.owner=null;
  const keeper = byId(s, hold.keeperId);
  const human = s.humans.find(h => h.id === hold.controller && h.connected);
  if (keeper?.controller) {keeper.controller = null; keeper.epoch = s.nextId++;}
  if (!human) return;
  const available = (p: Fighter | undefined): p is Fighter => !!p && !p.keeper && p.team === human.team && !p.controller;
  const prior = byId(s, hold.previousFighterId);
  const target = available(recipient) ? recipient : available(prior) ? prior : s.players.find(available);
  if (target) transfer(s, human, target);
}
export function constrainKeeperArea(s: MatchState, p: Fighter, previous?: Vec) {
  const hold = s.keeperPossession, keeper = hold && byId(s, hold.keeperId);
  if (!hold || !keeper || p.team === keeper.team || p.keeper) return;
  const dir = attackDirection(s, keeper.team);
  if (!inArea(p, dir, FIELD.playerRadius)) {delete hold.retreat[p.id]; return;}
  const exit = hold.retreat[p.id];
  if (exit && previous && inArea(previous, dir, FIELD.playerRadius) && distance(p, exit) <= distance(previous, exit) + .00001) return;
  Object.assign(p, previous && !inArea(previous, dir, FIELD.playerRadius) ? previous : areaExit(p, dir));
  Object.assign(p, fieldPoint(p)); p.vx = 0; p.vz = 0;
  delete hold.retreat[p.id];
}
