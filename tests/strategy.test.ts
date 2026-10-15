import { describe, expect, it } from 'vitest';
import { Game } from '../packages/game/src/engine.ts';
import { FIELD, inArea } from '../packages/game/src/geometry.ts';
import { POKEMON } from '../packages/game/src/catalog.ts';
import { attackDirection, controlled, emptyInput, moveFighter, movementSpeed, resetPositions, transfer } from '../packages/game/src/state.ts';
import { catchBall, passBall } from '../packages/game/src/ball.ts';
import { executeAbility } from '../packages/game/src/abilities.ts';
import { resolvePlayers, updateBall, updateKeepers } from '../packages/game/src/physics.ts';
import { automaticDistribution, distributeKeeper, safeKeeperTarget, updateKeeperPossession } from '../packages/game/src/keepers.ts';
import { botInput, DECISION_INTERVALS } from '../packages/game/src/ai.ts';
import { updateTactics } from '../packages/game/src/tactics.ts';
import { camera } from '../apps/client/src/gl.ts';
import type { Difficulty, InputFrame, Pace, Team } from '../packages/game/src/types.ts';

function setup(count=1, team:Team=0) {
  const g=new Game(984);
  for(let i=0;i<count;i++)g.addHuman('h'+i,'Humano '+i,team);
  g.state.phase='playing';
  for(const p of g.state.players){p.aiTimer=1000;p.aiX=0;p.aiZ=0;p.immunity=0;}
  return g;
}
let seq=0;
function input(g:Game,id:string,values:Partial<InputFrame>={}) {
  expect(g.input(id,{...emptyInput(controlled(g.state,id)!.epoch,++seq),...values})).toBe(true);g.step();
}
function capture(g:Game,team:Team=0) {
  const p=g.state.players.find(p=>p.team===team&&p.keeper)!;
  catchBall(g.state,p);return p;
}

describe('geometría, ajustes y predicción',()=>{
  it('valida anfitrión, fase y opciones; invalida listos y conserva la revancha',()=>{
    const g=new Game();g.addHuman('a','A',0);g.addHuman('b','B',1);
    expect(g.state.settings).toEqual({pace:'balanced',difficulty:'normal'});
    g.ready('a',true);g.ready('b',true);
    expect(()=>g.configure('b',{pace:'fast',difficulty:'hard'})).toThrow(/anfitrión/);
    expect(()=>g.configure('a',{pace:'turbo',difficulty:'hard'})).toThrow(/inválidos/);
    g.configure('a',{pace:'slow',difficulty:'easy'});
    expect(g.state.humans.every(h=>!h.ready)).toBe(true);
    g.state.phase='playing';expect(()=>g.configure('a',{pace:'fast',difficulty:'normal'})).toThrow(/lobby/);
    g.state.phase='finished';g.rematch('a');expect(g.state.settings).toEqual({pace:'slow',difficulty:'easy'});
  });
  it.each([['slow',.75],['balanced',.9],['fast',1.05]] as const)('escala carrera y sprint %s sin cambiar el desplazamiento especial',(pace,multiplier)=>{
    const g=setup(),p=controlled(g.state,'h0')!;
    const base=5.8+POKEMON[p.species].stats[0]*.42;
    const settings={pace,difficulty:'normal' as const};
    expect(movementSpeed(p,false,settings)).toBeCloseTo(base*multiplier);
    expect(movementSpeed(p,true,settings)).toBeCloseTo(base*1.45*multiplier);
    g.state.settings=settings;const predicted={...p},frame={...emptyInput(p.epoch,++seq),moveX:1};
    moveFighter(predicted,frame,1/30,settings);g.input('h0',frame);g.step();
    expect(p.x).toBeCloseTo(predicted.x);
    p.x=25;p.z=15;p.vx=10;p.vz=0;resolvePlayers(g.state,.1);expect(p.x).toBeGreaterThan(25.9);
  });
  it('no deja paredes interiores en física, rebotes ni teletransporte',()=>{
    const g=setup(),s=g.state,p=s.players[0];s.players.forEach(q=>{q.x=-20;q.z=-10;});
    p.x=24;p.z=14;p.vx=10;p.vz=10;resolvePlayers(s,.1);expect(p.x).toBeGreaterThan(24);expect(p.z).toBeGreaterThan(14);
    Object.assign(s.ball,{owner:null,x:24,z:15,y:2,vx:10,vz:4,vy:0});updateBall(s,.1);
    expect(s.ball.vx).toBeGreaterThan(0);expect(s.ball.vz).toBeGreaterThan(0);
    p.x=24;p.z=14;p.facingX=1;p.facingZ=0;executeAbility(s,p,POKEMON.gengar.abilities[0]);expect(p.x).toBeGreaterThan(24);
    Object.assign(s.ball,{owner:null,x:29.5,z:15,y:2,vx:10,vz:0});updateBall(s,.1);expect(s.ball.vx).toBeLessThan(0);
  });
  it.each([[1440,675],[1024,443],[390,400],[1920,330]])('encuadra cancha, arcos y etiquetas a %i × %i',(w,h)=>{
    const m=camera(w,h);
    for(const x of [-FIELD.halfWidth-2,FIELD.halfWidth+2])for(const z of [-FIELD.halfDepth,FIELD.halfDepth])for(const y of [0,3.5]) {
      expect(Math.abs(m[0]*x+m[4]*y+m[8]*z+m[12])).toBeLessThan(1);
      expect(Math.abs(m[1]*x+m[5]*y+m[9]*z+m[13])).toBeLessThan(1);
    }
  });
});

describe('adquisición de posesión y épocas',()=>{
  it.each(['robo','rebote','recepción'])('entrega un %s al humano más cercano sin tomar otro humano',kind=>{
    const g=setup(2),s=g.state,a=controlled(s,'h0')!,b=controlled(s,'h1')!,target=s.players[2];
    a.x=-20;a.z=0;b.x=0;b.z=0;target.x=1;target.z=0;
    s.ball.lastTeam=kind==='robo'?1:0;
    catchBall(s,target);expect(target.controller).toBe('h1');expect(a.controller).toBe('h0');
    catchBall(s,a);expect(a.controller).toBe('h0');expect(target.controller).toBe('h1');
  });
  it('prioriza al pasador y resuelve empates por id',()=>{
    const g=setup(2),s=g.state,a=controlled(s,'h0')!,b=controlled(s,'h1')!,q=s.players[2];
    a.x=-15;b.x=q.x;b.z=q.z;s.ball.owner=a.id;passBall(s,a);s.ball.passTarget=q.id;
    catchBall(s,q);expect(q.controller).toBe('h0');
    a.x=b.x=0;a.z=b.z=0;q.x=0;q.z=0;
    const target=s.players[3];catchBall(s,target);expect(target.controller).toBe('h0');
  });
  it('una intercepción no usa la prioridad del rival',()=>{
    const g=setup(),s=g.state;g.addHuman('r','Rival',1);
    const a=controlled(s,'h0')!,r=controlled(s,'r')!,target=s.players[6];
    s.ball.owner=a.id;passBall(s,a);s.ball.passTarget=target.id;catchBall(s,target);
    expect(target.controller).toBe('r');expect(a.controller).toBe('h0');expect(r.controller).toBe(null);
  });
  it('el cambio manual cancela la prioridad y un rebote posterior elige por proximidad',()=>{
    const g=setup(2),s=g.state,a=controlled(s,'h0')!,b=controlled(s,'h1')!,q=s.players[2];
    s.ball.owner=a.id;passBall(s,a);s.ball.passTarget=q.id;
    input(g,'h0',{switch:true});expect(s.ball.passSession).toBe(null);
    const receiver=s.players.find(p=>p.team===0&&!p.keeper&&!p.controller)!;
    b.x=receiver.x;b.z=receiver.z;const h=controlled(s,'h0')!;h.x=20;h.z=16;
    catchBall(s,receiver);expect(receiver.controller).toBe('h1');
  });
  it('rechaza entradas antiguas y exige soltar acciones después de una transferencia',()=>{
    const g=setup(),s=g.state,p=controlled(s,'h0')!,epoch=p.epoch,q=s.players[1];
    input(g,'h0',{shoot:true});catchBall(s,q);
    expect(g.input('h0',{...emptyInput(epoch,++seq),pass:true})).toBe(false);
    input(g,'h0',{shoot:true,pass:true,simple:true});expect(s.ball.owner).toBe(q.id);expect(q.charge).toBe(0);expect(q.simpleCd).toBe(0);
    input(g,'h0');input(g,'h0',{shoot:true});expect(q.charge).toBeGreaterThan(0);
  });
  it('el saque inicial asigna su portador bot sin quitar humanos',()=>{
    const g=setup(),s=g.state;transfer(s,s.humans[0],s.players[2]);resetPositions(s,0);
    expect(controlled(s,'h0')!.id).toBe(s.ball.owner);
  });
});

describe('saque temporal de Ditto',()=>{
  it('asigna por proximidad, retiene ocho segundos y deja correr reloj y compañeros',()=>{
    const g=setup(2),s=g.state,a=controlled(s,'h0')!,b=controlled(s,'h1')!;
    a.x=0;b.x=-25;b.z=0;const keeper=capture(g);expect(keeper.controller).toBe('h1');
    expect(s.keeperPossession?.previousFighterId).toBe(b.id);expect(s.keeperPossession?.remaining).toBe(8);
    const before=s.remaining,x=keeper.x,z=keeper.z;
    input(g,'h1');input(g,'h1',{moveX:1,moveZ:1,switch:true,simple:true,normal:true,special:true,item:true});
    expect(keeper.x).toBe(x);expect(keeper.z).toBe(z);expect(keeper.controller).toBe('h1');expect(keeper.simpleCd).toBe(0);
    expect(s.remaining).toBeLessThan(before);expect(s.keeperPossession?.targetId).toBeTruthy();
    input(g,'h0',{moveX:1});expect(a.x).toBeGreaterThan(0);
  });
  it('permite saque rápido, transfiere al bot al soltar y termina retirada y protección',()=>{
    const g=setup(),s=g.state,r=s.players[5];r.x=-27;r.z=0;
    const keeper=capture(g),hold=s.keeperPossession!;expect(hold.retreat[r.id]).toBeDefined();
    const target=s.players[1];distributeKeeper(s,keeper,'pass',target);
    expect(s.keeperPossession).toBe(null);expect(controlled(s,'h0')!.id).toBe(target.id);
    expect(s.ball.passTarget).toBe(target.id);expect(s.ball.owner).toBe(null);expect(r.x).toBe(-27);
    // A rival can contest the very next catch after release.
    catchBall(s,r);expect(s.ball.owner).toBe(r.id);
  });
  it('raso, elevado y despeje respetan destino y dirección',()=>{
    for(const action of ['pass','lob','clear'] as const){
      const g=setup(),s=g.state,keeper=capture(g);keeper.facingX=0;keeper.facingZ=1;
      distributeKeeper(s,keeper,action,s.players[1]);
      expect(s.ball.owner).toBe(null);expect(s.keeperPossession).toBe(null);
      if(action==='clear'){expect(s.ball.vx).toBe(0);expect(s.ball.vz).toBe(29);expect(s.ball.passTarget).toBe(null);}
      else {expect(s.ball.passTarget).toBe('0-1');expect(s.ball.vy).toBe(action==='pass'?.9:Math.max(6.8,s.ball.vy));}
    }
  });
  it('regresa al personaje previo al pasar a otro humano, o a uno libre si está ocupado',()=>{
    const g=setup(4),s=g.state,original=controlled(s,'h3')!;original.x=-27;original.z=0;
    const keeper=capture(g),recipient=controlled(s,'h0')!;
    distributeKeeper(s,keeper,'pass',recipient);expect(controlled(s,'h3')!.id).toBe(original.id);expect(recipient.controller).toBe('h0');
    capture(g);const human=s.humans.find(h=>h.id==='h0')!;transfer(s,human,original);
    distributeKeeper(s,keeper,'clear');expect(controlled(s,'h3')!.keeper).toBe(false);expect(original.controller).toBe('h0');
    expect(s.players.filter(p=>p.controller)).toHaveLength(4);
  });
  it('retira también humanos y bloquea reingreso a pie, con dash y teletransporte',()=>{
    const g=setup(),s=g.state;g.addHuman('r','R',1);const rival=controlled(s,'r')!;
    rival.x=-27;rival.z=0;capture(g);const x=rival.x;
    input(g,'r',{moveX:-1,shoot:true});expect(rival.x).toBeGreaterThan(x);
    for(let i=0;i<40;i++)input(g,'r',{moveX:-1});expect(inArea(rival,1,FIELD.playerRadius)).toBe(false);
    rival.x=-21;rival.z=0;rival.facingX=-1;rival.facingZ=0;
    executeAbility(s,rival,POKEMON.gengar.abilities[0]);expect(inArea(rival,1,FIELD.playerRadius)).toBe(false);
    executeAbility(s,rival,POKEMON.pikachu.abilities[0]);
    for(let i=0;i<10;i++)input(g,'r',{moveX:-1});expect(inArea(rival,1,FIELD.playerRadius)).toBe(false);
  });
  it('al vencer ocho segundos distribuye aunque el humano no responda',()=>{
    const g=setup(),s=g.state,keeper=capture(g);s.time+=7.99;updateKeeperPossession(s);expect(s.ball.owner).toBe(keeper.id);
    s.time+=.02;updateKeeperPossession(s);expect(s.keeperPossession).toBe(null);expect(controlled(s,'h0')!.keeper).toBe(false);
  });
  it('sin humano espera un segundo y la desconexión activa la misma salida',()=>{
    const g=setup(0),s=g.state,keeper=capture(g);s.time=.99;updateKeeperPossession(s);expect(s.ball.owner).toBe(keeper.id);
    s.time=1;updateKeeperPossession(s);expect(s.keeperPossession).toBe(null);
    const h=setup(),k=capture(h);h.disconnect(k.controller!);h.state.time+=1.01;updateKeeperPossession(h.state);
    expect(h.state.keeperPossession).toBe(null);expect(k.controller).toBe(null);expect(h.reconnect('h0')).toBe(true);expect(controlled(h.state,'h0')!.keeper).toBe(false);
  });
  it.each(['halftime','finished','reset'] as const)('cierra la posesión durante %s',phase=>{
    const g=setup(),s=g.state;capture(g);
    if(phase==='reset')resetPositions(s,1);
    else{s.half=phase==='finished'?2:1;s.score=[1,0];s.remaining=.001;g.step();expect(s.phase).toBe(phase);}
    expect(s.keeperPossession).toBe(null);expect(controlled(s,'h0')!.keeper).toBe(false);
    expect(s.players.filter(p=>p.keeper&&p.controller)).toHaveLength(0);
  });
  it('evita devolver al atacante de enfrente y despeja si bloquean todas las líneas',()=>{
    const g=setup(0),s=g.state,k=capture(g),mates=s.players.filter(p=>p.team===0&&!p.keeper),rivals=s.players.filter(p=>p.team===1&&!p.keeper);
    mates.forEach((p,i)=>{p.x=-15;p.z=(i-1.5)*5;});rivals.forEach((p,i)=>{p.x=-21.6;p.z=mates[i].z/2;});
    expect(safeKeeperTarget(s,k)).toBeUndefined();automaticDistribution(s,k);expect(s.ball.passer).toBe(null);expect(s.ball.vy).toBe(7);
    expect(s.keeperPossession).toBe(null);
  });
  it('el movimiento automático de atajada conserva su velocidad en todos los ritmos',()=>{
    const values=(['slow','balanced','fast'] as Pace[]).map(pace=>{const g=setup(0);g.state.settings.pace=pace;g.state.ball.z=12;const k=g.state.players[4];k.z=0;updateKeepers(g.state,.1);return k.z;});
    expect(new Set(values).size).toBe(1);expect(values[0]).toBeCloseTo(.42);
  });
});

describe('tácticas compartidas',()=>{
  it('mantiene cobertura, amplitud y opción adelantada alrededor del portador humano',()=>{
    const g=setup(),s=g.state,p=controlled(s,'h0')!;p.x=0;p.z=0;s.ball.x=0;s.ball.z=0;s.ball.owner=p.id;updateTactics(s);
    const t=s.tactics[0],targets=Object.entries(t.targets).filter(([id])=>id!==p.id).map(([,v])=>v);
    expect(Object.values(t.roles)).toContain('cover');expect(Object.values(t.roles)).toContain('forward');
    expect(targets.some(q=>q.x<-5)).toBe(true);expect(targets.some(q=>q.x>5)).toBe(true);expect(targets.some(q=>Math.abs(q.z)>10)).toBe(true);
    expect(targets.every(q=>Math.hypot(q.x-p.x,q.z-p.z)>=6)).toBe(true);
    const before=structuredClone(t);s.players.forEach(p=>{if(!p.keeper)p.species='pikachu';});updateTactics(s);expect(s.tactics[0]).toEqual(before);
  });
  it('un portador bajo presión pasa por una línea libre antes de avanzar contra el arquero',()=>{
    const g=setup(0),s=g.state,p=s.players[0],q=s.players[1];
    s.players.forEach((r,i)=>{if(!r.keeper){r.x=-20;r.z=15-i;}});
    p.x=12;p.z=0;p.facingX=1;p.facingZ=0;p.aiTimer=0;
    q.x=16;q.z=12;s.players[5].x=14;s.players[5].z=0;
    s.ball.owner=p.id;s.ball.x=p.x;s.ball.z=p.z;updateTactics(s);
    const frame=botInput(s,p,.01);expect(frame.pass).toBe(true);expect(frame.shoot).toBe(false);expect(frame.moveZ).toBeGreaterThan(0);
    moveFighter(p,frame,1/30,s.settings);passBall(s,p);expect(s.ball.passTarget).toBe(q.id);
  });
  it('conserva un solo presionante aunque otro bot quede apenas más cerca',()=>{
    const g=setup(0),s=g.state;s.ball.owner='1-0';s.ball.x=0;s.ball.z=0;
    s.players[0].x=-4;s.players[0].z=0;s.players[1].x=-5;s.players[1].z=0;updateTactics(s);
    const first=s.tactics[0].presser;s.players[1].x=-3.9;updateTactics(s);
    expect(s.tactics[0].presser).toBe(first);expect(Object.values(s.tactics[0].roles).filter(r=>r==='press')).toHaveLength(1);
  });
  it('no sigue al rival invisible ni usa su posición para escoger una línea',()=>{
    const g=setup(0),s=g.state,r=s.players[5];s.ball.owner=r.id;s.ball.x=r.x=0;s.ball.z=r.z=0;updateTactics(s);r.cloak=3;
    const a=structuredClone(s),b=structuredClone(s);a.players[5].x=a.ball.x=-20;b.players[5].x=b.ball.x=20;
    updateTactics(a);updateTactics(b);expect(a.tactics[0]).toEqual(b.tactics[0]);
    a.players[0].aiTimer=b.players[0].aiTimer=0;expect(botInput(a,a.players[0],.01)).toEqual(botInput(b,b.players[0],.01));
  });
  it('asigna como máximo un recolector y conserva al defensor',()=>{
    const g=setup(0),s=g.state;s.ball.owner='0-0';s.ball.x=0;s.ball.z=0;updateTactics(s);
    const t=s.tactics[0];s.pickups=s.players.filter(p=>p.team===0&&!p.keeper).map((p,i)=>({id:i,x:p.x,z:p.z,kind:'orb',life:20}));updateTactics(s);
    expect(t.collector).not.toBe(null);expect(t.roles[t.collector!]).not.toBe('cover');expect(t.roles[t.collector!]).not.toBe('press');
  });
  it('las posiciones tácticas reflejan el cambio de arco',()=>{
    const g=setup(0),a=g.state;a.ball.owner='0-0';a.ball.x=a.players[0].x;a.ball.z=a.players[0].z;updateTactics(a);
    const b=structuredClone(a);b.half=2;b.players.forEach(p=>{p.x=-p.x;p.facingX=-p.facingX;});b.ball.x=-b.ball.x;updateTactics(b);
    for(const p of a.players.filter(p=>p.team===0&&!p.keeper)){expect(b.tactics[0].targets[p.id].x).toBeCloseTo(-a.tactics[0].targets[p.id].x);expect(b.tactics[0].targets[p.id].z).toBeCloseTo(a.tactics[0].targets[p.id].z);}
  });
  it.each(['easy','normal','hard'] as Difficulty[])('aplica intervalos %s a ambos equipos y mantiene determinismo',difficulty=>{
    const g=setup(0),s=g.state;s.settings.difficulty=difficulty;updateTactics(s);
    for(const p of s.players.filter(p=>!p.keeper)){p.aiTimer=0;botInput(s,p,.001);expect(p.aiTimer).toBeGreaterThanOrEqual(DECISION_INTERVALS[difficulty][0]);expect(p.aiTimer).toBeLessThanOrEqual(DECISION_INTERVALS[difficulty][1]);}
    const a=new Game(56,12,3),b=new Game(56,12,3);a.state.settings.difficulty=b.state.settings.difficulty=difficulty;a.state.phase=b.state.phase='playing';
    for(let i=0;i<1600;i++){a.step();b.step();}expect(a.state).toEqual(b.state);expect(a.state.phase).toBe('finished');
  });
});
