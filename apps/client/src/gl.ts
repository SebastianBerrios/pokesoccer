type V3=[number,number,number];
export type Shape='box'|'sphere'|'cone'|'cylinder'|'ring';
export type M4=Float32Array;
export function identity():M4 {return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);}
export function multiply(a:M4,b:M4):M4 {
  const out=new Float32Array(16);
  for(let c=0;c<4;c++)for(let r=0;r<4;r++)out[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
  return out;
}
export function transform(x:number,y:number,z:number,sx=1,sy=1,sz=1,ry=0,rz=0,rx=0):M4 {
  const cy=Math.cos(ry),syy=Math.sin(ry),cz=Math.cos(rz),szz=Math.sin(rz),cx=Math.cos(rx),sxx=Math.sin(rx);
  const t=identity();t[12]=x;t[13]=y;t[14]=z;
  const ymat=new Float32Array([cy,0,-syy,0,0,1,0,0,syy,0,cy,0,0,0,0,1]);
  const zmat=new Float32Array([cz,szz,0,0,-szz,cz,0,0,0,0,1,0,0,0,0,1]);
  const xmat=new Float32Array([1,0,0,0,0,cx,sxx,0,0,-sxx,cx,0,0,0,0,1]);
  const scale=new Float32Array([sx,0,0,0,0,sy,0,0,0,0,sz,0,0,0,0,1]);
  return multiply(multiply(multiply(multiply(t,ymat),zmat),xmat),scale);
}
function normalize(v:V3):V3 {const n=Math.hypot(...v)||1;return [v[0]/n,v[1]/n,v[2]/n];}
function cross(a:V3,b:V3):V3 {return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function dot(a:V3,b:V3){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
export function camera(width:number,height:number,hero:boolean|'portrait'=false):M4 {
  const portrait=hero==='portrait';
  const eye:V3=portrait?[0,2.7,7]:hero?[29,35,38]:[0,38,30],target:V3=portrait?[0,1.2,0]:[0,0,0];
  const z=normalize([eye[0]-target[0],eye[1]-target[1],eye[2]-target[2]]);
  const x=normalize(cross([0,1,0],z)),y=cross(z,x);
  const view=new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
  const aspect=width/height;
  const spanX=portrait?4.1:Math.max(54,(hero?40:32)*aspect),spanY=spanX/aspect;
  const near=.1,far=150;
  const proj=new Float32Array([2/spanX,0,0,0,0,2/spanY,0,0,0,0,-2/(far-near),0,0,0,-(far+near)/(far-near),1]);
  return multiply(proj,view);
}
function geometry(kind:Shape):Float32Array {
  const result:number[]=[];
  const tri=(a:V3,b:V3,c:V3,n?:V3)=>{
    const normal=n??normalize(cross([b[0]-a[0],b[1]-a[1],b[2]-a[2]],[c[0]-a[0],c[1]-a[1],c[2]-a[2]]));
    for(const p of [a,b,c])result.push(...p,...normal);
  };
  if(kind==='box') {
    const faces:[[V3,V3,V3,V3],V3][]=[
      [[[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]],[0,0,1]],
      [[[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]],[0,0,-1]],
      [[[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]],[0,1,0]],
      [[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]],[0,-1,0]],
      [[[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]],[1,0,0]],
      [[[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]],[-1,0,0]]
    ];
    for(const [p,n]of faces){tri(p[0],p[1],p[2],n);tri(p[0],p[2],p[3],n);}
  } else if(kind==='sphere') {
    const pos=(u:number,v:number):V3=>[Math.sin(v)*Math.cos(u),Math.cos(v),Math.sin(v)*Math.sin(u)];
    for(let j=0;j<8;j++)for(let i=0;i<12;i++){
      const a=pos(i/12*Math.PI*2,j/8*Math.PI),b=pos((i+1)/12*Math.PI*2,j/8*Math.PI);
      const c=pos((i+1)/12*Math.PI*2,(j+1)/8*Math.PI),d=pos(i/12*Math.PI*2,(j+1)/8*Math.PI);
      tri(a,b,c);tri(a,c,d);
    }
  } else if(kind==='ring') {
    for(let i=0;i<32;i++){
      const a=i/32*Math.PI*2,b=(i+1)/32*Math.PI*2;
      const p:V3=[Math.cos(a),0,Math.sin(a)],q:V3=[Math.cos(b),0,Math.sin(b)];
      const r:V3=[q[0]*.89,0,q[2]*.89],t:V3=[p[0]*.89,0,p[2]*.89];
      tri(p,q,r,[0,1,0]);tri(p,r,t,[0,1,0]);
    }
  } else {
    for(let i=0;i<12;i++) {
      const a=i/12*Math.PI*2,b=(i+1)/12*Math.PI*2;
      const p:V3=[Math.cos(a),-.5,Math.sin(a)],q:V3=[Math.cos(b),-.5,Math.sin(b)];
      if(kind==='cone'){tri(p,[0,.5,0],q);tri([0,-.5,0],p,q,[0,-1,0]);}
      else {
        const r:V3=[q[0],.5,q[2]],t:V3=[p[0],.5,p[2]];
        tri(p,t,r);tri(p,r,q);tri([0,.5,0],r,t,[0,1,0]);tri([0,-.5,0],p,q,[0,-1,0]);
      }
    }
  }
  return new Float32Array(result);
}
export class GLRenderer {
  gl:WebGL2RenderingContext;
  private program:WebGLProgram;
  private meshes=new Map<Shape,{vao:WebGLVertexArrayObject,instances:WebGLBuffer,count:number}>();
  private batches=new Map<Shape,number[]>();
  vp=identity(); quality:'high'|'low'='high'; calls=0;
  constructor(public canvas:HTMLCanvasElement) {
    const gl=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});
    if(!gl)throw Error('Tu navegador necesita WebGL 2 para mostrar la cancha.');
    this.gl=gl;
    const shader=(type:number,source:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)!);return s;};
    const vs=shader(gl.VERTEX_SHADER,`#version 300 es
      precision highp float;
      layout(location=0) in vec3 position;
      layout(location=1) in vec3 normal;
      layout(location=2) in mat4 model;
      layout(location=6) in vec3 tint;
      uniform mat4 vp;
      out vec3 color;out vec3 n;
      void main(){
        gl_Position=vp*model*vec4(position,1.0);
        vec3 scale2=vec3(dot(model[0].xyz,model[0].xyz),dot(model[1].xyz,model[1].xyz),dot(model[2].xyz,model[2].xyz));
        n=normalize(mat3(model)*(normal/max(scale2,vec3(0.0001))));
        color=tint;
      }`);
    const frag=shader(gl.FRAGMENT_SHADER,`#version 300 es
      precision highp float;
      in vec3 color;in vec3 n;out vec4 outColor;
      void main(){
        float light=0.64+0.36*max(0.0,dot(normalize(n),normalize(vec3(-0.35,1.0,0.55))));
        outColor=vec4(color*light,1.0);
      }`);
    const program=gl.createProgram()!;gl.attachShader(program,vs);gl.attachShader(program,frag);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)!);
    this.program=program;gl.deleteShader(vs);gl.deleteShader(frag);
    for(const kind of ['box','sphere','cone','cylinder','ring'] as Shape[]) {
      const verts=geometry(kind),vao=gl.createVertexArray()!,buffer=gl.createBuffer()!,instances=gl.createBuffer()!;
      gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,verts,gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);
      gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);
      gl.bindBuffer(gl.ARRAY_BUFFER,instances);
      for(let n=0;n<4;n++){gl.enableVertexAttribArray(2+n);gl.vertexAttribPointer(2+n,4,gl.FLOAT,false,76,n*16);gl.vertexAttribDivisor(2+n,1);}
      gl.enableVertexAttribArray(6);gl.vertexAttribPointer(6,3,gl.FLOAT,false,76,64);gl.vertexAttribDivisor(6,1);
      this.meshes.set(kind,{vao,instances,count:verts.length/6});this.batches.set(kind,[]);
    }
    gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
  }
  begin(hero=false) {
    const ratio=Math.min(this.quality==='high'?1.75:1,window.devicePixelRatio||1);
    const w=Math.max(1,Math.floor(this.canvas.clientWidth*ratio)),h=Math.max(1,Math.floor(this.canvas.clientHeight*ratio));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    const gl=this.gl;gl.viewport(0,0,w,h);gl.clearColor(.038,.116,.107,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    this.vp=camera(w,h,hero);for(const list of this.batches.values())list.length=0;
  }
  add(kind:Shape,matrix:M4,color:string) {
    const n=parseInt(color.replace('#',''),16),list=this.batches.get(kind)!;
    list.push(...matrix,((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255);
  }
  shape(kind:Shape,x:number,y:number,z:number,sx:number,sy:number,sz:number,color:string,ry=0,rz=0,rx=0) {
    this.add(kind,transform(x,y,z,sx,sy,sz,ry,rz,rx),color);
  }
  end() {
    const gl=this.gl;gl.useProgram(this.program);gl.uniformMatrix4fv(gl.getUniformLocation(this.program,'vp'),false,this.vp);
    this.calls=0;
    for(const [kind,list]of this.batches)if(list.length) {
      const mesh=this.meshes.get(kind)!;gl.bindVertexArray(mesh.vao);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.instances);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(list),gl.DYNAMIC_DRAW);gl.drawArraysInstanced(gl.TRIANGLES,0,mesh.count,list.length/19);this.calls++;
    }
  }
  project(x:number,y:number,z:number):{x:number,y:number} {
    const m=this.vp;
    return {x:(m[0]*x+m[4]*y+m[8]*z+m[12]+1)*.5*this.canvas.clientWidth,
      y:(1-(m[1]*x+m[5]*y+m[9]*z+m[13]))*.5*this.canvas.clientHeight};
  }
  dispose(){this.gl.getExtension('WEBGL_lose_context')?.loseContext();}
}
