import { describe, expect, it } from 'vitest';
import { Game } from '../packages/game/src/engine.ts';
import { botInput, passInterception } from '../packages/game/src/ai.ts';
import { passBall, catchBall } from '../packages/game/src/ball.ts';
import { POKEMON, ROSTER } from '../packages/game/src/catalog.ts';
import { executeAbility, updateEffects } from '../packages/game/src/abilities.ts';
import { updateBall, updatePickups, pickupPosition } from '../packages/game/src/physics.ts';
import { emptyInput, moveFighter } from '../packages/game/src/state.ts';
import { distributeKeeper } from '../packages/game/src/keepers.ts';
import { automaticLineup } from '../packages/game/src/team-plan.ts';
import { FIELD, inArea } from '../packages/game/src/geometry.ts';
import { applyPatch, makePatch, wireState } from '../packages/game/src/protocol.ts';

function fixture() {
  const g=new Game(512);g.addHuman('a','A',0);g.state.phase='playing';
  g.state.players.forEach((p,i)=>{p.x=-25+i*5;p.z=18;p.immunity=0;p.aiTimer=1000;});
  return g;
}
describe('directed pass reception',()=>{
  it.each([false,true])('interrupts old movement and receives a lob=%s',lob=>{
    const g=fixture(),s=g.state,p=s.players[0],q=s.players[1];
    Object.assign(p,{x:-8,z:0,facingX:1,facingZ:0});Object.assign(q,{x:7,z:0,aiX:0,aiZ:1,aiShoot:true});
    s.ball.owner=p.id;passBall(s,p,lob,q);q.aiTimer=1000;
    const target=passInterception(s,q)!;expect(target).toBeTruthy();
    const input=botInput(s,q,1/60);expect(input.moveZ).toBe(0);expect(input.shoot).toBe(false);
    for(let i=0;i<300&&!s.ball.owner;i++) {
      moveFighter(q,botInput(s,q,1/60),1/60,s.settings);updateBall(s,1/60);
    }
    expect(s.ball.owner).toBe(q.id);expect(q.controller).toBe('a');expect(s.ball.passTarget).toBeNull();
  });
  it('keeps the keeper passer on the previous fighter until the bot receives',()=>{
    const g=fixture(),s=g.state,p=s.players[0],q=s.players[1],keeper=s.players[4];
    catchBall(s,keeper);distributeKeeper(s,keeper,'pass',q);
    expect(p.controller).toBe('a');expect(q.controller).toBeNull();expect(s.ball.passSession).toBe('a');
    catchBall(s,q);expect(q.controller).toBe('a');expect(p.controller).toBeNull();
  });
  it('cancels on interception and preserves a human receiver',()=>{
    const g=fixture(),s=g.state,p=s.players[0],q=s.players[1];
    s.ball.owner=p.id;passBall(s,p,false,q);catchBall(s,s.players[5]);
    expect(s.ball.passTarget).toBeNull();expect(passInterception(s,q)).toBeNull();expect(p.controller).toBe('a');
    g.addHuman('b','B',0);p.actionCd=0;s.ball.owner=p.id;passBall(s,p,false,q);catchBall(s,q);
    expect(q.controller).toBe('b');expect(p.controller).toBe('a');
  });
});
describe('autonomous team and pickups',()=>{
  it('rejects opponent changes and draws repeatable plans every start',()=>{
    const plans=new Set();
    for(let seed=1;seed<=20;seed++) {
      const g=new Game(seed*17531);g.addHuman('a','A',0);
      expect(()=>g.configureTeam('a',1,'2-2','balanced')).toThrow();expect(()=>g.setLineup('a',1,'auto')).toThrow();
      g.ready('a',true);g.start('a');const plan=structuredClone(g.state.teamPlans[1]);plans.add(plan.formation+plan.style);
      expect(plan.lineup).toEqual(automaticLineup(g.state.players.filter(p=>p.team===1&&!p.keeper),plan.formation));
      g.step();expect(g.state.teamPlans[1]).toEqual(plan);
      const seedBefore=g.state.seed;g.state.phase='finished';g.rematch('a');g.ready('a',true);g.start('a');
      expect(g.state.seed).not.toBe(seedBefore);
    }
    expect(plans.size).toBeGreaterThan(3);
  });
  it('samples reproducibly across all four quadrants, outside areas and overlaps',()=>{
    const quadrants=new Set();
    for(let seed=0;seed<100;seed++) {
      const a=new Game(seed).state,b=structuredClone(a);a.orbTimer=b.orbTimer=0;a.itemTimer=b.itemTimer=0;
      updatePickups(a,0);updatePickups(b,0);expect(a.pickups).toEqual(b.pickups);expect(a.pickups).toHaveLength(3);
      for(const p of a.pickups) {
        quadrants.add(Math.sign(p.x)+','+Math.sign(p.z));expect(inArea(p,1,1.3)||inArea(p,-1,1.3)).toBe(false);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(FIELD.halfWidth-2);expect(Math.abs(p.z)).toBeLessThanOrEqual(FIELD.halfDepth-2);
        expect(a.players.every(q=>Math.hypot(p.x-q.x,p.z-q.z)>=2)).toBe(true);
        expect(a.pickups.every(q=>q===p||Math.hypot(p.x-q.x,p.z-q.z)>=2.6)).toBe(true);
      }
    }
    expect(quadrants.size).toBe(4);
  });
  it('defers bounded sampling when the field is occupied',()=>{
    const s=new Game().state;
    for(let x=-34;x<=34;x+=2)for(let z=-20;z<=20;z+=2)s.pickups.push({id:s.nextId++,kind:'berry',x,z,life:20});
    expect(pickupPosition(s)).toBeNull();s.orbTimer=0;updatePickups(s,0);expect(s.orbTimer).toBe(.5);
  });
});
describe('confusion and visual contracts',()=>{
  it('turns both human and bot movement by exactly 30 degrees without forcing idle movement',()=>{
    const g=fixture(),s=g.state,p=s.players[0],q=s.players[5];
    Object.assign(p,{x:0,z:0,facingX:1,facingZ:0});Object.assign(q,{x:5,z:0});
    executeAbility(s,p,POKEMON.gengar.abilities[2]);updateEffects(s,0);
    expect(q.confusion).toBe(.8);expect(q.confusionGuard).toBe(2);expect(q.noSprint).toBe(0);expect(q.slow).toBe(.15);
    const human={...q,controller:'human'},bot={...q,controller:null};
    const frame={...emptyInput(),moveX:1};moveFighter(human,frame,.1,s.settings);moveFighter(bot,frame,.1,s.settings);
    expect(human.x).toBe(bot.x);expect(human.z).toBe(bot.z);expect(Math.abs((bot.z-q.z)/(bot.x-q.x))).toBeCloseTo(Math.tan(Math.PI/6));
    const idle={...q};moveFighter(idle,emptyInput(),.1,s.settings);expect(idle.x).toBe(q.x);expect(idle.z).toBe(q.z);
    q.confusion=0;q.confusionGuard=0;updateEffects(s,0);expect(q.confusion).toBe(0);
    executeAbility(s,p,POKEMON.gengar.abilities[2]);updateEffects(s,0);expect(q.confusion).toBe(.8);
    for(let i=0;i<25;i++)g.step();expect(q.confusion).toBe(0);expect(q.confusionGuard).toBeGreaterThan(1.1);
  });
  it('keeps status visuals synchronized with frozen buffs across a goal restart',()=>{
    const g=fixture(),s=g.state,p=s.players[0];
    executeAbility(s,p,POKEMON.blastoise.abilities[1]);
    s.phase='goal';s.phaseTime=3;
    for(let i=0;i<3;i++)g.step(1);
    expect(p.shield).toBe(5);expect(p.statuses['blastoise-normal']).toBe(5);
    g.step();expect(p.statuses['blastoise-normal']).toBeCloseTo(p.shield);
  });
  it('protects against a second field during recovery and excludes keepers',()=>{
    const s=fixture().state,p=s.players[0],q=s.players[5],keeper=s.players[9];
    Object.assign(p,{x:0,z:0,facingX:1,facingZ:0});Object.assign(q,{x:5,z:0});Object.assign(keeper,{x:5,z:0});
    executeAbility(s,p,POKEMON.gengar.abilities[2]);updateEffects(s,0);
    q.confusion=0;q.confusionGuard=1.2;
    executeAbility(s,p,POKEMON.gengar.abilities[2]);updateEffects(s,0);
    expect(q.confusion).toBe(0);expect(keeper.confusion).toBe(0);
  });
  it('reflection changes allegiance without changing the visual identity',()=>{
    const s=fixture().state,p=s.players[0],r=s.players[5];
    Object.assign(p,{x:0,z:0,species:'alakazam',facingX:1,facingZ:0});Object.assign(r,{x:3,z:0,facingX:1,facingZ:0});
    executeAbility(s,p,POKEMON.alakazam.abilities[1]);executeAbility(s,r,POKEMON.lucario.abilities[2]);
    r.x=20;r.z=12;p.x=-20;p.z=12;
    updateEffects(s,0);
    const projectile=s.effects.find(e=>e.kind==='projectile')!;
    expect(projectile.abilityId).toBe('lucario-special');expect(projectile.team).toBe(0);expect(projectile.owner).toBe(p.id);expect(projectile.vx).toBeLessThan(0);
  });
  it('has 36 unique identities, including instant abilities, and carries them over patches',()=>{
    expect(new Set(ROSTER.flatMap(p=>p.abilities.map(a=>a.id))).size).toBe(36);
    for(const pokemon of ROSTER)for(const ability of pokemon.abilities) {
      const s=fixture().state,p=s.players[0];p.species=pokemon.id;s.ball.owner=p.id;
      const before=wireState(s);executeAbility(s,p,ability);const after=wireState(s);
      expect(s.events.at(-1)?.abilityId??s.events.find(e=>e.kind==='ability')?.abilityId).toBe(ability.id);
      expect(s.effects.some(e=>e.abilityId===ability.id)).toBe(true);
      expect(applyPatch(before,makePatch(before,after))).toEqual(after);
    }
  });
});
