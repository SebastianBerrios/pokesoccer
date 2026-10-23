import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('audio local, silencio y preferencias persistentes',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.getByRole('button',{name:'Configurar sonido',exact:true}).click();
  await expect(page.locator('#audio-muted')).toBeChecked();
  await page.locator('#audio-muted').uncheck();
  await page.getByRole('slider',{name:'Volumen de música'}).fill('21');
  await page.getByRole('slider',{name:'Volumen de voces'}).fill('43');
  await page.getByRole('slider',{name:'Volumen de efectos'}).fill('65');
  await page.getByLabel('Música de sala',{exact:true}).setInputFiles({name:'local.wav',mimeType:'audio/wav',buffer:readFileSync('apps/client/public/audio/ui.wav')});
  await expect(page.locator('#audio-status')).toContainText('guardado');
  await page.reload();await page.getByRole('button',{name:'Configurar sonido',exact:true}).click();
  await expect(page.locator('#audio-muted')).not.toBeChecked();
  await expect(page.getByRole('slider',{name:'Volumen de música'})).toHaveValue('21');
  await expect(page.getByRole('slider',{name:'Volumen de voces'})).toHaveValue('43');
  await expect(page.getByRole('slider',{name:'Volumen de efectos'})).toHaveValue('65');
  await page.locator('#audio-muted').check();await page.reload();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('pokesoccer-audio')!).muted)).toBe(true);expect(errors).toEqual([]);
});

test('unmuting after a phase change selects the current music track',async({page})=>{
  await page.goto('/gallery.html');
  const result=await page.evaluate(async()=>{
    const {GameAudio}=await import(String('/src/audio.ts')),audio=new GameAudio();
    const bytes=await (await fetch('/audio/ui.wav')).arrayBuffer(),file=new File([bytes],'local.wav',{type:'audio/wav'});
    await audio.importTrack('lobby',file);await audio.importTrack('match',file);
    audio.setPreferences({muted:false});audio.setPreferences({muted:true});audio.setPhase('match');audio.setPreferences({muted:false});
    const current=audio.music?.src===audio.tracks.get('match');audio.setPreferences({muted:true});return current;
  });
  expect(result).toBe(true);
});

test('minimapa centrado y rival consultable sin edicion',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:/Jugar ahora/}).click();
  await expect(page.locator('[data-formation="1"]')).toBeDisabled();await expect(page.locator('[data-style="1"]')).toBeDisabled();
  await page.getByRole('button',{name:/Estoy listo/}).click();await page.locator('#start-match').click();
  await page.waitForFunction(()=>(window as any).__pokesoccer.state.phase==='playing');
  await page.keyboard.press('Escape');
  for(const [width,height] of [[1366,768],[390,844],[844,390]]) {
    await page.setViewportSize({width,height});const radar=(await page.locator('.minimap').boundingBox())!,hud=(await page.locator('.hud').boundingBox())!;
    expect(Math.abs(radar.x+radar.width/2-width/2)).toBeLessThan(1);expect(radar.y+radar.height).toBeLessThan(hud.y);
    const tactical=(await page.locator('#tactical-summary').boundingBox())!;
    const overlaps=radar.x<tactical.x+tactical.width&&radar.x+radar.width>tactical.x&&radar.y<tactical.y+tactical.height&&radar.y+radar.height>tactical.y;
    expect(overlaps).toBe(false);await page.screenshot({path:`.artifacts/experience-${width}.png`});
  }
});

test('galeria completa y audio PCM decodificable',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/gallery.html');await page.waitForSelector('body[data-ready="true"]');
  await expect(page.locator('[data-model]')).toHaveCount(13);await expect(page.locator('[data-ability]')).toHaveCount(36);
  for(const quality of ['high','low']) {
    await page.selectOption('#quality',quality);
    await page.locator('.models').screenshot({path:`.artifacts/models-${quality}.png`});
    for(const species of ['pikachu','charizard','blastoise','venusaur','gengar','machamp','alakazam','snorlax','lapras','dragonite','lucario','greninja']) {
      const cards=page.locator(`[data-ability^="${species}-"]`);
      for(let i=0;i<3;i++)await cards.nth(i).screenshot({path:`.artifacts/powers/${quality}-${species}-${i}.png`});
    }
  }
  const decoded=await page.evaluate(async(root)=>{
    const {ROSTER}=await import('/@fs/'+root+'/packages/game/src/catalog.ts');
    const ctx=new AudioContext(),results=[];
    for(const p of ROSTER)for(const a of p.abilities){const r=await fetch('/audio/'+a.id+'.wav'),b=await ctx.decodeAudioData(await r.arrayBuffer());results.push({duration:b.duration,peak:Math.max(...b.getChannelData(0))});}
    await ctx.close();return results;
  },process.cwd().replaceAll('\\','/'));
  expect(decoded).toHaveLength(36);expect(decoded.every(a=>a.duration>.1&&a.peak>.01&&a.peak<1)).toBe(true);expect(errors).toEqual([]);
});
