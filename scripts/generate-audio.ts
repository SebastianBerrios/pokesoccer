// Deterministic original sound effects: no sampled recordings or external dependencies.
import { mkdirSync, writeFileSync } from 'node:fs';
import { ROSTER } from '../packages/game/src/catalog.ts';
const rate=22050;
mkdirSync('apps/client/public/audio',{recursive:true});
for(const [index,id] of [...ROSTER.flatMap(p=>p.abilities.map(a=>a.id)),'ui'].entries()) {
  const duration=.18+(index%3)*.14,length=Math.floor(rate*duration),data=Buffer.alloc(44+length*2);
  data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);
  data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(length*2,40);
  let seed=index+1,phase=0;
  for(let i=0;i<length;i++) {
    const t=i/rate,progress=i/length,envelope=Math.min(1,t/.012)*Math.pow(1-progress,2);
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const frequency=(180+index*19)*(1+(index%2?1:-.6)*progress);
    phase+=Math.PI*2*frequency/rate;
    const tone=Math.sin(phase)+.3*Math.sin(phase*2.01),noise=(seed/4294967296*2-1)*(.12+(index%4)*.12);
    data.writeInt16LE(Math.round((tone*.32+noise*.3)*envelope*24000),44+i*2);
  }
  writeFileSync('apps/client/public/audio/'+id+'.wav',data);
}
console.log('Generated 37 deterministic PCM sound effects.');
