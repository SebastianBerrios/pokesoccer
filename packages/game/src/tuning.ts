import type { Difficulty, MatchState, Pace, Team } from './types.ts';

export const REGULATION_SECONDS = 180;
export const OVERTIME_SECONDS = 120;
export const PACE_PROFILES = {
  slow: { movement: .55, ball: .8, impulse: .7, simpleCooldown: 8, orbInterval: 45, itemInterval: 30 },
  balanced: { movement: .65, ball: .9, impulse: .85, simpleCooldown: 7, orbInterval: 40, itemInterval: 25 },
  fast: { movement: .8, ball: 1, impulse: 1, simpleCooldown: 6, orbInterval: 35, itemInterval: 20 },
} as const satisfies Record<Pace, object>;

export const BOT_PROFILES = {
  easy: { reaction: [.4, .6], tackleChance: .38, tackleCooldown: 1.5, shotError: 5, pressDistance: 3.4, powerChance: .38, powerGap: 1.4 },
  normal: { reaction: [.22, .34], tackleChance: .7, tackleCooldown: 1.05, shotError: 2, pressDistance: 1.8, powerChance: .7, powerGap: .9 },
  hard: { reaction: [.12, .2], tackleChance: .95, tackleCooldown: .7, shotError: .6, pressDistance: 1.1, powerChance: .95, powerGap: .5 },
} as const;

export function botDifficulty(s: MatchState, team: Team): Difficulty {
  return s.mode === 'solo' && s.humans.some(h => h.team === team && h.connected)
    ? 'normal' : s.settings.difficulty;
}
