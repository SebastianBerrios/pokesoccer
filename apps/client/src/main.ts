import './style.css';
import { Scene, TEAM_COLORS } from './scene.ts';
import { GLRenderer, camera } from './gl.ts';
import { drawPokemon } from './models.ts';
import { Controls, type Binding } from './input.ts';
import { LocalTransport, OnlineTransport } from './transport.ts';
import { Game, POKEMON, ROSTER, ITEM_LABELS, controlled, moveFighter } from '../../../packages/game/src/index.ts';
import type { GameTransport, MatchState, Species, Team, InputFrame, Pace, Difficulty } from '../../../packages/game/src/types.ts';

const app=document.querySelector<HTMLDivElement>('#app')!;
const esc=(value:unknown)=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const logo='<span class="brand-ball">✦</span><span>POKE<span class="brand-light">SOCCER</span></span>';
app.innerHTML=`
  <header class="topbar">
    <a class="brand" href="/" aria-label="PokeSoccer inicio">${logo}<span class="alpha-tag">PLAYTEST 01</span></a>
    <nav><span class="online-pill"><i></i> LA CANCHA ESTÁ ABIERTA</span><button class="text-button" id="help-button">Cómo jugar <span>↗</span></button><button class="icon-button" id="sound-button" aria-label="Activar sonido" title="Sonido">♪</button></nav>
  </header>
  <main>
    <section id="home" class="home">
      <div class="hero-copy"><p class="eyebrow"><span></span> FÚTBOL. PODERES. CAOS.</p>
        <h1>La cancha<br>es de <em>todos.</em></h1>
        <p class="hero-description">Arma tu equipo, carga tus poderes y cambia el partido.<br>Cuatro en cancha. Atajadas automáticas. Tú eliges el saque.</p>
        <div class="hero-actions"><button id="solo-button" class="button primary">Jugar ahora <span>↗</span></button><button id="online-button" class="button secondary">Invitar amigos <span>＋</span></button></div>
        <div class="mode-note"><span class="keycap">↑ ← ↓ → + A S D</span> Teclado o mando <span class="dot">·</span> Gratis, en tu navegador</div>
        <div class="hero-stats"><div><strong>12</strong><span>POKÉMON</span></div><div><strong>36</strong><span>PODERES</span></div><div><strong>4<span>v</span>4</strong><span>HUMANOS + BOTS</span></div></div>
      </div>
      <div id="hero-stage-slot" class="hero-stage-slot"><div class="arena-caption"><span class="live-dot"></span> ESTADIO VERDE <span>01 / NOCHE DE PARTIDO</span></div><div class="stage-decoration">NO HAY BANCA.<br>HAY EQUIPO.</div></div>
    </section>
    <section id="roster-section" class="roster-section"><div class="section-heading"><div><p class="eyebrow">ELIGE TU ESTILO</p><h2>Tu tipo de juego.</h2></div><p>Velocidad, fuerza o un poco de caos.<br>Todos tienen algo que aportar.</p></div><div id="roster-strip" class="roster-strip"></div></section>
    <section id="lobby" class="lobby" hidden></section>
    <section id="match" class="match" hidden>
      <div class="match-toolbar"><button id="leave-button" class="text-button">← Salir de la cancha</button><span id="connection-label"></span><div><button id="quality-button" class="text-button">Calidad alta</button><button id="pause-button" class="text-button">Pausar [Esc]</button></div></div>
      <div class="match-board"><div class="score-team coral">SOL <span>◆</span></div><div class="score-center"><div><b id="score-a">0</b><span id="clock">05:00</span><b id="score-b">0</b></div><small id="period">PRIMER TIEMPO</small></div><div class="score-team cyan"><span>◇</span> LUNA</div></div>
      <div id="match-stage-slot" class="match-stage-slot"></div>
      <div id="phase-overlay" class="phase-overlay" hidden></div>
      <div class="hud"><div id="player-hud" class="player-hud"></div><div id="powers-hud" class="powers-hud"></div><div id="item-hud" class="item-hud"></div></div>
      <div id="control-hints" class="control-hints"></div>
    </section>
    <section id="results" class="results" hidden></section>
  </main>
  <footer id="footer"><span>${logo}</span><span>UN PARTIDO MÁS. UNA HISTORIA NUEVA.</span><span>Hecho para jugar juntos <span class="footer-star">✦</span></span></footer>
  <dialog id="dialog"><button id="dialog-close" class="dialog-close" aria-label="Cerrar">×</button><div id="dialog-body"></div></dialog>
  <div id="toast" class="toast" role="status" hidden></div>
`;
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id)! as T;
const canvas=document.createElement('canvas');canvas.id='arena';canvas.setAttribute('aria-label','Cancha 3D de PokeSoccer');
const stage=document.createElement('div');stage.className='stage';stage.append(canvas);el('hero-stage-slot').prepend(stage);
let scene:Scene;
try{scene=new Scene(canvas);}catch(error){el('hero-stage-slot').innerHTML='<div class="graphics-error">'+esc((error as Error).message)+'</div>';throw error;}
const controls=new Controls();
let transport:GameTransport|null=null,state:MatchState|null=null,view='home',paused=false;
let lobbyKey='',hudKey='',lastEvent=0,pendingInputs:InputFrame[]=[],lastSend=0;
let toastTimeout:ReturnType<typeof setTimeout>;
let sound=false,audio:AudioContext|null=null,quality='high';
const demo=new Game(5678);demo.state.phase='playing';
const thumbs=new Map<Species,string>();
const nickname=()=>localStorage.getItem('pokesoccer-name')||'Entrenador';
function toast(message:string) {
  el('toast').textContent=message;el('toast').hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el('toast').hidden=true,4500);
}
function chirp(freq=440,duration=.1) {
  if(!sound)return;
  audio??=new AudioContext();void audio.resume();
  const osc=audio.createOscillator(),gain=audio.createGain();osc.type='triangle';osc.frequency.value=freq;
  gain.gain.setValueAtTime(.04,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);
  osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);
}
function showDialog(html:string) {el('dialog-body').innerHTML=html;el<HTMLDialogElement>('dialog').showModal();controls.keys.clear();controls.enabled=false;}
function closeDialog(){el<HTMLDialogElement>('dialog').close();controls.enabled=view==='match'&&!paused;}
el('dialog-close').onclick=closeDialog;
el<HTMLDialogElement>('dialog').addEventListener('close',()=>controls.enabled=view==='match'&&!paused);
el<HTMLDialogElement>('dialog').addEventListener('click',e=>{if(e.target===el('dialog'))closeDialog();});
function setView(next:string) {
  if(next===view)return;
  view=next;document.body.dataset.view=next;
  el('home').hidden=next!=='home';el('roster-section').hidden=next!=='home';el('footer').hidden=next!=='home';
  el('lobby').hidden=next!=='lobby';el('match').hidden=next!=='match';el('results').hidden=next!=='results';
  scene.hero=next!=='match';scene.labels.hidden=next!=='match';
  if(next==='match')el('match-stage-slot').append(stage);
  if(next==='home')el('hero-stage-slot').prepend(stage);
  controls.enabled=next==='match'&&!paused&&!el<HTMLDialogElement>('dialog').open;
}
function connect(next:GameTransport) {
  transport?.close();transport=next;state=null;lobbyKey='';hudKey='';pendingInputs=[];lastEvent=0;paused=false;
  next.onStatus=message=>{if(message==='Conectado'){clearTimeout(toastTimeout);el('toast').hidden=true;}else toast(message);};
  next.onState=(incoming,ack)=>{
    if(transport!==next)return;
    state=incoming;scene.myId=next.sessionId;scene.myTeam=incoming.humans.find(h=>h.id===next.sessionId)?.team??0;
    pendingInputs=pendingInputs.filter(i=>i.seq>ack);
    scene.setState(incoming);
    if(el<HTMLDialogElement>('dialog').open&&['online-form','connecting'].includes(el('dialog-body').firstElementChild?.id??''))closeDialog();
    if(incoming.phase==='lobby'){setView('lobby');renderLobby();}
    else if(incoming.phase==='finished'){setView('results');renderResults();}
    else {setView('match');updateHUD();}
    const latest=incoming.events.filter(e=>e.id>lastEvent);
    for(const e of latest){if(e.kind==='goal'){chirp(700,.4);setTimeout(()=>chirp(1000,.35),150);}else if(e.kind==='orb')chirp(880,.2);}
    lastEvent=incoming.events.at(-1)?.id??lastEvent;
  };
}
function startSolo() {closeDialog();connect(new LocalTransport(nickname(),0));}
function onlineDialog() {
  const code=new URLSearchParams(location.search).get('sala')??'';
  showDialog(`<div id="online-form"><p class="eyebrow">MEJOR CON AMIGOS</p><h2>Nos vemos en la cancha.</h2><p class="dialog-intro">Crea una sala y comparte el enlace. Los bots completan tu equipo.</p>
    <label>Tu apodo<input id="nickname" maxlength="20" value="${esc(nickname())}" autocomplete="nickname"></label>
    <label>Tu equipo<select id="online-team"><option value="0">◆ Sol · naranja</option><option value="1">◇ Luna · celeste</option></select></label>
    <button id="create-room" class="button primary wide">Crear sala <span>＋</span></button>
    <div class="divider">O ENTRA A UNA SALA</div>
    <div class="join-row"><input id="room-code" placeholder="CÓDIGO" aria-label="Código de sala" maxlength="6" value="${esc(code)}"><button id="join-room" class="button secondary">Entrar ↗</button></div>
    <p class="fine-print">El servidor gratuito puede tardar un minuto en despertar.</p><div id="reconnect-slot"></div></div>`);
  const launch=(join:boolean)=>{
    const name=el<HTMLInputElement>('nickname').value.trim()||'Entrenador';
    const team=Number(el<HTMLSelectElement>('online-team').value) as Team;
    const roomCode=el<HTMLInputElement>('room-code').value.trim().toUpperCase();
    if(join&&!/^[A-F0-9]{6}$/.test(roomCode)){toast('Escribe el código de seis caracteres.');return;}
    localStorage.setItem('pokesoccer-name',name);
    connect(new OnlineTransport(join?{type:'join',name,team,code:roomCode}:{type:'create',name,team}));
    toast('Conectando con la cancha…');
  };
  el('create-room').onclick=()=>launch(false);el('join-room').onclick=()=>launch(true);
  const saved=sessionStorage.getItem('pokesoccer-session');
  if(saved)try {
    const {code,token}=JSON.parse(saved);
    el('reconnect-slot').innerHTML='<button id="reconnect" class="text-button">Reconectar a mi partido →</button>';
    el('reconnect').onclick=()=>connect(new OnlineTransport({type:'reconnect',code,token}));
  }catch{}
}
function renderLobby() {
  if(!state||!transport)return;
  const key=JSON.stringify([state.humans,state.players.map(p=>p.species),state.host,transport.code,state.settings]);
  if(key===lobbyKey)return;lobbyKey=key;
  const me=state.humans.find(h=>h.id===transport!.sessionId);if(!me)return;
  const online=transport instanceof OnlineTransport;
  const allReady=state.humans.every(h=>!h.connected||h.ready);
  const teamHTML=(team:Team)=>{
    const humans=state!.humans.filter(h=>h.team===team&&h.connected);
    return `<div class="team-panel ${team===0?'sol':'luna'}"><div class="team-title"><span>${team===0?'◆ SOL':'◇ LUNA'}</span><small>${humans.length} HUMANOS · ${4-humans.length} BOTS</small></div>
      ${state!.players.filter(p=>p.team===team&&!p.keeper).map(p=>{
        const h=state!.humans.find(h=>h.id===p.controller),editable=me.team===team&&(p.controller===me.id||me.captain&&!p.controller);
        return `<button class="slot-card ${p.controller===me.id?'my-slot':''}" data-slot="${p.slot}" data-team="${team}" ${editable?'':'disabled'}>
          <span class="slot-number">0${p.slot+1}</span><img src="${thumbs.get(p.species)}" alt=""><span class="slot-info"><strong>${POKEMON[p.species].name}</strong><small>${h?esc(h.name)+(h.id===me.id?' · TÚ':''):'BOT · '+POKEMON[p.species].role}</small></span>
          <span class="slot-status">${h?(h.ready?'✓':'●'):'✦'}</span>${editable?'<span class="slot-edit">↗</span>':''}</button>`;
      }).join('')}
      <div class="keeper-row"><span>◌</span><strong>Ditto</strong><span>ATAJA SOLO · TÚ SACAS</span></div>
      ${online&&me.team!==team?'<button class="text-button team-switch" data-switch="'+team+'">Pasarme a '+(team===0?'Sol':'Luna')+' →</button>':''}
    </div>`;
  };
  el('lobby').innerHTML=`<div class="lobby-header"><div><button class="text-button" id="back-home">← Volver</button><p class="eyebrow">${online?'SALA PRIVADA':'PARTIDO LOCAL'}</p><h1>Arma tu equipo.</h1><p>Elige tu Pokémon. En cancha puedes cambiar a cualquier compañero bot.</p></div>
    <div class="room-card"><small>${online?'INVITA A TU EQUIPO':'JUEGA A TU RITMO'}</small><strong>${online?transport.code:'TÚ + BOTS'}</strong>${online?'<button id="copy-link" class="text-button">Copiar enlace ↗</button>':'<span>Sin esperar al servidor</span>'}</div></div>
    <div class="match-settings"><div><small>EL PARTIDO A TU MEDIDA</small><strong>Ritmo y dificultad</strong><span>El anfitrión elige antes de jugar. Todos los bots comparten dificultad.</span></div>
      <label>Ritmo<select id="pace-setting" ${state.host===me.id?'':'disabled'}><option value="slow">Lento · 75 %</option><option value="balanced">Equilibrado · 90 %</option><option value="fast">Rápido · 105 %</option></select></label>
      <label>Dificultad<select id="difficulty-setting" ${state.host===me.id?'':'disabled'}><option value="easy">Fácil</option><option value="normal">Normal</option><option value="hard">Difícil</option></select></label></div>
    <div class="teams-grid">${teamHTML(0)}<div class="versus">VS</div>${teamHTML(1)}</div>
    <div class="lobby-bottom"><p>2 × 5 MIN <span>·</span> GOL DE ORO <span>·</span> SIN FALTAS<br><small>${me.captain?'Eres capitán: también eliges los Pokémon de los bots.':'El capitán completa los puestos de bots.'}</small></p>
      <div><button id="ready-button" class="button ${me.ready?'secondary':'primary'}">${me.ready?'✓ Estoy listo':'Estoy listo'} <span>✓</span></button>
      ${state.host===me.id?'<button id="start-match" class="button '+(allReady?'primary':'secondary')+'" '+(allReady?'':'disabled')+'>A la cancha <span>↗</span></button>':'<small>El anfitrión inicia el partido.</small>'}</div></div>`;
  el<HTMLSelectElement>('pace-setting').value=state.settings.pace;
  el<HTMLSelectElement>('difficulty-setting').value=state.settings.difficulty;
  const configure=()=>transport?.send({type:'configure',settings:{pace:el<HTMLSelectElement>('pace-setting').value as Pace,difficulty:el<HTMLSelectElement>('difficulty-setting').value as Difficulty}});
  el('pace-setting').onchange=configure;el('difficulty-setting').onchange=configure;
  el('back-home').onclick=leave;
  el('ready-button').onclick=()=>transport?.send({type:'ready',ready:!me.ready});
  if(state.host===me.id)el('start-match').onclick=()=>transport?.send({type:'start'});
  el('lobby').querySelectorAll<HTMLButtonElement>('[data-slot]').forEach(button=>button.onclick=()=>chooseDialog(Number(button.dataset.slot)));
  el('lobby').querySelectorAll<HTMLButtonElement>('[data-switch]').forEach(button=>button.onclick=()=>transport?.send({type:'team',team:Number(button.dataset.switch) as Team}));
  if(online)el('copy-link').onclick=async()=>{
    const url=new URL(location.href);url.searchParams.set('sala',transport!.code);
    try{await navigator.clipboard.writeText(url.toString());toast('Enlace copiado. ¡Invita a tu equipo!');}catch{toast(url.toString());}
  };
}
function chooseDialog(slot:number) {
  if(!state||!transport)return;
  const me=state.humans.find(h=>h.id===transport!.sessionId)!;
  const occupied=state.players.filter(p=>p.team===me.team&&p.slot!==slot).map(p=>p.species);
  showDialog(`<div class="choose-dialog"><p class="eyebrow">TU EQUIPO, TU ESTILO</p><h2>Elige un Pokémon.</h2><div class="choose-grid">${ROSTER.map(p=>`<button data-species="${p.id}" class="choose-card" ${occupied.includes(p.id)?'disabled':''}><img src="${thumbs.get(p.id)}" alt=""><strong>${p.name}</strong><small>${p.role}</small></button>`).join('')}</div><p class="fine-print">Un Pokémon de cada especie por equipo.</p></div>`);
  el('dialog-body').querySelectorAll<HTMLButtonElement>('[data-species]').forEach(button=>button.onclick=()=>{
    transport?.send({type:'choose',slot,species:button.dataset.species as Species});closeDialog();chirp(580,.08);
  });
}
function updateHUD() {
  if(!state||!transport)return;
  const p=controlled(state,transport.sessionId);if(!p)return;
  const pokemon=POKEMON[p.species];
  el('score-a').textContent=String(state.score[0]);el('score-b').textContent=String(state.score[1]);
  const seconds=Math.ceil(state.remaining);el('clock').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
  el('period').textContent=state.half===3?'GOL DE ORO':state.half===1?'PRIMER TIEMPO':'SEGUNDO TIEMPO';
  el('connection-label').textContent=transport instanceof OnlineTransport?'SALA '+transport.code+' · '+transport.rtt+' ms':'PARTIDO LOCAL · SIN SERVIDOR';
  el('pause-button').hidden=transport instanceof OnlineTransport;
  if(p.keeper) {
    const hold=state.keeperPossession;
    const target=state.players.find(q=>q.id===hold?.targetId);
    hudKey='keeper';
    el('player-hud').innerHTML='<div class="keeper-icon">◌</div><div><small>CONTROLAS EL SAQUE</small><strong>Ditto</strong><span>Apunta con '+(controls.gamepad?'el stick':['up','left','down','right'].map(k=>controls.label(k as Binding)).join(' '))+'</span></div>';
    el('powers-hud').innerHTML='<div class="keeper-target"><small>DESTINATARIO</small><strong>'+(target?POKEMON[target.species].name:'Apunta a un compañero')+'</strong><span>El pase puede disputarse al salir</span></div>';
    el('item-hud').innerHTML='<div class="keeper-countdown" role="timer" aria-label="Tiempo de saque"><strong>'+Math.ceil(hold?.remaining??0)+'</strong><span>SEGUNDOS</span></div>';
    el('control-hints').innerHTML=['pass','lob','shoot'].map((k,i)=>'<b>'+(controls.gamepad?['A','Y','X'][i]:controls.label(k as Binding))+'</b> '+['PASE RASO','PASE ELEVADO','DESPEJE LARGO'][i]).join(' <span>·</span> ');
  } else {
  if(hudKey!==p.species+controls.gamepad) {
    hudKey=p.species+controls.gamepad;
    el('player-hud').innerHTML=`<img src="${thumbs.get(p.species)}" alt=""><div><small>CONTROLAS A</small><strong>${pokemon.name}</strong><div class="stamina-track"><i id="stamina"></i></div></div>`;
    el('powers-hud').innerHTML=pokemon.abilities.map((a,i)=>`<div class="power-card" title="${esc(a.description)}"><span class="power-key">${controls.gamepad?['LB+A','LB+X','LB+Y'][i]:controls.label(['simple','normal','special'][i] as Binding)}</span><div><small>${['SIMPLE','NORMAL','ESPECIAL'][i]}</small><strong>${a.name}</strong><div class="power-track"><i id="power-${i}" style="background:${a.color}"></i></div></div><span class="power-state" id="power-state-${i}"></span></div>`).join('');
    el('control-hints').innerHTML=controls.gamepad?'A PASE <span>·</span> X TIRO / ENTRADA <span>·</span> Y PASE ALTO <span>·</span> B ESQUIVA <span>·</span> RB SPRINT <span>·</span> LT CAMBIO':
      ['pass','shoot','lob','dodge','sprint','switch'].map((k,i)=>'<b>'+controls.label(k as Binding)+'</b> '+['PASE','TIRO / ENTRADA','PASE ALTO','ESQUIVA','SPRINT','CAMBIO'][i]).join(' <span>·</span> ');
  }
  el('stamina').style.width=p.stamina+'%';
  const amounts=[(1-p.simpleCd/6)*100,p.normal,p.special];
  amounts.forEach((amount,i)=>{el('power-'+i).style.width=amount+'%';el('power-state-'+i).textContent=amount>=99.9?'●':i===0?Math.ceil(p.simpleCd)+'s':Math.floor(amount)+'%';});
  el('item-hud').innerHTML='<span class="power-key">'+(controls.gamepad?'LB+B':controls.label('item'))+'</span><small>OBJETO</small><strong>'+(p.item?ITEM_LABELS[p.item]:'Sin objeto')+'</strong>';
  }
  const overlay=el('phase-overlay');overlay.hidden=!paused&&['playing','overtime'].includes(state.phase);
  if(paused)overlay.innerHTML='<small>RESPIRA. LA CANCHA TE ESPERA.</small><strong>En pausa</strong><span>Presiona Esc para continuar</span>';
  else if(state.phase==='kickoff')overlay.innerHTML='<small>'+ (state.half===3?'EL PRÓXIMO GOL GANA':'PREPARA TU PRIMERA JUGADA')+'</small><strong>'+Math.max(1,Math.ceil(state.phaseTime))+'</strong>';
  else if(state.phase==='goal')overlay.innerHTML='<small>¡ESO ES EQUIPO!</small><strong>GOOOL.</strong>';
  else if(state.phase==='halftime')overlay.innerHTML='<small>CAMBIO DE LADO</small><strong>Entretiempo</strong><span>'+Math.ceil(state.phaseTime)+' segundos</span>';
}
function renderResults() {
  if(!state||!transport)return;
  const own=state.humans.find(h=>h.id===transport!.sessionId)?.team;
  el('results').innerHTML=`<p class="eyebrow">SE ESCUCHÓ EL SILBATO</p><h1>${state.winner===null?'Hasta el final.':state.winner===own?'¡La cancha es tuya!':'La revancha te espera.'}</h1><div class="final-score"><span class="coral">SOL <b>${state.score[0]}</b></span><i>:</i><span class="cyan"><b>${state.score[1]}</b> LUNA</span></div><p>${state.winner===null?'Empate. Dos equipos, un gran partido.':'Victoria para '+(state.winner===0?'Sol':'Luna')+'.'}</p><div class="hero-actions">${state.host===transport.sessionId?'<button id="rematch" class="button primary">Un partido más ↗</button>':'<p>El anfitrión puede abrir la revancha.</p>'}<button id="results-home" class="button secondary">Volver al inicio</button></div>`;
  if(state.host===transport.sessionId)el('rematch').onclick=()=>{lobbyKey='';transport?.send({type:'rematch'});};
  el('results-home').onclick=leave;
}
function leave() {
  closeDialog();transport?.close();transport=null;state=null;scene.predicted=null;paused=false;pendingInputs=[];
  setView('home');controls.enabled=false;scene.setState(demo.state);
}
function togglePause() {
  if(!(transport instanceof LocalTransport)||view!=='match')return;
  paused=!paused;transport.pause(paused);controls.enabled=!paused;controls.keys.clear();updateHUD();
}
function help() {
  const labels:Record<Binding,string>={up:'Arriba',down:'Abajo',left:'Izquierda',right:'Derecha',pass:'Pase',shoot:'Tiro / entrada',lob:'Pase elevado',dodge:'Esquiva',sprint:'Sprint',switch:'Cambiar Pokémon',simple:'Poder simple',normal:'Poder normal',special:'Poder especial',item:'Usar objeto'};
  showDialog(`<div class="help-dialog"><p class="eyebrow">EN DOS MINUTOS ESTÁS JUGANDO</p><h2>La pelota primero.<br>El caos después.</h2><p class="dialog-intro">Mantén el tiro para cargarlo y suelta para rematar. Sin pelota, el mismo botón hace una entrada. Cada recuperación de un bot aliado te entrega el control. Al pasar, tendrás prioridad sobre el receptor.</p><div class="help-columns"><div><h3>Teclado <small>Haz clic para reasignar</small></h3><div class="control-presets"><button class="text-button" id="preset-arrows">Flechas + A/S/D</button><button class="text-button" id="preset-wasd">WASD + J/K/L</button></div><div class="binding-list">${Object.entries(labels).map(([key,label])=>'<button data-bind="'+key+'"><span>'+label+'</span><kbd>'+controls.label(key as Binding)+'</kbd></button>').join('')}</div></div><div><h3>Mando</h3><p>Stick izquierdo: movimiento y dirección.<br><br>A: pase · X: tiro / entrada<br>Y: pase elevado · B: esquiva<br>RB: sprint · LT: cambio<br><br>Mantén LB y pulsa:<br>A: simple · X: normal<br>Y: especial · B: objeto</p><h3>Saque de Ditto · 8 segundos</h3><p>Ataja automáticamente. Durante el saque, apunta con las direcciones; pase raso, pase elevado o tiro para despejar. Con mando: A / Y / X, también con LB. No se mueve ni usa poderes. Puedes sacar rápido; al salir la pelota termina la protección del área.</p><h3>Tres formas de cargar</h3><p><b>Simple:</b> espera seis segundos.<br><b>Normal:</b> pasa, recupera y remata.<br><b>Especial:</b> recoge el orbe dorado.<br><br>Los poderes pertenecen al Pokémon, también cuando cambias de control.</p></div></div></div>`);
  el('preset-arrows').onclick=()=>{controls.preset('arrows');hudKey='';help();};
  el('preset-wasd').onclick=()=>{controls.preset('wasd');hudKey='';help();};
  el('dialog-body').querySelectorAll<HTMLButtonElement>('[data-bind]').forEach(button=>button.onclick=()=>{
    button.querySelector('kbd')!.textContent='Pulsa una tecla';
    const listener=(event:KeyboardEvent)=>{event.preventDefault();event.stopPropagation();if(event.code!=='Escape')controls.rebind(button.dataset.bind as Binding,event.code);window.removeEventListener('keydown',listener,true);el('dialog-body').querySelectorAll<HTMLButtonElement>('[data-bind]').forEach(key=>key.querySelector('kbd')!.textContent=controls.label(key.dataset.bind as Binding));hudKey='';};
    window.addEventListener('keydown',listener,{capture:true,once:true});
  });
}
el('solo-button').onclick=startSolo;el('online-button').onclick=onlineDialog;el('help-button').onclick=help;
el('leave-button').onclick=leave;el('pause-button').onclick=togglePause;
el('quality-button').onclick=()=>{quality=quality==='high'?'low':'high';scene.renderer.quality=quality as 'high'|'low';el('quality-button').textContent='Calidad '+(quality==='high'?'alta':'baja');};
el('sound-button').onclick=()=>{sound=!sound;el('sound-button').classList.toggle('active',sound);el('sound-button').setAttribute('aria-label',sound?'Desactivar sonido':'Activar sonido');chirp(600,.12);};
document.querySelector('.brand')!.addEventListener('click',e=>{e.preventDefault();leave();});
window.addEventListener('keydown',e=>{if(e.code==='Escape'&&!el<HTMLDialogElement>('dialog').open){e.preventDefault();togglePause();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&transport instanceof LocalTransport&&view==='match'&&!paused)togglePause();});
function portraits() {
  const c=document.createElement('canvas');c.style.cssText='position:fixed;left:-9999px;width:160px;height:160px';document.body.append(c);
  const renderer=new GLRenderer(c);renderer.quality='low';
  for(const p of ROSTER){renderer.begin();renderer.vp=camera(160,160,'portrait');drawPokemon(renderer,p.id,0,0,0,0,false,1.1);renderer.end();thumbs.set(p.id,c.toDataURL());}
  renderer.dispose();c.remove();
  el('roster-strip').innerHTML=ROSTER.map((p,i)=>`<button class="roster-card" data-info="${p.id}" style="--pokemon-color:${p.color}"><span class="roster-number">${String(i+1).padStart(2,'0')}</span><img src="${thumbs.get(p.id)}" alt="${p.name}" loading="lazy"><strong>${p.name}</strong><small>${p.type}</small></button>`).join('');
  el('roster-strip').querySelectorAll<HTMLButtonElement>('[data-info]').forEach(button=>button.onclick=()=>{
    const p=POKEMON[button.dataset.info as Species];
    showDialog(`<div class="pokemon-detail"><img src="${thumbs.get(p.id)}" alt=""><p class="eyebrow">${p.type} · ${p.role}</p><h2>${p.name}</h2><div class="stat-grid">${p.stats.map((n,i)=>'<div><span>'+['Velocidad','Fuerza','Tiro','Pase'][i]+'</span><b>'+('●'.repeat(n))+('○'.repeat(5-n))+'</b></div>').join('')}</div>${p.abilities.map((a,i)=>'<div class="ability-description"><span>'+['01','02','03'][i]+'</span><div><strong>'+a.name+'</strong><p>'+a.description+'</p></div></div>').join('')}<button id="detail-play" class="button primary wide">Armar mi equipo ↗</button></div>`);
    el('detail-play').onclick=startSolo;
  });
}
portraits();
let previousTime=performance.now(),demoAcc=0,fpsFrames=0,fpsAt=performance.now(),fps=60;
function frame(now:number) {
  const dt=Math.min(.1,(now-previousTime)/1000);previousTime=now;
  if(view==='home') {
    demoAcc+=dt;while(demoAcc>=1/30){demo.step();demoAcc-=1/30;}
    if(demo.state.phase==='finished'){demo.state.phase='playing';demo.state.remaining=300;demo.state.half=1;demo.state.score=[0,0];}
    scene.setState(demo.state);scene.previous=null;scene.myId='';scene.predicted=null;
  } else if(view==='match'&&state&&transport) {
    const p=controlled(state,transport.sessionId);
    const active=['playing','overtime'].includes(state.phase)&&!paused;
    if(!active)pendingInputs=[];
    if(p&&active&&now-lastSend>=1000/30) {
      lastSend=now-(now-lastSend)%(1000/30);
      const input=controls.read(p.epoch,p.keeper);transport.send({type:'input',input});pendingInputs.push(input);
      if(pendingInputs.length>30)pendingInputs.shift();
    }
    if(p&&active&&transport instanceof OnlineTransport) {
      const predicted={...p};
      for(const input of pendingInputs)if(input.epoch===p.epoch)moveFighter(predicted,input,1/30,state.settings);
      scene.predicted={x:predicted.x,z:predicted.z};
    }else scene.predicted=null;
  }
  if(view==='home'||view==='match')scene.draw(now/1000);
  if(++fpsFrames&&now-fpsAt>1000){fps=Math.round(fpsFrames*1000/(now-fpsAt));fpsFrames=0;fpsAt=now;}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if(new URLSearchParams(location.search).has('sala'))onlineDialog();
// Read-only diagnostic surface: used by browser QA, never accepted as authoritative input.
Object.defineProperty(window,'__pokesoccer',{get:()=>({view,state:state?structuredClone(state):null,fps,drawCalls:scene.renderer.calls,session:transport?.sessionId,network:transport instanceof OnlineTransport})});
