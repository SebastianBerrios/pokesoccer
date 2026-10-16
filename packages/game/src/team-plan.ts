import { POKEMON } from './catalog.ts';
import type { Fighter, Formation, Lineup, PlayStyle, TacticalRole, TeamPlan, Vec } from './types.ts';

export interface Position extends Vec { label: string; role: TacticalRole; weights: readonly number[] }
// Coordinates describe positions within the block, independent of field side and ownership.
export const FORMATIONS: Record<Formation, readonly Position[]> = {
  '1-2-1': [
    { x: -.65, z: 0, label: 'Defensa', role: 'cover', weights: [0, 4, 0, 1] },
    { x: 0, z: -.65, label: 'Banda izquierda', role: 'left', weights: [2, 0, 1, 3] },
    { x: 0, z: .65, label: 'Banda derecha', role: 'right', weights: [2, 0, 1, 3] },
    { x: .6, z: 0, label: 'Ataque', role: 'forward', weights: [1, 0, 4, 0] },
  ],
  '2-2': [
    { x: -.5, z: -.45, label: 'Defensa izquierda', role: 'cover', weights: [0, 4, 0, 1] },
    { x: -.5, z: .45, label: 'Defensa derecha', role: 'cover', weights: [0, 4, 0, 1] },
    { x: .5, z: -.5, label: 'Ataque izquierdo', role: 'forward', weights: [1, 0, 4, 1] },
    { x: .5, z: .5, label: 'Ataque derecho', role: 'forward', weights: [1, 0, 4, 1] },
  ],
  '1-1-2': [
    { x: -.65, z: 0, label: 'Defensa', role: 'cover', weights: [0, 4, 0, 1] },
    { x: -.1, z: 0, label: 'Enlace', role: 'right', weights: [1, 1, 0, 4] },
    { x: .55, z: -.5, label: 'Ataque izquierdo', role: 'forward', weights: [1, 0, 4, 0] },
    { x: .55, z: .5, label: 'Ataque derecho', role: 'forward', weights: [1, 0, 4, 0] },
  ],
};
export const STYLE_LABELS: Record<PlayStyle, string> = { balanced: 'Equilibrado', possession: 'Posesión', counterattack: 'Contraataque' };
export const STYLE_DESCRIPTIONS: Record<PlayStyle, string> = {
  balanced: 'Amplitud, apoyos y cobertura detrás del balón.',
  possession: 'Triángulos cercanos y devolución para construir la jugada.',
  counterattack: 'Bloque bajo y salida vertical al recuperar.',
};
export function defaultTeamPlan(): TeamPlan { return { formation: '1-2-1', style: 'balanced', lineup: [0, 1, 2, 3] }; }
export function validFormation(value: unknown): value is Formation {
  return typeof value === 'string' && Object.hasOwn(FORMATIONS, value);
}
export function validStyle(value: unknown): value is PlayStyle {
  return typeof value === 'string' && Object.hasOwn(STYLE_LABELS, value);
}
export function validLineup(value: unknown): value is Lineup {
  return Array.isArray(value) && value.length === 4 && new Set(value).size === 4 && value.every(n => Number.isInteger(n) && n >= 0 && n < 4);
}
function permutations(values: number[]): number[][] {
  return values.length ? values.flatMap(v => permutations(values.filter(n => n !== v)).map(rest => [v, ...rest])) : [[]];
}
const ORDERS = permutations([0, 1, 2, 3]) as Lineup[];
export function automaticLineup(players: Fighter[], formation: Formation): Lineup {
  let best = ORDERS[0], score = -Infinity;
  for (const order of ORDERS) {
    const value = order.reduce((sum, slot, position) => {
      const stats = POKEMON[players.find(p => p.slot === slot)!.species].stats;
      return sum + FORMATIONS[formation][position].weights.reduce((n, weight, i) => n + weight * stats[i], 0);
    }, 0);
    if (value > score) { score = value; best = order; }
  }
  return [...best];
}
export function remapLineup(active: TeamPlan, formation: Formation): Lineup {
  if (active.formation === formation) return [...active.lineup];
  let best = ORDERS[0], cost = Infinity;
  for (const order of ORDERS) {
    const value = order.reduce((sum, slot, index) => {
      const old = FORMATIONS[active.formation][active.lineup.indexOf(slot)], next = FORMATIONS[formation][index];
      return sum + (old.x - next.x) ** 2 + (old.z - next.z) ** 2;
    }, 0);
    if (value < cost) { cost = value; best = order; }
  }
  return [...best];
}
export function positionFor(plan: TeamPlan, slot: number): Position {
  return FORMATIONS[plan.formation][plan.lineup.indexOf(slot)];
}
