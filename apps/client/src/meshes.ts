import type { GLRenderer } from './gl.ts';
type Point = readonly [number, number, number];
// Small reusable closed surfaces; profile pairs are height and radius.
export function profileMesh(profile:readonly (readonly [number,number])[],sides=16) {
  const vertices:number[]=[];
  for(let row=0;row<profile.length-1;row++)for(let col=0;col<sides;col++) {
    const [y,r]=profile[row],[ny,nr]=profile[row+1];
    const point=(angle:number,height:number,radius:number):Point=>[Math.cos(angle)*radius,height,Math.sin(angle)*radius];
    const a=col/sides*Math.PI*2,b=(col+1)/sides*Math.PI*2;
    const p=point(a,y,r),q=point(b,y,r),t=point(a,ny,nr),u=point(b,ny,nr);
    for(const triangle of [[p,t,u],[p,u,q]])for(const v of triangle) {
      const angle=Math.atan2(v[2],v[0]),slope=(r-nr)/(ny-y||1),length=Math.hypot(1,slope);
      vertices.push(...v,Math.cos(angle)/length,slope/length,Math.sin(angle)/length);
    }
  }
  return new Float32Array(vertices);
}
export function polygonMesh(points:readonly (readonly [number,number])[],depth=.08) {
  const vertices:number[]=[];
  const triangle=(a:Point,b:Point,c:Point,n:Point)=>{for(const p of [a,b,c])vertices.push(...p,...n);};
  // Fan around the first vertex. These silhouette polygons are star-shaped from it.
  for(const z of [-depth,depth])for(let i=1;i<points.length-1;i++) {
    triangle([...points[0],z],[...points[i],z],[...points[i+1],z],[0,0,Math.sign(z)]);
  }
  for(let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length],n:Point=[b[1]-a[1],a[0]-b[0],0],l=Math.hypot(...n)||1;
    const normal=n.map(v=>v/l) as unknown as Point;
    triangle([...a,-depth],[...b,-depth],[...b,depth],normal);triangle([...a,-depth],[...b,depth],[...a,depth],normal);
  }
  return new Float32Array(vertices);
}
const installed=new WeakSet<GLRenderer>();
export function installCharacterMeshes(gl:GLRenderer) {
  if(installed.has(gl))return;installed.add(gl);
  gl.registerMesh('pear',profileMesh([[-1,0],[-.9,.52],[-.55,.93],[-.05,1],[.48,.73],[.86,.42],[1,0]]));
  gl.registerMesh('chest',profileMesh([[-1,0],[-.85,.5],[-.3,.68],[.35,1],[.7,.88],[1,0]]));
  gl.registerMesh('cheek',profileMesh([[-1,0],[-.75,.62],[-.35,1],[.25,.95],[.7,.7],[1,0]]));
  gl.registerMesh('shell',profileMesh([[-1,0],[-.8,.8],[-.45,1],[.25,.94],[.8,.5],[1,0]],12));
  gl.registerMesh('wing',polygonMesh([[0,0],[.18,1],[.7,.65],[1.4,.2],[1,-.1],[.82,.19],[.5,-.35],[.35,-.05]]));
  gl.registerMesh('leaf',polygonMesh([[0,-1],[-.4,-.3],[-.5,.25],[0,1],[.5,.25],[.4,-.3]],.025));
  gl.registerMesh('ear',polygonMesh([[-.2,-.5],[-.28,.1],[0,.85],[.23,.1],[.18,-.5]],.12));
  gl.registerMesh('fin',polygonMesh([[0,0],[-.8,.3],[-.55,.8],[0,1],[.55,.8],[.8,.3]],.06));
  gl.registerMesh('bolt',polygonMesh([[0,0],[-.23,.4],[.05,.45],[-.2,.85],[.48,1.15],[.62,.68],[.24,.56],[.42,.13]],.07));
}
