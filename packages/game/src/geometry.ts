import { clamp } from './math.ts';
import type { Vec } from './types.ts';

export const FIELD = {
  halfWidth: 30, halfDepth: 18, goalHalf: 3.6, goalHeight: 3.2,
  areaDepth: 8, areaHalf: 6, playerRadius: .65, ballRadius: .3, keeperInset: 1.8,
} as const;
export function fieldPoint(point: Vec, margin: number = FIELD.playerRadius): Vec {
  return { x: clamp(point.x, -FIELD.halfWidth + margin, FIELD.halfWidth - margin),
    z: clamp(point.z, -FIELD.halfDepth + margin, FIELD.halfDepth - margin) };
}
export function inArea(point: Vec, direction: number, margin = 0): boolean {
  return -direction * point.x > FIELD.halfWidth - FIELD.areaDepth - margin && Math.abs(point.z) < FIELD.areaHalf + margin;
}
export function areaExit(point: Vec, direction: number): Vec {
  const x = -direction * (FIELD.halfWidth - FIELD.areaDepth - FIELD.playerRadius - .05);
  const z = (point.z < 0 ? -1 : 1) * (FIELD.areaHalf + FIELD.playerRadius + .05);
  return Math.abs(point.x - x) <= Math.abs(point.z - z) ? { x, z: point.z } : { x: point.x, z };
}
