import { test, expect } from '@playwright/test';
import { createGameServer } from '../../apps/server/src/server.ts';
import { catchBall } from '../../packages/game/src/ball.ts';
import { controlled } from '../../packages/game/src/state.ts';

test('ajustes del worker invalidan listos y los presets persisten',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:/Cómo jugar/}).click();
  await page.getByRole('button',{name:'WASD + J/K/L',exact:true}).click();
  await page.getByRole('button',{name:'Cerrar',exact:true}).click();await page.reload();
  await page.getByRole('button',{name:/Cómo jugar/}).click();
  await expect(page.locator('[data-bind="up"] kbd')).toHaveText('W');
  await page.getByRole('button',{name:'Flechas + A/S/D',exact:true}).click();
  await expect(page.locator('[data-bind="up"] kbd')).toHaveText('↑');
  await expect(page.locator('[data-bind="shoot"] kbd')).toHaveText('S');
  await page.getByRole('button',{name:'Cerrar',exact:true}).click();await page.reload();
  await page.getByRole('button',{name:/Jugar ahora/}).click();
  await expect(page.locator('#pace-setting')).toHaveValue('balanced');
  await expect(page.locator('#difficulty-setting')).toHaveValue('normal');
  await page.getByRole('button',{name:/Estoy listo/}).click();
  await expect(page.locator('#start-match')).toBeEnabled();
  await page.locator('#pace-setting').selectOption('slow');
  await expect(page.locator('#start-match')).toBeDisabled();
  await page.locator('#difficulty-setting').selectOption('easy');
  await page.getByRole('button',{name:/Estoy listo/}).click();await page.locator('#start-match').click();
  await expect(page.locator('#control-hints')).toContainText('A PASE');
  expect(await page.evaluate(()=>(window as any).__pokesoccer.state.settings)).toEqual({pace:'slow',difficulty:'easy'});
});

test('HUD de Ditto, dirección, saque rápido y regreso al campo',async({page})=>{
  const server=createGameServer(),port=await server.listen(0),errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.addInitScript(({port})=>{
      const Original=window.WebSocket;
      window.WebSocket=class extends Original {constructor(url:string|URL,protocols?:string|string[]){super(String(url).endsWith('/ws')?'ws://127.0.0.1:'+port+'/ws':url,protocols);}};
    },{port});
    await page.goto('/');await page.getByRole('button',{name:/Invitar amigos/}).click();await page.getByRole('button',{name:/Crear sala/}).click();
    await page.getByRole('button',{name:/Estoy listo/}).click();await page.getByRole('button',{name:/A la cancha/}).click();
    await page.waitForFunction(()=>(window as any).__pokesoccer.state.phase==='playing');
    const game=[...server.rooms.values()][0].game,s=game.state,me=s.humans[0].id,original=controlled(s,me)!;
    for(const p of s.players){p.aiTimer=1000;p.aiX=p.aiZ=0;p.aiShoot=p.aiSprint=false;}
    const keeper=s.players.find(p=>p.team===0&&p.keeper)!;catchBall(s,keeper);
    const point={x:keeper.x,z:keeper.z};
    await expect(page.locator('#player-hud')).toContainText('Ditto');
    await expect(page.getByRole('timer')).toContainText(/[6-8]/);
    await expect(page.locator('#control-hints')).toContainText('S DESPEJE LARGO');
    await page.keyboard.down('ArrowUp');await page.waitForTimeout(180);await page.keyboard.up('ArrowUp');
    expect(keeper.x).toBe(point.x);expect(keeper.z).toBe(point.z);expect(keeper.facingZ).toBe(-1);
    await expect(page.locator('.player-label.is-target')).toHaveCount(1);
    const label=await page.locator('.player-label.is-you').boundingBox(),canvas=await page.locator('#arena').boundingBox();
    expect(label!.x).toBeGreaterThanOrEqual(canvas!.x);expect(label!.x+label!.width).toBeLessThan(canvas!.x+canvas!.width);
    await page.screenshot({path:'.artifacts/strategy-keeper.png',fullPage:true});
    await page.keyboard.down('q');await page.waitForTimeout(100);await page.keyboard.up('q');expect(keeper.controller).toBe(me);
    await page.keyboard.down('s');await page.waitForTimeout(140);await page.keyboard.up('s');
    await expect(page.locator('#player-hud')).not.toContainText('Ditto');
    expect(s.keeperPossession).toBe(null);expect(controlled(s,me)!.id).toBe(original.id);
    expect(errors).toEqual([]);
    await page.setViewportSize({width:1024,height:768});
    await page.screenshot({path:'.artifacts/strategy-field-laptop.png',fullPage:true});
  } finally {await page.goto('about:blank');await server.close();}
});
