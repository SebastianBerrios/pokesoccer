import { test, expect } from '@playwright/test';
import { createGameServer } from '../../apps/server/src/server.ts';

test('final online y revancha pasan por las pantallas reales',async({page})=>{
  const server=createGameServer({regulation:.1,overtime:.1}),port=await server.listen(0);
  try {
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
    await page.getByRole('button',{name:/Estoy listo/}).click();
    await page.getByRole('button',{name:/A la cancha/}).click();
    await expect(page.locator('#results')).toBeVisible({timeout:25000});
    await expect(page.locator('.final-score')).toContainText('0');
    await page.getByRole('button',{name:/Un partido más/}).click();
    await expect(page.getByRole('heading',{name:'Arma tu equipo.'})).toBeVisible();
    await expect(page.getByRole('button',{name:/Estoy listo/})).toBeVisible();
    await page.getByRole('button',{name:/Estoy listo/}).click();
    await page.getByRole('button',{name:/A la cancha/}).click();
    await expect(page.locator('#match')).toBeVisible();
  } finally {await page.goto('about:blank');await server.close();}
});

test('reasignación persistente y modificadores de mando',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:/Cómo jugar/}).click();
  await page.locator('[data-bind="right"]').click();await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-bind="right"] kbd')).toHaveText('Right');
  await page.getByRole('button',{name:'Cerrar',exact:true}).click();await page.reload();
  await page.getByRole('button',{name:/Cómo jugar/}).click();
  await expect(page.locator('[data-bind="right"] kbd')).toHaveText('Right');
  await page.getByRole('button',{name:'Cerrar',exact:true}).click();
  // Exercise the production controller with the browser's Gamepad interface stubbed.
  const samples=await page.evaluate(async()=>{
    const source='/src/input.ts';const {Controls}=await import(source);
    const controls=new Controls();controls.enabled=true;
    const buttons=Array.from({length:17},()=>({pressed:false,value:0,touched:false}));
    const pad={connected:true,axes:[.12,-.8],buttons};
    Object.defineProperty(navigator,'getGamepads',{value:()=>[pad],configurable:true});
    buttons[4].pressed=true;buttons[0].pressed=true;buttons[2].pressed=true;buttons[3].pressed=true;buttons[1].pressed=true;
    const modified=controls.read(1);
    buttons[4].pressed=false;const basic=controls.read(1);
    return {modified,basic};
  });
  expect(samples.modified).toMatchObject({moveX:0,moveZ:-.8,simple:true,normal:true,special:true,item:true,pass:false,shoot:false,lob:false,dodge:false});
  expect(samples.basic).toMatchObject({pass:true,shoot:true,lob:true,dodge:true,simple:false,normal:false,special:false,item:false});
  await page.getByRole('button',{name:/Jugar ahora/}).click();
  await page.getByRole('button',{name:/Estoy listo/}).click();await page.getByRole('button',{name:/A la cancha/}).click();
  await page.waitForFunction(()=>(window as any).__pokesoccer.state.phase==='playing');
  await page.evaluate(()=>Object.defineProperty(navigator,'getGamepads',{value:()=>[],configurable:true}));
  const before=await page.evaluate(()=>{const d=(window as any).__pokesoccer;return d.state.players.find((p:any)=>p.controller===d.session).x;});
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(500);await page.keyboard.up('ArrowRight');
  const after=await page.evaluate(()=>{const d=(window as any).__pokesoccer;return d.state.players.find((p:any)=>p.controller===d.session).x;});
  expect(after).toBeGreaterThan(before+1);
});

test('inicio y selección caben en una pantalla de portátil',async({page})=>{
  await page.setViewportSize({width:1024,height:768});await page.goto('/');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
  await page.getByRole('button',{name:/Jugar ahora/}).click();
  await expect(page.getByRole('heading',{name:'Arma tu equipo.'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
  await page.screenshot({path:'.artifacts/lobby-laptop.png',fullPage:true});
});
