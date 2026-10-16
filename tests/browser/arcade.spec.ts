import { test, expect, type Page } from '@playwright/test';
import { createGameServer } from '../../apps/server/src/server.ts';
import { scoreGoal } from '../../packages/game/src/physics.ts';

async function diagnostics(page:Page) {
  return page.evaluate(()=>(window as any).__pokesoccer);
}
async function startOnline(page:Page,port:number) {
  await page.addInitScript(({port})=>{
    const Original=window.WebSocket;
    window.WebSocket=class extends Original {
      constructor(url:string|URL,protocols?:string|string[]) {
        super(String(url).endsWith('/ws')?'ws://127.0.0.1:'+port+'/ws':url,protocols);
      }
    };
  },{port});
  await page.goto('/');await page.getByRole('button',{name:/Invitar amigos/}).click();
  await page.getByRole('button',{name:/Crear sala/}).click();
  await page.getByRole('button',{name:/Estoy listo/}).click();await page.locator('#start-match').click();
  await page.waitForFunction(()=>(window as any).__pokesoccer.state.phase==='playing');
}

test('alineación estable, cancha a ventana completa y menú con mando',async({page})=>{
  await page.setViewportSize({width:1366,height:768});
  await page.goto('/');await page.getByRole('button',{name:/Jugar ahora/}).click();
  await page.locator('[data-formation="0"]').selectOption('2-2');
  await page.locator('[data-style="0"]').selectOption('possession');
  await expect(page.locator('.sol .plan-description')).toContainText('Triángulos');
  const before=await diagnostics(page),identity=before.state.players.map((p:any)=>[p.id,p.species,p.controller]);
  const lineup=before.state.teamPlans[0].lineup;
  await page.locator('.sol .lineup-editor summary').click();
  await page.locator('[data-lineup-team="0"][data-position="0"]').selectOption(String(lineup[1]));
  await expect.poll(async()=>(await diagnostics(page)).state.teamPlans[0].lineup[0]).toBe(lineup[1]);
  await expect(page.locator('.sol .lineup-editor')).toHaveAttribute('open','');
  expect((await diagnostics(page)).state.players.map((p:any)=>[p.id,p.species,p.controller])).toEqual(identity);
  await page.getByRole('button',{name:/Estoy listo/}).click();await page.locator('#start-match').click();
  await page.waitForFunction(()=>(window as any).__pokesoccer.state.phase==='playing');
  await page.keyboard.press('Escape');await expect(page.locator('#phase-overlay')).toContainText('En pausa');
  const dimensions=await page.locator('#arena').boundingBox();
  expect(dimensions).toMatchObject({x:0,y:0,width:1366,height:768});
  expect(await page.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.scrollHeight])).toEqual([1366,768]);
  const diag=await diagnostics(page),own=diag.state.players.find((p:any)=>p.controller===diag.session);
  expect(diag.models[own.id].height).toBeGreaterThan(48);
  expect(await page.locator('.minimap').boundingBox()).toMatchObject({width:216,height:142});
  await page.evaluate(()=>{
    const pad={connected:true,axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};
    (window as any).__testPad=pad;Object.defineProperty(navigator,'getGamepads',{value:()=>[pad],configurable:true});
  });
  async function press(button:number) {
    await page.evaluate(i=>{(window as any).__testPad.buttons[i].pressed=true;},button);
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    await page.evaluate(i=>{(window as any).__testPad.buttons[i].pressed=false;},button);
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  }
  await press(8);await expect(page.locator('#tactics-dialog')).toBeVisible();
  await page.locator('#tactics-dialog [data-formation="0"]').focus();
  await press(15);
  await expect(page.locator('#tactics-dialog [data-formation="0"]')).toHaveValue('1-1-2');
  await expect(page.locator('#tactics-dialog [data-plan-team="0"] .plan-state')).toContainText('reanudación');
  await expect(page.locator('#tactics-dialog [data-plan-team="0"] .formation-dot small')).toHaveText(['Defensa','Enlace','Ataque izquierdo','Ataque derecho']);
  await press(1);await expect(page.locator('#dialog')).not.toBeVisible();
  expect((await diagnostics(page)).state.teamPlans[0].formation).toBe('2-2');
  expect((await diagnostics(page)).state.pendingTeamPlans[0].formation).toBe('1-1-2');
  await page.screenshot({path:'.artifacts/arcade-laptop.png'});
});

test('tácticas online en reanudación, fantasma visible y cámara en los extremos',async({page})=>{
  test.setTimeout(60000);
  const server=createGameServer(),port=await server.listen(0),errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.setViewportSize({width:1366,height:768});await startOnline(page,port);
    const game=[...server.rooms.values()][0].game,s=game.state;
    await page.locator('#tactics-button').click();
    await expect(page.locator('#tactics-dialog')).toContainText('online continúa');
    await page.locator('#tactics-dialog [data-formation="0"]').selectOption('2-2');
    await page.locator('#tactics-dialog [data-style="0"]').selectOption('possession');
    await expect(page.locator('#tactics-dialog [data-plan-team="0"] .plan-state')).toContainText('reanudación');
    expect(s.teamPlans[0].formation).toBe('1-2-1');
    await page.locator('#tactics-done').click();scoreGoal(s,1);
    await page.waitForFunction(()=>{const s=(window as any).__pokesoccer.state;return s.phase==='playing'&&s.teamPlans[0].formation==='2-2';});
    expect(s.pendingTeamPlans[0]).toBe(null);
    // Freeze only the authoritative test fixture; the real transport and renderer continue.
    game.step=()=>{};
    s.players.forEach((p,i)=>{p.x=i<5?[-12,-6,6,12,17][i]:(i%5-2)*6;p.z=i<5?0:10;p.ghost=!p.keeper&&p.team===0?1.5:0;});
    s.ball.owner=null;s.ball.x=0;s.ball.z=0;s.ball.y=.4;
    const own=s.players.find(p=>p.controller===s.humans[0].id)!;own.x=0;own.z=0;
    await expect(page.locator('.player-label.is-ghost')).toHaveCount(4);
    await expect(page.locator('.player-label.is-you')).toBeVisible();
    await expect(page.locator('#ability-notice')).toContainText('SOL');
    await page.screenshot({path:'.artifacts/arcade-ghost.png'});
    for(const [x,z]of [[-35,-21],[35,-21],[35,21],[-35,21]]) {
      s.ball.x=x;s.ball.z=z;s.ball.y=5;own.x=-x;own.z=-z;
      await expect.poll(async()=>(await diagnostics(page)).state.ball.x).toBe(x);
      await page.waitForTimeout(700);
      const marker=await page.locator('.ball-marker').boundingBox();
      expect(marker).not.toBe(null);expect(marker!.x).toBeGreaterThan(45);expect(marker!.x).toBeLessThan(1160);
      expect(marker!.y).toBeGreaterThan(80);expect(marker!.y).toBeLessThan(640);
      await expect(page.locator('.offscreen-player')).toBeVisible();
    }
    await page.setViewportSize({width:1920,height:1080});await page.waitForTimeout(800);
    expect(await page.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.scrollHeight])).toEqual([1920,1080]);
    await expect(page.locator('.ball-marker')).toBeVisible();
    await page.screenshot({path:'.artifacts/arcade-corner.png'});
    expect(Object.keys((await diagnostics(page)).models)).toHaveLength(10);expect(errors).toEqual([]);
  } finally {await page.goto('about:blank');await server.close();}
});
