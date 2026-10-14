import { describe,it,expect } from 'vitest';
import { Game } from '../packages/game/src/engine.ts';
import { controlled, emptyInput } from '../packages/game/src/state.ts';
import { executeAbility, updateEffects } from '../packages/game/src/abilities.ts';
import { updateBall } from '../packages/game/src/physics.ts';
import { POKEMON } from '../packages/game/src/catalog.ts';
function setup() {
  const game=new Game();game.addHuman('a','Ana',0);game.ready('a',true);game.start('a');
  for(let i=0;i<91;i++)game.step();return game;
}
describe('regresiones de control y efectos',()=>{
  it('acepta una secuencia nueva tras recargar y reconectar',()=>{
    const game=setup(),p=controlled(game.state,'a')!;
    game.input('a',emptyInput(p.epoch,9000));game.step();expect(game.acks.get('a')).toBe(9000);
    const oldEpoch=p.epoch;game.disconnect('a');game.reconnect('a');
    expect(game.input('a',emptyInput(oldEpoch,9001))).toBe(false);
    const next=controlled(game.state,'a')!;expect(game.input('a',emptyInput(next.epoch,1))).toBe(true);
    game.step();expect(game.acks.get('a')).toBe(1);
  });
  it('la revancha conserva reservas de reconexión y renueva épocas',()=>{
    const game=setup();game.addHuman('b','Bruno',1);const epoch=controlled(game.state,'a')!.epoch;
    game.disconnect('b');game.state.phase='finished';game.rematch('a');
    expect(game.state.humans.find(h=>h.id==='b')?.connected).toBe(false);
    expect(game.reconnect('b')).toBe(true);
    expect(controlled(game.state,'a')!.epoch).not.toBe(epoch);
    expect(game.input('a',emptyInput(epoch,100))).toBe(false);
  });
  it('una pared lejana no rebota la pelota, una pared cercana sí',()=>{
    const game=setup(),s=game.state,p=s.players[0];s.players.forEach(q=>q.z=12);
    p.x=7;p.z=0;p.facingX=1;p.facingZ=0;
    executeAbility(s,p,POKEMON.lapras.abilities[1]);expect(s.effects[0].x).toBe(10);p.z=12;
    Object.assign(s.ball,{owner:null,x:0,z:0,y:.5,vx:12,vz:0,vy:0});
    updateBall(s,1/30);expect(s.ball.vx).toBeGreaterThan(0);
    s.ball.x=7;s.ball.vx=12;updateBall(s,1/30);expect(s.ball.vx).toBeLessThan(0);
  });
  it('las zonas de ralentización no desarman ni interrumpen',()=>{
    const game=setup(),s=game.state,p=s.players[0],rival=s.players[5];
    s.players.forEach(q=>q.z=12);Object.assign(p,{x:0,z:0,facingX:1,facingZ:0});
    Object.assign(rival,{x:4,z:0,cast:.7,castSlot:2,immunity:0});
    s.ball.owner=rival.id;executeAbility(s,p,POKEMON.venusaur.abilities[1]);updateEffects(s,1/60);
    expect(rival.slow).toBe(.35);expect(rival.stun).toBe(0);expect(rival.cast).toBe(.7);
    expect(s.ball.owner).toBe(rival.id);expect(rival.vx).toBe(0);
  });
  it('el proyectil golpea al primer rival en su trayectoria y se consume',()=>{
    const game=setup(),s=game.state,p=s.players[0],far=s.players[5],near=s.players[6];
    s.players.forEach(q=>q.z=12);Object.assign(p,{x:0,z:0,facingX:1,facingZ:0});
    Object.assign(far,{x:3,z:0,immunity:0});Object.assign(near,{x:2,z:0,immunity:0});
    executeAbility(s,p,POKEMON.lucario.abilities[2]);updateEffects(s,1/60);
    expect(near.stun).toBe(.8);expect(far.stun).toBe(0);
    expect(s.effects.filter(e=>e.kind==='projectile')).toHaveLength(0);
  });
  it('un escudo también bloquea la ralentización del proyectil',()=>{
    const game=setup(),s=game.state,p=s.players[0],rival=s.players[5];
    s.players.forEach(q=>q.z=12);Object.assign(p,{x:0,z:0,facingX:1,facingZ:0});
    Object.assign(rival,{x:2,z:0,immunity:0,shield:4});
    executeAbility(s,p,POKEMON.greninja.abilities[0]);updateEffects(s,1/60);
    expect(rival.shield).toBe(0);expect(rival.slow).toBe(0);expect(rival.stun).toBe(0);
  });
});
