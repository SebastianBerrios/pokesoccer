import { emptyInput } from '../../../packages/game/src/state.ts';
import type { InputFrame } from '../../../packages/game/src/types.ts';
export const DEFAULT_BINDINGS={
  up:'KeyW',down:'KeyS',left:'KeyA',right:'KeyD',pass:'KeyJ',shoot:'KeyK',lob:'KeyL',dodge:'Space',sprint:'ShiftLeft',
  switch:'KeyQ',simple:'Digit1',normal:'Digit2',special:'Digit3',item:'KeyE'
};
export type Binding=keyof typeof DEFAULT_BINDINGS;
export class Controls {
  keys=new Set<string>();bindings={...DEFAULT_BINDINGS};gamepad=false;enabled=false;seq=0;
  constructor() {
    try{const stored=JSON.parse(localStorage.getItem('pokesoccer-controls')??'null');if(stored)for(const key of Object.keys(DEFAULT_BINDINGS) as Binding[])if(typeof stored[key]==='string')this.bindings[key]=stored[key];}catch{}
    window.addEventListener('keydown',e=>{
      if((e.target as HTMLElement).matches('input,select,textarea'))return;
      if(this.enabled&&Object.values(this.bindings).includes(e.code)){e.preventDefault();this.keys.add(e.code);}
    });
    window.addEventListener('keyup',e=>this.keys.delete(e.code));
    window.addEventListener('blur',()=>this.keys.clear());
    document.addEventListener('visibilitychange',()=>this.keys.clear());
  }
  rebind(action:Binding,code:string) {
    const other=(Object.keys(this.bindings) as Binding[]).find(k=>k!==action&&this.bindings[k]===code);
    if(other)this.bindings[other]=this.bindings[action];
    this.bindings[action]=code;localStorage.setItem('pokesoccer-controls',JSON.stringify(this.bindings));
  }
  label(action:Binding):string {return this.bindings[action].replace('Key','').replace('Digit','').replace('ShiftLeft','SHIFT').replace('Space','ESPACIO').replace('Arrow','');}
  read(epoch:number):InputFrame {
    const out=emptyInput(epoch,++this.seq);if(!this.enabled)return out;
    const held=(k:Binding)=>this.keys.has(this.bindings[k]);
    out.moveX=Number(held('right'))-Number(held('left'));out.moveZ=Number(held('down'))-Number(held('up'));
    for(const key of ['pass','shoot','lob','dodge','sprint','switch','simple','normal','special','item'] as const)out[key]=held(key);
    const pad=navigator.getGamepads?.().find(p=>p?.connected);
    if(pad) {
      const pressed=(i:number)=>!!pad.buttons[i]?.pressed;
      const x=Math.abs(pad.axes[0])>.18?pad.axes[0]:0,z=Math.abs(pad.axes[1])>.18?pad.axes[1]:0;
      if(x||z||pad.buttons.some(b=>b.pressed))this.gamepad=true;
      if(x||z){out.moveX=x;out.moveZ=z;}
      const mod=pressed(4);
      if(mod){out.simple||=pressed(0);out.normal||=pressed(2);out.special||=pressed(3);out.item||=pressed(1);}
      else {out.pass||=pressed(0);out.shoot||=pressed(2);out.lob||=pressed(3);out.dodge||=pressed(1);}
      out.sprint||=pressed(5);out.switch||=pressed(6);
    }
    if(this.keys.size)this.gamepad=false;
    const length=Math.hypot(out.moveX,out.moveZ);if(length>1){out.moveX/=length;out.moveZ/=length;}
    return out;
  }
}
