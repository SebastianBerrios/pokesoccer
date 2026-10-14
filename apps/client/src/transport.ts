import { applyPatch, type StatePatch } from '../../../packages/game/src/protocol.ts';
import type { ClientMessage, GameTransport, MatchState, ServerMessage, Team } from '../../../packages/game/src/types.ts';
export class LocalTransport implements GameTransport {
  worker:Worker;sessionId='local';code='';
  onState:GameTransport['onState']=()=>{};onStatus=(_s:string)=>{};
  constructor(name:string,team:Team) {
    this.worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
    this.worker.onmessage=e=>{
      const message=e.data as ServerMessage;
      if(message.type==='state')this.onState(message.state,message.ack);
      if(message.type==='error')this.onStatus(message.message);
    };
    this.worker.onerror=()=>this.onStatus('No se pudo iniciar el partido local. Recarga la página.');
    this.send({type:'create',name,team});
  }
  send(message:ClientMessage){this.worker.postMessage(message);}
  pause(value:boolean){this.worker.postMessage({type:'pause',value});}
  close(){this.worker.terminate();}
}
export class OnlineTransport implements GameTransport {
  sessionId='';code='';rtt=0;
  onState:GameTransport['onState']=()=>{};onStatus=(_s:string)=>{};
  private socket:WebSocket|null=null;private active=true;private token='';
  private confirmed:MatchState|null=null;private began=Date.now();private attempt=0;
  private retry:ReturnType<typeof setTimeout>|null=null;private heartbeat:ReturnType<typeof setInterval>|null=null;
  private first:ClientMessage;private base:string;
  constructor(first:ClientMessage) {
    this.first=first;
    const configured=(import.meta as ImportMeta&{env:Record<string,string>}).env.VITE_SERVER_URL;
    this.base=configured?(configured.startsWith('http')?configured:'https://'+configured):location.origin;
    this.connect();
  }
  private connect() {
    if(!this.active)return;
    const url=new URL('/ws',this.base);url.protocol=url.protocol==='https:'?'wss:':'ws:';
    this.onStatus(this.token?'Reconectando… Tu Pokémon sigue con la IA.':'Conectando con la cancha…');
    const socket=new WebSocket(url);this.socket=socket;
    const timeout=setTimeout(()=>{if(socket.readyState!==WebSocket.OPEN)socket.close();},12000);
    socket.onopen=()=>{
      clearTimeout(timeout);this.attempt=0;
      socket.send(JSON.stringify(this.token?{type:'reconnect',code:this.code,token:this.token}:this.first));
      this.heartbeat=setInterval(()=>this.send({type:'ping',at:Date.now()}),3000);
    };
    socket.onmessage=e=>{
      const message=JSON.parse(e.data) as ServerMessage|{type:'patch',patch:StatePatch,ack:number};
      if(message.type==='welcome') {
        this.sessionId=message.id;this.code=message.code;this.token=message.token;this.began=0;
        sessionStorage.setItem('pokesoccer-session',JSON.stringify({code:this.code,token:this.token}));
        this.onStatus('Conectado');
      } else if(message.type==='state') {
        this.confirmed=message.state;this.onState(structuredClone(message.state),message.ack);
      } else if(message.type==='patch'&&this.confirmed) {
        applyPatch(this.confirmed,message.patch);this.onState(structuredClone(this.confirmed),message.ack);
      } else if(message.type==='pong')this.rtt=Date.now()-message.at;
      else if(message.type==='error') {
        this.onStatus(message.message);
        if(message.fatal||!this.sessionId){this.active=false;socket.close();if(message.fatal)sessionStorage.removeItem('pokesoccer-session');}
      }
    };
    socket.onerror=()=>{};
    socket.onclose=()=>{
      clearTimeout(timeout);if(this.heartbeat)clearInterval(this.heartbeat);
      if(!this.active)return;
      if(this.began===0)this.began=Date.now();
      const elapsed=Date.now()-this.began;
      if(elapsed>(this.token?28000:90000)) {
        this.onStatus(this.token?'Se perdió la reserva de la sala. Vuelve a entrar.':'El servidor no está disponible. Puedes jugar en solitario o reintentar.');
        this.active=false;sessionStorage.removeItem('pokesoccer-session');return;
      }
      this.onStatus(this.token?'Reconectando… Tu Pokémon sigue con la IA.':'Despertando servidor gratuito… puede tardar un minuto.');
      this.retry=setTimeout(()=>this.connect(),Math.min(8000,1000*2**this.attempt++));
    };
  }
  send(message:ClientMessage){if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(message));}
  close(){
    this.active=false;if(this.retry)clearTimeout(this.retry);if(this.heartbeat)clearInterval(this.heartbeat);
    this.send({type:'leave'});this.socket?.close();sessionStorage.removeItem('pokesoccer-session');
  }
}
