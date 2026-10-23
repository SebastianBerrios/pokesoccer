import { ROSTER } from '../../../packages/game/src/catalog.ts';
import type { AbilityId, MatchState, Species } from '../../../packages/game/src/types.ts';
export interface AudioPreferences { muted:boolean; music:number; voices:number; effects:number }
const defaults:AudioPreferences={muted:true,music:.35,voices:.75,effects:.55};
export function parseAudioPreferences(raw:string|null):AudioPreferences {
  try {
    const value=JSON.parse(raw??'{}');
    return {muted:typeof value.muted==='boolean'?value.muted:true,...Object.fromEntries(
      (['music','voices','effects'] as const).map(key=>[key,typeof value[key]==='number'&&Number.isFinite(value[key])?Math.max(0,Math.min(1,value[key])):defaults[key]]))} as AudioPreferences;
  }catch{return {...defaults};}
}
export class AudioEventCursor {
  private last:number|null=null;
  reset(){this.last=null;}
  consume(s:MatchState) {
    const newest=s.events.at(-1)?.id??0;
    if(this.last===null){this.last=newest;return [];}
    const events=s.events.filter(e=>e.id>this.last!);this.last=Math.max(this.last,newest);return events;
  }
}
// Files selected by the player stay on this device and survive reloads.
function audioDB():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{const request=indexedDB.open('pokesoccer-audio',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('tracks');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
}
export class GameAudio {
  preferences=parseAudioPreferences(localStorage.getItem('pokesoccer-audio'));
  readonly events=new AudioEventCursor();
  private unlocked=false;
  private context:AudioContext|null=null;
  private buffers=new Map<string,Promise<AudioBuffer>>();
  private sources=new Set<AudioBufferSourceNode>();
  private voice:HTMLAudioElement|null=null;
  private music:HTMLAudioElement|null=null;
  private oldMusic:HTMLAudioElement|null=null;
  private phase:'lobby'|'match'='lobby';
  private tracks=new Map<string,string>();
  private fade=0;
  private transientEpoch=0;
  constructor() {
    void this.restore();
    window.addEventListener('pointerdown',()=>this.unlock(),{once:true});
    window.addEventListener('keydown',()=>this.unlock(),{once:true});
  }
  private async restore() {
    try {
      const db=await audioDB(),tx=db.transaction('tracks'),store=tx.objectStore('tracks');
      const request=store.openCursor();request.onsuccess=()=>{const c=request.result;if(c){this.tracks.set(String(c.key),URL.createObjectURL(c.value));c.continue();}else this.transition();};
      tx.oncomplete=()=>db.close();
    }catch{/* Audio remains optional in browsers that disable persistent storage. */}
  }
  async importTrack(key:string,file:File) {
    const url=URL.createObjectURL(file),probe=new Audio(url);
    try {await new Promise<void>((resolve,reject)=>{probe.onloadedmetadata=()=>resolve();probe.onerror=()=>reject(Error('No se pudo leer este archivo de audio.'));});}
    catch(error){URL.revokeObjectURL(url);throw error;}
    const db=await audioDB();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('tracks','readwrite');tx.objectStore('tracks').put(file,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();
    const old=this.tracks.get(key);this.tracks.set(key,url);if(old)URL.revokeObjectURL(old);
    if(key===this.phase)this.transition(true);
  }
  hasTrack(key:string){return this.tracks.has(key);}
  unlock() {
    if(this.unlocked)return;this.unlocked=true;this.context=new AudioContext();void this.context.resume();this.transition();
  }
  setPreferences(patch:Partial<AudioPreferences>) {
    this.preferences=parseAudioPreferences(JSON.stringify({...this.preferences,...patch}));
    try{localStorage.setItem('pokesoccer-audio',JSON.stringify(this.preferences));}catch{}
    if(this.preferences.muted){this.stopTransient();this.music?.pause();this.oldMusic?.pause();}
    else {
      this.unlock();
      if(this.music?.src!==this.tracks.get(this.phase))this.transition();
      else if(this.music){this.music.volume=this.preferences.music;void this.music.play().catch(()=>{});}
      else this.transition();
    }
    if(this.voice)this.voice.volume=this.preferences.voices;
  }
  private stopTransient(){this.transientEpoch++;this.voice?.pause();this.voice=null;for(const source of this.sources)source.stop();this.sources.clear();}
  setPhase(phase:'lobby'|'match') {if(this.phase===phase)return;this.phase=phase;this.stopTransient();this.transition();}
  private transition(force=false) {
    if(!this.unlocked||this.preferences.muted)return;
    const url=this.tracks.get(this.phase);
    if(!force&&this.music?.src===url)return;
    cancelAnimationFrame(this.fade);this.oldMusic?.pause();this.oldMusic=this.music;this.music=url?new Audio(url):null;
    const next=this.music,old=this.oldMusic,oldVolume=old?.volume??0;
    if(next){next.loop=true;next.volume=0;void next.play().catch(()=>{});}
    const start=performance.now();
    const frame=(now:number)=>{const progress=Math.max(0,Math.min(1,(now-start)/600));
      if(next)next.volume=this.preferences.muted?0:this.preferences.music*progress;
      if(old)old.volume=this.preferences.muted?0:oldVolume*(1-progress);
      if(progress<1)this.fade=requestAnimationFrame(frame);else{old?.pause();this.oldMusic=null;}
    };this.fade=requestAnimationFrame(frame);
  }
  speak(species:Species) {
    if(!this.unlocked||this.preferences.muted||this.preferences.voices===0)return;
    const url=this.tracks.get(species);if(!url)return;
    this.voice?.pause();this.voice=new Audio(url);this.voice.volume=this.preferences.voices;void this.voice.play().catch(()=>{});
  }
  effect(id:AbilityId|'ui') {
    if(!this.unlocked||this.preferences.muted||!this.context||this.preferences.effects===0)return;
    const context=this.context,url='/audio/'+id+'.wav',epoch=this.transientEpoch;
    let buffer=this.buffers.get(url);
    if(!buffer){buffer=fetch(url).then(r=>{if(!r.ok)throw Error('Audio no disponible');return r.arrayBuffer();}).then(data=>context.decodeAudioData(data));this.buffers.set(url,buffer);}
    void buffer.then(decoded=>{
      if(this.preferences.muted||epoch!==this.transientEpoch||this.sources.size>=8)return;
      const source=context.createBufferSource(),gain=context.createGain();source.buffer=decoded;gain.gain.value=this.preferences.effects*.5;
      source.connect(gain);gain.connect(context.destination);this.sources.add(source);source.onended=()=>{this.sources.delete(source);gain.disconnect();};source.start();
    }).catch(()=>this.buffers.delete(url));
  }
  snapshot(s:MatchState) {
    for(const e of this.events.consume(s)) {
      if(e.kind==='cast'&&e.abilityId?.endsWith('-special')) {
        const actor=s.players.find(p=>p.id===e.actor);if(actor)this.speak(actor.species);
      }
      if(e.kind==='ability'&&e.abilityId)this.effect(e.abilityId);
      else if(['goal','orb','shield'].includes(e.kind))this.effect('ui');
    }
  }
}
export const AUDIO_SPECIES=ROSTER.map(p=>p.id);
