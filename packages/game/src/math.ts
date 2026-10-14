import type { Vec } from './types.ts';
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const length = (v: Vec) => Math.hypot(v.x, v.z);
export const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z);
export function unit(x: number, z: number): Vec {
  const n = Math.hypot(x, z);
  return n > 0.0001 ? { x: x / n, z: z / n } : { x: 1, z: 0 };
}
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function segmentDistance(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
