import type { Ability, AbilityKind, Pokemon, Species } from './types.ts';
function a(name: string, description: string, kind: AbilityKind, color: string, options: Partial<Ability> = {}): Ability {
  return { name, description, kind, color, range: 8, radius: 3, duration: 3, power: kind==='zone'?0:6, ...options };
}
const electric = '#ffd84c', fire = '#ff793f', water = '#56caff', grass = '#87e68a';
const ghost = '#c296ff', fighting = '#edaa83', psychic = '#ff8ed9', ice = '#a4edee';
export const ROSTER: Pokemon[] = [
  { id: 'pikachu', name: 'Pikachu', type: 'Eléctrico', color: '#f9ce42', accent: '#8d4c32', role: 'Veloz', stats: [5,1,3,3],
    abilities: [a('Impulso eléctrico','Acelera y escapa de la marca.','dash',electric,{range:4}),
      a('Descarga','Aturde brevemente en un cono frontal.','push',electric,{range:5,stun:.65}),
      a('Trueno','Golpea una zona anunciada frente a ti.','zone',electric,{range:6,radius:4,duration:2,stun:.8})] },
  { id: 'charizard', name: 'Charizard', type: 'Fuego · Volador', color: '#ef8647', accent: '#348e9b', role: 'Artillero', stats: [2,3,5,2],
    abilities: [a('Aleteo','Aparta a los rivales frente a ti.','push',fire,{range:4}),
      a('Lanzallamas','Deja una franja que ralentiza rivales.','zone',fire,{range:4,radius:3,duration:4,slow:.35}),
      a('Tiro ígneo','Disparo potente con una estela de fuego.','shot',fire,{power:1.4,trail:true})] },
  { id: 'blastoise', name: 'Blastoise', type: 'Agua', color: '#679ccc', accent: '#ccad7e', role: 'Defensor', stats: [2,5,2,3],
    abilities: [a('Chorro','Empuja al rival o a una pelota libre.','projectile',water,{range:10,power:7}),
      a('Caparazón','Bloquea el siguiente golpe.','shield',water,{duration:5}),
      a('Surf','Una ola desplaza rivales y pelota libre.','projectile',water,{radius:3.5,range:22,power:11})] },
  { id: 'venusaur', name: 'Venusaur', type: 'Planta · Veneno', color: '#6caf8e', accent: '#ef8597', role: 'Apoyo', stats: [3,2,2,5],
    abilities: [a('Látigo cepa','Atrae una pelota libre cercana.','pull',grass,{range:9}),
      a('Polvo venenoso','Crea una zona que frena a los rivales.','zone',ghost,{range:4,radius:3.5,slow:.35,duration:4}),
      a('Jardín','Acelera aliados y ralentiza rivales.','zone',grass,{range:0,radius:6,duration:6,slow:.3,allySpeed:1})] },
  { id: 'gengar', name: 'Gengar', type: 'Fantasma · Veneno', color: '#9878bb', accent: '#dc6386', role: 'Veloz', stats: [5,1,3,3],
    abilities: [a('Paso sombra','Desplazamiento corto, solo sin pelota.','blink',ghost,{range:4}),
      a('Bola sombra','Proyectil que hace soltar la pelota.','projectile',ghost,{range:14,power:7,stun:.4}),
      a('Campo espectral','Los rivales en la zona no pueden esprintar.','zone',ghost,{range:5,radius:6,duration:6,noSprint:true,slow:.15})] },
  { id: 'machamp', name: 'Machamp', type: 'Lucha', color: '#97b2b3', accent: '#caac61', role: 'Defensor', stats: [2,5,2,3],
    abilities: [a('Puñetazo','Empuja al rival más cercano al frente.','push',fighting,{range:3,power:8}),
      a('Guardia','Resiste entradas durante unos segundos.','buff',fighting,{duration:4}),
      a('Ráfaga','Aparta rivales con un fuerte golpe en cono.','push',fighting,{range:7,power:13,stun:.8})] },
  { id: 'alakazam', name: 'Alakazam', type: 'Psíquico', color: '#e9c165', accent: '#956452', role: 'Apoyo', stats: [3,2,2,5],
    abilities: [a('Teletransporte','Desplazamiento corto sin pelota.','blink',psychic,{range:4}),
      a('Barrera','Refleja un tiro o proyectil.','wall',psychic,{range:3,radius:2.5,duration:4}),
      a('Psicoquinesis','Redirige una pelota libre hacia donde miras.','redirect',psychic,{range:14})] },
  { id: 'snorlax', name: 'Snorlax', type: 'Normal', color: '#4d858d', accent: '#ead9ad', role: 'Defensor', stats: [2,5,2,3],
    abilities: [a('Placaje','Avanza y empuja a los rivales.','dash',fighting,{range:3,power:9}),
      a('Bloqueo corporal','Más resistencia a cambio de velocidad.','buff',fighting,{duration:5}),
      a('Golpe corporal','Aterrizaje anunciado con empuje radial.','zone',fighting,{range:2,radius:5,duration:.6,power:12,stun:.8})] },
  { id: 'lapras', name: 'Lapras', type: 'Agua · Hielo', color: '#76c0d5', accent: '#bec8d4', role: 'Apoyo', stats: [3,2,2,5],
    abilities: [a('Vaho helado','Enfría y ralentiza frente a ti.','push',ice,{range:5,slow:.3,power:2}),
      a('Muro de hielo','Una barrera bloquea temporalmente el paso.','wall',ice,{range:3,radius:2.5,duration:4}),
      a('Ventisca','Congela brevemente y ralentiza una zona.','zone',ice,{range:5,radius:5,duration:5,stun:.65,slow:.4})] },
  { id: 'dragonite', name: 'Dragonite', type: 'Dragón · Volador', color: '#e9b36d', accent: '#72ad9c', role: 'Equilibrado', stats: [3,3,3,3],
    abilities: [a('Ráfaga de alas','Empuja a los rivales cercanos.','push',water,{range:4,power:6}),
      a('Danza dragón','Mejora tu movimiento y tus tiros.','buff',fire,{duration:5}),
      a('Tiro dracónico','Disparo potente con curva.','shot',fire,{power:1.25,curve:1.2})] },
  { id: 'lucario', name: 'Lucario', type: 'Lucha · Acero', color: '#579ac1', accent: '#e3cda5', role: 'Equilibrado', stats: [3,3,3,3],
    abilities: [a('Puño bala','Avanza para robar la pelota.','dash',ice,{range:3,power:7}),
      a('Defensa férrea','Resiste empujes y entradas.','buff',ice,{duration:5}),
      a('Esfera aural','Proyectil grande que desarma al primer rival.','projectile',water,{range:24,radius:2,power:12,stun:.8})] },
  { id: 'greninja', name: 'Greninja', type: 'Agua · Siniestro', color: '#578eac', accent: '#ee9aaa', role: 'Veloz', stats: [5,1,3,3],
    abilities: [a('Burbuja','Un proyectil que ralentiza.','projectile',water,{range:10,power:2,slow:.3}),
      a('Shuriken de agua','Tres proyectiles en abanico.','projectile',water,{range:14,count:3,slow:.25,power:4}),
      a('Manto nocturno','Oculta brevemente al equipo. La pelota sigue visible.','cloak',ghost,{duration:4,range:99})] }
];
export const POKEMON = Object.fromEntries(ROSTER.map(p => [p.id,p])) as Record<Species,Pokemon>;
export const DEFAULT_TEAMS: [Species[],Species[]] = [
  ['pikachu','charizard','blastoise','venusaur'],
  ['greninja','gengar','lucario','snorlax']
];
export { FIELD } from './geometry.ts';
export const TICK_RATE = 30;
export const ITEM_LABELS = { berry:'Baya veloz', shield:'Escudo', bomb:'Bomba de empuje', orb:'Energía especial' };
