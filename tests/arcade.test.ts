import { describe, expect, it } from 'vitest';
import { Game } from '../packages/game/src/engine.ts';
import { POKEMON } from '../packages/game/src/catalog.ts';
import { FIELD } from '../packages/game/src/geometry.ts';
import { controlled, emptyInput, resetPositions, transfer, moveFighter } from '../packages/game/src/state.ts';
import { automaticLineup, positionFor } from '../packages/game/src/team-plan.ts';
import { botDifficulty, PACE_PROFILES } from '../packages/game/src/tuning.ts';
import { botInput } from '../packages/game/src/ai.ts';
import { updateTactics } from '../packages/game/src/tactics.ts';
import { executeAbility, castAbility } from '../packages/game/src/abilities.ts';
import { hit, passBall, shootBall } from '../packages/game/src/ball.ts';
import { scoreGoal, resolvePlayers, updateBall } from '../packages/game/src/physics.ts';
import { visibleRivals } from '../packages/game/src/keepers.ts';
import { makePatch, wireState, applyPatch } from '../packages/game/src/protocol.ts';
import { camera } from '../apps/client/src/gl.ts';
import { MatchCamera } from '../apps/client/src/match-camera.ts';
import type { Formation, Pace, PlayStyle, Team } from '../packages/game/src/types.ts';

const ticks=(g:Game,n:number)=>{for(let i=0;i<n;i++)g.step();};
function quietGame() {
  const g=new Game(52);g.addHuman('a','Ana',0);g.state.phase='playing';
  for(const p of g.state.players){p.aiTimer=1000;p.aiX=p.aiZ=0;p.immunity=0;}
  return g;
}

describe('planes y puestos persistentes',()=>{
  it('sugiere por atributos y permite cualquier especie en cualquier puesto sin cambiar identidades',()=>{
    const g=new Game();g.addHuman('a','Ana',0);g.addHuman('b','Bruno',0);
    const s=g.state,plan=s.teamPlans[0],before=s.players.map(p=>[p.id,p.slot,p.species,p.controller,p.epoch]);
    expect(s.players.find(p=>p.team===0&&p.slot===plan.lineup[0])!.species).toBe('blastoise');
    g.setLineup('a',0,[0,1,2,3]);
    expect(s.players.map(p=>[p.id,p.slot,p.species,p.controller,p.epoch])).toEqual(before);
    expect(positionFor(s.teamPlans[0],0).role).toBe('cover');
    g.choose('a',0,'machamp');expect(s.teamPlans[0].lineup).toEqual([0,1,2,3]);
    g.setLineup('a',0,'auto');expect(s.autoLineup[0]).toBe(true);
    expect(s.teamPlans[0].lineup).toEqual(automaticLineup(s.players.filter(p=>p.team===0&&!p.keeper),'1-2-1'));
  });
  it('solo el capitán configura su equipo; rechaza rival, opciones y puestos inválidos',()=>{
    const g=new Game();g.addHuman('a','Ana',0);g.addHuman('b','Bruno',0);
    expect(()=>g.configureTeam('b',0,'2-2','balanced')).toThrow(/capitán/);
    expect(()=>g.configureTeam('a',1,'2-2','counterattack')).toThrow();
    g.addHuman('r','Rival',1);
    expect(()=>g.configureTeam('a',1,'1-2-1','balanced')).toThrow(/capitán/);
    expect(()=>g.configureTeam('a',0,'constructor','balanced')).toThrow(/inválido/);
    expect(()=>g.configureTeam('a',0,'2-2','__proto__')).toThrow(/inválido/);
    for(const value of [[0,1,1,3],[0,1,2,4],[0,1,2],[0,1,2,'3'],null])
      expect(()=>g.setLineup('a',0,value)).toThrow(/alineación/);
    g.disconnect('a');expect(()=>g.configureTeam('a',0,'2-2','balanced')).toThrow();
    g.configureTeam('b',0,'2-2','balanced');
  });
  it('invalida listos solo del equipo afectado y respeta orden manual al cambiar estilo',()=>{
    const g=new Game();g.addHuman('a','A',0);g.addHuman('r','R',1);
    g.setLineup('a',0,[3,2,1,0]);g.ready('a',true);g.ready('r',true);
    g.configureTeam('a',0,'1-2-1','possession');
    expect(g.state.teamPlans[0].lineup).toEqual([3,2,1,0]);
    expect(g.state.humans.map(h=>h.ready)).toEqual([false,true]);
  });
  it('reemplaza propuestas sin mover jugadores y aplica la última una sola vez al terminar el gol',()=>{
    const g=quietGame(),s=g.state,p=controlled(s,'a')!;
    const active=structuredClone(s.teamPlans[0]),positions=s.players.map(p=>[p.x,p.z]),epoch=p.epoch;
    g.configureTeam('a',0,'2-2','counterattack');
    g.configureTeam('a',0,'1-1-2','possession');
    expect(s.teamPlans[0]).toEqual(active);expect(s.players.map(p=>[p.x,p.z])).toEqual(positions);
    expect(p.epoch).toBe(epoch);expect(()=>g.setLineup('a',0,'auto')).toThrow(/antes/);
    scoreGoal(s,1);g.configureTeam('a',0,'2-2','balanced');
    expect(p.epoch).toBe(epoch);ticks(g,91);
    expect(s.phase).toBe('playing');expect(s.teamPlans[0].formation).toBe('2-2');
    expect(s.pendingTeamPlans[0]).toBeNull();expect(p.epoch).toBeGreaterThan(epoch);
    const resumedEpoch=p.epoch;g.step();expect(p.epoch).toBe(resumedEpoch);
    expect(s.players.filter(p=>p.controller)).toHaveLength(1);
  });
  it('no acumula reordenamientos al probar varias formaciones pendientes',()=>{
    const a=quietGame(),b=quietGame();
    a.configureTeam('a',0,'2-2','possession');a.configureTeam('a',0,'1-1-2','counterattack');
    b.configureTeam('a',0,'1-1-2','counterattack');
    expect(a.state.pendingTeamPlans[0]).toEqual(b.state.pendingTeamPlans[0]);
    a.configureTeam('a',0,'1-2-1','balanced');expect(a.state.pendingTeamPlans[0]).toBeNull();
  });
  it('evita un saque ficticio al terminar período y aplica pendientes tras el descanso',()=>{
    const g=quietGame(),s=g.state,p=controlled(s,'a')!,epoch=p.epoch;
    g.configureTeam('a',0,'1-1-2','possession');scoreGoal(s,1);s.remaining=0;ticks(g,91);
    expect(s.phase).toBe('halftime');expect(p.epoch).toBe(epoch);
    expect(s.pendingTeamPlans[0]).not.toBeNull();
    ticks(g,392);expect(s.half).toBe(2);expect(s.phase).toBe('playing');
    expect(s.teamPlans[0].formation).toBe('1-1-2');expect(p.epoch).toBeGreaterThan(epoch);
  });
  it('contabiliza un gol en el último ciclo sin inventar un saque antes del descanso',()=>{
    const g=quietGame(),s=g.state,epoch=controlled(s,'a')!.epoch;
    s.players.forEach(p=>{p.x=-20;p.z=20;});
    Object.assign(s.ball,{owner:null,x:FIELD.halfWidth-.2,z:0,y:.5,vx:30,vz:0,vy:0});
    s.remaining=1/60;g.step();
    expect(s.score[0]).toBe(1);expect(s.phase).toBe('goal');expect(s.remaining).toBe(0);
    ticks(g,91);expect(s.phase).toBe('halftime');expect(controlled(s,'a')!.epoch).toBe(epoch);
  });
  it('mantiene planes activos y pendientes al reconectar; la revancha descarta pendientes',()=>{
    const g=quietGame(),s=g.state;
    g.configureTeam('a',0,'2-2','counterattack');resetPositions(s,0);
    g.configureTeam('a',0,'1-1-2','possession');const pending=structuredClone(s.pendingTeamPlans[0]);
    g.disconnect('a');expect(g.reconnect('a')).toBe(true);expect(s.pendingTeamPlans[0]).toEqual(pending);
    s.phase='finished';g.rematch('a');
    expect(g.state.teamPlans[0].formation).toBe('2-2');expect(g.state.pendingTeamPlans).toEqual([null,null]);
    expect(g.state.regulation).toBe(180);
  });
  it.each(['1-2-1','2-2','1-1-2'] as Formation[])('%s conserva puestos al transferir el control y durante cambios de posesión',formation=>{
    const g=new Game();g.addHuman('a','A',0);g.configureTeam('a',0,formation,'balanced');
    const s=g.state,plan=structuredClone(s.teamPlans[0]);s.phase='playing';
    for(const owner of ['0-0','1-1',null,'0-3']){s.ball.owner=owner;updateTactics(s);expect(s.teamPlans[0]).toEqual(plan);}
    transfer(s,s.humans[0],s.players[2]);updateTactics(s);expect(s.teamPlans[0]).toEqual(plan);
    expect(s.tactics[0].roles[controlled(s,'a')!.id]).toBeDefined();
  });
  it('cubre la salida de un defensor humano y devuelve el apoyo al puesto cuando regresa',()=>{
    const g=quietGame(),s=g.state,defender=s.players.find(p=>p.team===0&&p.slot===s.teamPlans[0].lineup[0])!;
    transfer(s,s.humans[0],defender);s.ball.owner='0-0';s.ball.x=0;s.ball.z=0;defender.x=15;defender.z=10;
    updateTactics(s);
    expect(s.players.some(p=>p.team===0&&!p.controller&&s.tactics[0].roles[p.id]==='cover')).toBe(true);
    Object.assign(defender,s.tactics[0].targets[defender.id]);updateTactics(s);
    expect(s.players.filter(p=>p.team===0&&s.tactics[0].roles[p.id]==='cover').map(p=>p.id)).toEqual([defender.id]);
  });
  it('distingue apoyos de posesión, salida de contraataque y bloque bajo',()=>{
    const g=quietGame(),s=g.state;s.ball.owner='0-0';s.ball.x=0;s.ball.z=0;
    const targets=(style:PlayStyle)=>{s.teamPlans[0].style=style;updateTactics(s);return structuredClone(s.tactics[0].targets);};
    const balanced=targets('balanced'),possession=targets('possession'),counter=targets('counterattack');
    expect(Math.abs(possession['0-3'].z)).toBeLessThan(Math.abs(balanced['0-3'].z));
    expect(counter['0-1'].x).toBeGreaterThan(balanced['0-1'].x);
    s.ball.owner='1-0';const normalBlock=targets('balanced'),lowBlock=targets('counterattack');
    expect(lowBlock['0-2'].x).toBeLessThan(normalBlock['0-2'].x);
  });
  it('ofrece un desmarque adelantado cuando el atacante lleva la pelota',()=>{
    const g=quietGame(),s=g.state;s.ball.owner='0-1';s.ball.x=s.players[1].x=5;s.ball.z=s.players[1].z=0;
    updateTactics(s);
    expect(Object.entries(s.tactics[0].targets).some(([id,p])=>id!=='0-1'&&p.x>12)).toBe(true);
    expect(Object.values(s.tactics[0].roles)).toContain('cover');
  });
});

describe('ritmo completo y protección visible',()=>{
  it('remata por la esquina cuya línea evaluó, sin desviar la puntería al normalizar el movimiento',()=>{
    const g=new Game(76),s=g.state,p=s.players[1];s.phase='playing';
    s.players.forEach((q,i)=>{q.x=-25+i;q.z=18;});
    Object.assign(p,{x:20,z:0,aiTimer:0,actionCd:0,simpleCd:100});
    s.ball.owner=p.id;s.ball.x=p.x;s.ball.z=p.z;
    updateTactics(s);const input=botInput(s,p,1/30);
    expect(input.shoot).toBe(true);
    moveFighter(p,input,1/30,s.settings);shootBall(s,p,.5);
    const goalZ=s.ball.z+(FIELD.halfWidth-s.ball.x)*s.ball.vz/s.ball.vx;
    expect(Math.abs(goalZ)).toBeCloseTo(FIELD.goalHalf-.8);
  });

  it('selecciona dificultad por modo explícito, nunca por número de humanos online',()=>{
    const solo=new Game(1,undefined,undefined,'solo');solo.addHuman('a','A',1);solo.state.settings.difficulty='easy';
    expect(botDifficulty(solo.state,1)).toBe('normal');expect(botDifficulty(solo.state,0)).toBe('easy');
    const online=new Game();online.addHuman('a','A',0);online.state.settings.difficulty='easy';
    expect(botDifficulty(online.state,0)).toBe('easy');expect(botDifficulty(online.state,1)).toBe('easy');
  });
  it.each(['slow','balanced','fast'] as Pace[])('%s ajusta pases, tiros, proyectiles e intervalos sin cambiar el reloj',pace=>{
    const g=quietGame(),s=g.state,p=controlled(s,'a')!,profile=PACE_PROFILES[pace];s.settings.pace=pace;
    p.x=0;p.z=0;p.facingX=1;p.facingZ=0;s.players[1].x=10;s.players[1].z=0;s.ball.owner=p.id;
    passBall(s,p,false,s.players[1]);expect(Math.hypot(s.ball.vx,s.ball.vz)).toBeCloseTo((18+3*.8)*profile.ball);
    s.ball.owner=p.id;shootBall(s,p,.5);expect(Math.hypot(s.ball.vx,s.ball.vz)).toBeCloseTo((19+3*1.1+.5*9)*profile.ball);
    executeAbility(s,p,POKEMON.greninja.abilities[1]);const shot=s.effects.find(e=>e.kind==='projectile')!;
    expect(Math.hypot(shot.vx,shot.vz)).toBeCloseTo(16*profile.impulse);
    expect(Math.hypot(shot.vx,shot.vz)*shot.life).toBeCloseTo(14);
    const target=s.players.find(q=>q.team===1&&!q.keeper)!;target.immunity=0;
    hit(s,target,1,0,10,.3);expect(target.vx).toBeCloseTo(10*profile.impulse);
    const before=s.remaining;g.step();expect(before-s.remaining).toBeCloseTo(1/30);
  });
  it.each(['slow','balanced','fast'] as Pace[])('el pase elevado %s llega al receptor en campo ampliado',pace=>{
    const g=quietGame(),s=g.state,p=s.players[0],q=s.players[1];s.settings.pace=pace;
    s.players.forEach(r=>{r.x=0;r.z=20;});p.x=-12;p.z=0;q.x=12;q.z=0;p.facingX=1;p.facingZ=0;s.ball.owner=p.id;
    passBall(s,p,true,q);
    for(let i=0;i<200&&!s.ball.owner;i++)updateBall(s,1/60);
    expect(s.ball.owner).toBe(q.id);
  });
  it('el fantasma protege contacto pero no poderes y no desaparece de la percepción',()=>{
    const g=quietGame(),s=g.state,caster=s.players[5],target=s.players[6];
    executeAbility(s,caster,POKEMON.greninja.abilities[2]);
    expect(s.players.filter(p=>p.ghost>0)).toHaveLength(4);expect(s.players[9].ghost).toBe(0);
    expect(visibleRivals(s,s.players[0])).toContain(target);
    s.ball.owner=target.id;
    expect(hit(s,target,1,0,8,.5,0,'contact')).toBe(false);expect(s.ball.owner).toBe(target.id);
    expect(hit(s,target,1,0,8,.5,0,'ability')).toBe(true);expect(s.ball.owner).toBeNull();
    expect(target.ghost).toBe(1.5);ticks(g,46);expect(target.ghost).toBe(0);
  });
  it('permite interceptar un pase fantasmal y mantiene protección al pasar',()=>{
    const g=quietGame(),s=g.state,p=s.players[0],r=s.players[5],q=s.players[1];
    s.players.forEach(v=>{v.x=0;v.z=20;});Object.assign(p,{x:-5,z:0,facingX:1,facingZ:0,ghost:1.5});
    Object.assign(q,{x:5,z:0});Object.assign(r,{x:0,z:0});s.ball.owner=p.id;
    passBall(s,p,false,q);expect(p.ghost).toBe(1.5);
    for(let i=0;i<100&&!s.ball.owner;i++)updateBall(s,1/60);
    expect(s.ball.owner).toBe(r.id);
  });
  it('permite atravesar contacto rival sin atravesar límites de la cancha',()=>{
    const g=quietGame(),s=g.state,a=s.players[0],b=s.players[5];
    s.players.forEach((p,i)=>{p.x=-25+i*5;p.z=15;});Object.assign(a,{x:0,z:0,ghost:1.5});Object.assign(b,{x:.2,z:0});
    resolvePlayers(s,1/60);expect(a.x).toBe(0);expect(b.x).toBe(.2);
    a.x=100;a.vx=30;resolvePlayers(s,1/60);expect(a.x).toBeLessThanOrEqual(FIELD.halfWidth-FIELD.playerRadius);
  });
  it('no encadena aturdimientos aunque cambie el atacante',()=>{
    const g=quietGame(),s=g.state,target=s.players[1];
    expect(hit(s,target,1,0,5,10)).toBe(true);expect(target.stun).toBe(.8);
    expect(hit(s,target,-1,0,5,.8)).toBe(false);expect(target.immunity).toBe(2);
  });
  it('las acciones persisten al moverse y sobreviven a parches de red',()=>{
    const g=quietGame(),s=g.state,p=s.players[0];p.x=0;p.z=0;s.ball.owner=p.id;
    const before=wireState(s);passBall(s,p);moveFighter(p,{moveX:1,moveZ:0,sprint:false},1/30,s.settings);
    expect(p.anim).toBe('run');expect(p.action).toBe('pass');expect(p.actionUntil-s.time).toBe(.35);
    const after=wireState(s);expect(applyPatch(before,makePatch(before,after))).toEqual(after);
    ticks(g,12);expect(p.action).toBeNull();
  });
  it('escalona normales y especiales de bots sin limitar combinaciones humanas',()=>{
    const g=quietGame(),s=g.state,a=s.players[1],b=s.players[2];a.normal=b.normal=100;
    expect(castAbility(s,a,1)).toBe(true);expect(castAbility(s,b,1)).toBe(false);
    expect(b.normal).toBe(100);b.controller='a';expect(castAbility(s,b,1)).toBe(true);
  });
});

describe('cámara de acción',()=>{
  it.each([[1366,768],[1920,1080],[1024,768]])('mantiene balón visible fuera del HUD en %i × %i',(w,h)=>{
    const cam=new MatchCamera();
    for(const x of [-36,0,36])for(const z of [-22,0,22])for(const y of [.35,6]) {
      cam.reset();const view=cam.update({x,z,y},{x:-x,z:-z},w,h,1),m=camera(w,h,view);
      const px=(m[0]*x+m[4]*y+m[8]*z+m[12]+1)*.5*w;
      const py=(1-(m[1]*x+m[5]*y+m[9]*z+m[13]))*.5*h;
      expect(px).toBeGreaterThan(50);expect(px).toBeLessThan(w-210);
      expect(py).toBeGreaterThan(85);expect(py).toBeLessThan(h-130);
      expect(view.span).toBeGreaterThanOrEqual(44);expect(view.span).toBeLessThanOrEqual(52);
    }
  });
  it('suaviza independientemente del FPS y restablece al reanudar',()=>{
    const a=new MatchCamera(),b=new MatchCamera();
    a.update({x:0,z:0},undefined,1366,768,1);b.update({x:0,z:0},undefined,1366,768,1);
    for(let i=0;i<30;i++)a.update({x:10,z:0},undefined,1366,768,1/30);
    for(let i=0;i<60;i++)b.update({x:10,z:0},undefined,1366,768,1/60);
    expect(a.view.x).toBeCloseTo(b.view.x,6);expect(a.view.x).toBeLessThan(10);
    a.reset();a.update({x:-15,z:0},undefined,1366,768,0);expect(a.view.x).toBeCloseTo(-15);
  });
  it('prioriza la jugada lejana sin abrir hasta encuadrar toda la cancha',()=>{
    const cam=new MatchCamera(),view=cam.update({x:30,z:0},{x:-30,z:0},1366,768,1);
    expect(view.x).toBeGreaterThan(20);expect(view.span).toBe(44);
  });
});
