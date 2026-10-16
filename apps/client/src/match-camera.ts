import { FIELD } from '../../../packages/game/src/geometry.ts';
import { clamp, distance } from '../../../packages/game/src/math.ts';
import type { Vec } from '../../../packages/game/src/types.ts';

export interface CameraView extends Vec { span: number }
export class MatchCamera {
  view: CameraView={x:0,z:0,span:44};
  private initialized=false;
  reset() { this.initialized=false; }
  update(ball:Vec&{y?:number},controlled:Vec|undefined,width:number,height:number,dt:number):CameraView {
    const nearby=controlled&&distance(ball,controlled)<24?controlled:undefined;
    const target={x:ball.x*.72+(nearby?.x??ball.x)*.28,z:ball.z*.72+(nearby?.z??ball.z)*.28-Math.min(ball.y??0,7)*.45};
    const aspect=width/Math.max(1,height);
    const span=clamp(Math.max(44,nearby?Math.abs(ball.x-nearby.x)*1.6:0,
      nearby?Math.abs(ball.z-nearby.z)*Math.SQRT1_2*aspect*1.9:0),44,52);
    const alpha=!this.initialized||dt>.5?1:1-Math.exp(-Math.max(0,dt)*6);
    this.view.x+=(target.x-this.view.x)*alpha;
    this.view.z+=(target.z-this.view.z)*alpha;
    this.view.span+=(span-this.view.span)*alpha;
    this.initialized=true;
    // HUD-safe framing is enforced after smoothing, so a fast pass cannot vanish behind a panel.
    const unitsPerPixel=this.view.span/Math.max(1,width);
    const top=Math.min(108,height*.19),bottom=Math.max(top+80,height-142);
    this.view.x=clamp(this.view.x,ball.x-(width/2-Math.min(240,width*.24))*unitsPerPixel,ball.x+(width/2-66)*unitsPerPixel);
    const ballGround=ball.z-(ball.y??0);
    this.view.z=clamp(this.view.z,ballGround-(bottom-height/2)*unitsPerPixel/Math.SQRT1_2,
      ballGround-(top-height/2)*unitsPerPixel/Math.SQRT1_2);
    this.view.x=clamp(this.view.x,-FIELD.halfWidth+8,FIELD.halfWidth-8);
    this.view.z=clamp(this.view.z,-FIELD.halfDepth+4,FIELD.halfDepth-4);
    return this.view;
  }
}
