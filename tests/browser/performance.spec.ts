import { test } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
test('render ten players and simultaneous effects',async({page})=>{
  await page.goto('/');await page.waitForFunction(()=>(window as any).__pokesoccer);
  const measurements=await page.evaluate(async(root)=>{
    const {Scene}=await import(String('/src/scene.ts'));
    const {Game}=await import('/@fs/'+root+'/packages/game/src/engine.ts');
    const canvas=document.createElement('canvas');canvas.style.cssText='width:1280px;height:720px';document.body.append(canvas);
    const scene=new Scene(canvas),game=new Game();scene.hero=false;scene.setState(game.state);
    const results=[];
    for(const count of [0,60])for(const quality of ['high','low']) {
      scene.renderer.quality=quality;
      game.state.effects=Array.from({length:count},(_,i)=>({id:i,owner:'0-0',team:0,kind:'zone',color:'#ff793f',x:i%10*5-25,z:Math.floor(i/10)*5-15,radius:3,life:2,maxLife:4,vx:0,vz:0,power:0,slow:0,stun:0,allySpeed:0,noSprint:false,hits:[],reflect:false,trail:false,abilityId:'charizard-normal'}));
      for(let i=0;i<10;i++)scene.draw(i/60);
      const samples=[];
      for(let i=0;i<40;i++){const start=performance.now();scene.draw(i/60);scene.renderer.gl.finish();samples.push(performance.now()-start);}
      samples.sort((a,b)=>a-b);results.push({count,quality,medianMs:samples[20],p95Ms:samples[38],calls:scene.renderer.calls});
    }
    scene.renderer.dispose();return results;
  },process.cwd().replaceAll('\\','/'));
  mkdirSync('.artifacts',{recursive:true});writeFileSync('.artifacts/performance-'+(process.env.PERF_LABEL??'current')+'.json',JSON.stringify(measurements,null,2));
});
