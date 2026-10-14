import { describe,it,expect } from 'vitest';
import { Game, emptyInput, controlled, transfer, sanitizeInput, attackDirection, ROSTER, POKEMON } from '../packages/game/src/index.ts';
import { castAbility, updateEffects } from '../packages/game/src/abilities.ts';
import { catchBall, hit, passBall, shootBall } from '../packages/game/src/ball.ts';
import { scoreGoal, updateBall, updatePickups } from '../packages/game/src/physics.ts';
import { applyPatch, makePatch, wireState } from '../packages/game/src/protocol.ts';
import type { Team } from '../packages/game/src/types.ts';
function playing() {
  const game=new Game(321);game.addHuman('a','Ana',0);game.ready('a',true);game.start('a');
  for(let n=0;n<91;n++)game.step();return game;
}
function ticks(game:Game,count:number){for(let n=0;n<count;n++)game.step();}
describe('equipos y control compartido',()=>{
  it.each(Array.from({length:25},(_,i)=>[Math.floor(i/5),i%5]).filter(([a,b])=>a+b>0))('acepta %i contra %i humanos con diez personajes',(a,b)=>{
    const game=new Game();
    for(let n=0;n<a;n++)game.addHuman('a'+n,'A',0);
    for(let n=0;n<b;n++)game.addHuman('b'+n,'B',1);
    expect(game.state.players).toHaveLength(10);
    expect(game.state.players.filter(p=>p.controller)).toHaveLength(a+b);
    expect(game.state.players.filter(p=>p.keeper&&p.controller)).toHaveLength(0);
    if(a===4)expect(()=>game.addHuman('extra','X',0)).toThrow();
  });
  it('solo el capitán edita bots, sin duplicados ni acceso al arquero',()=>{
    const game=new Game();game.addHuman('a','Ana',0);game.addHuman('b','Bruno',0);
    expect(()=>game.choose('b',2,'lapras')).toThrow();
    game.choose('a',2,'lapras');expect(game.state.players[2].species).toBe('lapras');
    expect(()=>game.choose('a',3,'lapras')).toThrow();
    expect(()=>game.choose('a',1,'lapras')).toThrow();
    expect(()=>game.choose('a',4,'pikachu')).toThrow();
  });
  it('no roba control a otro humano ni transfiere recursos',()=>{
    const game=new Game();const a=game.addHuman('a','A',0),b=game.addHuman('b','B',0);
    const target=game.state.players[2];target.normal=75;target.special=100;target.item='shield';
    expect(transfer(game.state,a,controlled(game.state,b.id)!)).toBe(false);
    expect(transfer(game.state,a,target)).toBe(true);
    expect(controlled(game.state,'a')?.id).toBe(target.id);
    expect(target.normal).toBe(75);expect(target.special).toBe(100);expect(target.item).toBe('shield');
    expect(game.state.players.filter(p=>p.controller==='a')).toHaveLength(1);
  });
  it('cambia al receptor bot al completar el pase, sin quitar un receptor humano',()=>{
    const game=playing(),s=game.state,p=controlled(s,'a')!,target=s.players[1];
    s.ball.owner=p.id;p.facingX=target.x-p.x;p.facingZ=target.z-p.z;
    passBall(s,p);s.ball.passTarget=target.id;catchBall(s,target);
    expect(controlled(s,'a')?.id).toBe(target.id);expect(p.normal).toBe(25);
    const mate=game.addHuman('b','B',0),receiver=controlled(s,mate.id)!;
    target.actionCd=0;s.ball.owner=target.id;passBall(s,target);s.ball.passTarget=receiver.id;catchBall(s,receiver);
    expect(controlled(s,'a')?.id).toBe(target.id);expect(receiver.controller).toBe('b');
  });
  it('resuelve un destino solicitado por dos humanos una sola vez',()=>{
    const game=new Game(),a=game.addHuman('a','A',0),b=game.addHuman('b','B',0),target=game.state.players[2];
    expect(transfer(game.state,a,target)).toBe(true);expect(transfer(game.state,b,target)).toBe(false);
  });
  it('descarta entradas de una época de control anterior',()=>{
    const game=playing(),h=game.state.humans[0],p=controlled(game.state,'a')!;
    const input={...emptyInput(p.epoch,1),moveX:1};
    transfer(game.state,h,game.state.players[1]);
    expect(game.input('a',input)).toBe(false);
  });
  it('la desconexión entrega el control a la IA y la reconexión respeta a otros humanos',()=>{
    const game=playing();game.addHuman('b','B',0);const original=controlled(game.state,'a')!;
    original.special=100;game.disconnect('a');
    expect(original.controller).toBe(null);
    transfer(game.state,game.state.humans.find(h=>h.id==='b')!,original);
    expect(game.reconnect('a')).toBe(true);
    expect(original.controller).toBe('b');expect(original.special).toBe(100);
    expect(controlled(game.state,'a')).toBeDefined();
  });
  it('transfiere el anfitrión y permite entrar tarde',()=>{
    const game=playing();game.addHuman('b','B',1);game.disconnect('a');
    expect(game.state.host).toBe('b');
    const p=game.state.players.find(p=>p.team===1&&!p.keeper&&!p.controller)!;p.normal=75;
    game.addHuman('c','C',1);expect(controlled(game.state,'c')?.normal).toBe(75);
  });
});
describe('partido y pelota',()=>{
  it('requiere listos y anfitrión para iniciar',()=>{
    const game=new Game();game.addHuman('a','A',0);game.addHuman('b','B',1);
    expect(()=>game.start('b')).toThrow();expect(()=>game.start('a')).toThrow();
    game.ready('a',true);game.ready('b',true);game.start('a');expect(game.state.phase).toBe('kickoff');
  });
  it('termina dos tiempos y gol de oro sin depender del reloj de pared',()=>{
    const game=new Game(1,.1,.1);game.addHuman('a','A',0);game.ready('a',true);game.start('a');
    ticks(game,700);expect(game.state.phase).toBe('finished');expect(game.state.winner).toBe(null);expect(game.state.half).toBe(3);
  });
  it('el primer gol de la prórroga termina el partido y vale uno',()=>{
    const game=playing();game.state.half=3;game.state.phase='overtime';
    scoreGoal(game.state,1);expect(game.state.score).toEqual([1,0]);expect(game.state.phase).toBe('finished');expect(game.state.winner).toBe(0);
  });
  it('invierte los arcos en el segundo tiempo',()=>{
    const game=playing();game.state.half=2;expect(attackDirection(game.state,0)).toBe(-1);
    scoreGoal(game.state,-1);expect(game.state.score[0]).toBe(1);
  });
  it('pausa reloj y conserva cargas después del gol',()=>{
    const game=playing();const p=game.state.players[1];p.special=100;p.normal=75;
    scoreGoal(game.state,1);const time=game.state.remaining;game.step();
    expect(game.state.remaining).toBe(time);expect(p.special).toBe(100);expect(p.normal).toBe(75);
  });
  it('detecta un tiro rápido que atraviesa la línea sin duplicar goles',()=>{
    const game=playing(),s=game.state;s.players.forEach(p=>p.z=10);
    Object.assign(s.ball,{owner:null,x:23,z:0,y:1,vx:100,vz:0,vy:0,lastTouch:'0-0',lastTeam:0,pickupLock:1});
    updateBall(s,1/30);expect(s.score).toEqual([1,0]);game.step();expect(s.score).toEqual([1,0]);
  });
  it('rebota fuera del arco y por encima del travesaño',()=>{
    const game=playing(),s=game.state;s.players.forEach(p=>p.z=-10);
    Object.assign(s.ball,{owner:null,x:23,z:7,y:.4,vx:100,vz:0,vy:0});updateBall(s,1/30);
    expect(s.ball.vx).toBeLessThan(0);expect(s.score).toEqual([0,0]);
    Object.assign(s.ball,{owner:null,x:23,z:0,y:5,vx:100,vz:0,vy:0});updateBall(s,1/30);
    expect(s.ball.vx).toBeLessThan(0);expect(s.score).toEqual([0,0]);
  });
  it('los arqueros atajan automáticamente sin recibir aturdimiento',()=>{
    const game=playing(),s=game.state,keeper=s.players.find(p=>p.id==='1-4')!;
    keeper.x=22;keeper.z=0;keeper.aiTimer=0;
    Object.assign(s.ball,{owner:null,x:20,z:0,y:1,vx:80,vz:0,vy:0,lastTouch:'0-0',lastTeam:0,shot:true,pickupLock:0});
    updateBall(s,1/30);expect(s.ball.owner).toBe(keeper.id);
    expect(hit(s,keeper,1,0,20,.8)).toBe(false);expect(keeper.stun).toBe(0);
  });
  it('permite esquivar con la pelota',()=>{
    const game=playing(),p=controlled(game.state,'a')!;game.state.ball.owner=p.id;p.stamina=100;
    game.input('a',{...emptyInput(p.epoch,1),dodge:true});game.step();
    expect(game.state.ball.owner).toBe(p.id);expect(p.stamina).toBeLessThan(100);
  });
  it('revancha vuelve a selección, con marcador y cargas nuevos',()=>{
    const game=playing();game.state.phase='finished';game.state.score=[3,2];game.state.players[0].special=100;
    game.rematch('a');expect(game.state.phase).toBe('lobby');expect(game.state.score).toEqual([0,0]);expect(game.state.players[0].special).toBe(0);
    expect(game.state.humans[0].ready).toBe(false);
  });
});
describe('poderes y límites',()=>{
  it('tiene doce personajes con treinta y seis habilidades ejecutables',()=>{
    expect(ROSTER).toHaveLength(12);
    for(const species of ROSTER)for(let slot=0;slot<3;slot++) {
      const game=playing(),p=controlled(game.state,'a')!;p.species=species.id;p.normal=100;p.special=100;p.simpleCd=0;p.actionCd=0;p.immunity=0;
      const ability=species.abilities[slot];
      if(ability.kind==='shot')game.state.ball.owner=p.id;
      else {game.state.ball.owner=null;game.state.ball.x=p.x+1;game.state.ball.z=p.z;}
      expect(castAbility(game.state,p,slot),species.name+' '+ability.name).toBe(true);
      if(slot===0)expect(p.simpleCd).toBe(6);
      if(slot===1)expect(p.normal).toBe(0);
      if(slot===2)expect(p.special).toBe(0);
      ticks(game,30);expect(Number.isFinite(game.state.ball.x)).toBe(true);
    }
  });
  it('rechaza habilidades sin sus condiciones y no cobra recursos',()=>{
    const game=playing(),p=controlled(game.state,'a')!;p.species='charizard';p.special=100;game.state.ball.owner=null;
    expect(castAbility(game.state,p,2)).toBe(false);expect(p.special).toBe(100);
    p.species='gengar';game.state.ball.owner=p.id;
    expect(castAbility(game.state,p,0)).toBe(false);expect(p.simpleCd).toBe(0);
  });
  it('interrumpir un especial consume carga y cancela el efecto',()=>{
    const game=playing(),p=controlled(game.state,'a')!;p.special=100;p.immunity=0;
    castAbility(game.state,p,2);expect(p.cast).toBeGreaterThan(0);
    hit(game.state,p,-1,0,5,.5);expect(p.cast).toBe(0);expect(p.special).toBe(0);
  });
  it('impide encadenar aturdimientos y limita ralentizaciones',()=>{
    const game=playing(),p=controlled(game.state,'a')!;p.immunity=0;
    hit(game.state,p,1,0,5,10,1);expect(p.stun).toBe(.8);expect(p.slow).toBe(.4);
    expect(hit(game.state,p,1,0,5,.8)).toBe(false);
    ticks(game,25);expect(p.stun).toBe(0);expect(p.immunity).toBeGreaterThan(0);
  });
  it('el escudo absorbe un solo impacto',()=>{
    const game=playing(),p=controlled(game.state,'a')!;p.immunity=0;p.shield=4;
    expect(hit(game.state,p,1,0,6,.5)).toBe(false);expect(p.shield).toBe(0);expect(p.stun).toBe(0);
  });
  it('solo el receptor del orbe obtiene carga y no puede acumular otro',()=>{
    const game=playing(),p=controlled(game.state,'a')!;game.state.pickups=[{id:999,x:p.x,z:p.z,kind:'orb',life:20}];
    updatePickups(game.state,.03);expect(p.special).toBe(100);
    expect(game.state.players.filter(q=>q.special>0)).toHaveLength(1);
    game.state.pickups=[{id:1000,x:p.x,z:p.z,kind:'orb',life:20}];updatePickups(game.state,.03);
    expect(game.state.pickups).toHaveLength(1);
  });
  it('limita la carga por pases durante una misma posesión',()=>{
    const game=playing(),s=game.state,p=s.players[0],q=s.players[1];p.normal=0;
    for(let n=0;n<8;n++){s.ball.owner=p.id;p.actionCd=0;passBall(s,p);catchBall(s,q);}
    expect(p.normal).toBe(50);
  });
  it('crea objetos en posiciones simétricas sin consultar el marcador',()=>{
    const game=playing();game.state.score=[9,0];game.state.itemTimer=0;updatePickups(game.state,.03);
    const items=game.state.pickups.filter(p=>p.kind!=='orb');
    expect(items.map(p=>p.z)).toEqual([-10,10]);expect(items.every(p=>p.x===0)).toBe(true);
  });
});
describe('simulación y protocolo',()=>{
  it('normaliza entradas no finitas y diagonales',()=>{
    const input=sanitizeInput({...emptyInput(1,1),moveX:100,moveZ:100})!;
    expect(Math.hypot(input.moveX,input.moveZ)).toBeCloseTo(1);
    expect(sanitizeInput({...emptyInput(1,2),moveX:NaN})!.moveX).toBe(0);
    expect(sanitizeInput({seq:-1,epoch:0})).toBe(null);
  });
  it('reconstruye exactamente el estado tras aplicar un parche',()=>{
    const game=playing(),before=wireState(game.state);ticks(game,3);const after=wireState(game.state);
    expect(applyPatch(before,makePatch(before,after))).toEqual(after);
  });
  it('es reproducible y los bots generan jugadas y goles en una simulación larga',()=>{
    const a=new Game(76),b=new Game(76);a.state.phase='playing';b.state.phase='playing';
    for(let i=0;i<21000;i++){a.step();b.step();}
    expect(a.state).toEqual(b.state);expect(a.state.score[0]+a.state.score[1]).toBeGreaterThan(0);
    for(const p of a.state.players){expect(Number.isFinite(p.x)).toBe(true);expect(Math.abs(p.x)).toBeLessThan(24);expect(Math.abs(p.z)).toBeLessThan(14);}
  });
});
