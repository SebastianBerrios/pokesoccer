import { test,expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve,extname,sep } from 'node:path';

test('el build estático ejecuta el partido sin servidor de juego ni red después de cargar',async({page,context})=>{
  const dist=resolve('apps/client/dist'),sockets:string[]=[],errors:string[]=[];
  page.on('websocket',socket=>sockets.push(socket.url()));page.on('pageerror',e=>errors.push(e.message));
  const mime:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.map':'application/json'};
  const http=createServer(async(req,res)=>{
    try{
      const path=resolve(dist,'.'+decodeURIComponent(new URL(req.url!,'http://localhost').pathname==='/'?'/index.html':new URL(req.url!,'http://localhost').pathname));
      if(!path.startsWith(dist+sep)){res.writeHead(403);res.end();return;}
      const data=await readFile(path);res.writeHead(200,{'content-type':mime[extname(path)]??'application/octet-stream'});res.end(data);
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise<void>(resolve=>http.listen(0,'127.0.0.1',resolve));
  try {
    await page.goto('http://127.0.0.1:'+(http.address() as {port:number}).port);
    await expect(page.locator('.roster-card')).toHaveCount(12);
    await page.getByRole('button',{name:/Jugar ahora/}).click();
    await page.getByRole('button',{name:/Estoy listo/}).click();await page.getByRole('button',{name:/A la cancha/}).click();
    await page.waitForFunction(()=>(window as any).__pokesoccer.state.phase==='playing');
    await context.setOffline(true);
    const before=await page.evaluate(()=>{const d=(window as any).__pokesoccer;return d.state.players.find((p:any)=>p.controller===d.session).x;});
    await page.keyboard.down('d');await page.waitForTimeout(600);await page.keyboard.up('d');
    const after=await page.evaluate(()=>{const d=(window as any).__pokesoccer;return d.state.players.find((p:any)=>p.controller===d.session).x;});
    expect(after).toBeGreaterThan(before+1);expect(sockets).toEqual([]);expect(errors).toEqual([]);
    await page.waitForTimeout(1500);
    console.log('Production WebGL software-rendering sample:',await page.evaluate(()=>{const d=(window as any).__pokesoccer;return {fps:d.fps,drawCalls:d.drawCalls};}));
    await page.screenshot({path:'.artifacts/production-match.png'});
  } finally {
    await context.setOffline(false);await page.goto('about:blank');
    http.closeAllConnections();await new Promise<void>(resolve=>http.close(()=>resolve()));
  }
});
