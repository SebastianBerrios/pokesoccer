export type Team = 0 | 1;
export type Species = 'pikachu' | 'charizard' | 'blastoise' | 'venusaur' | 'gengar' | 'machamp' | 'alakazam' | 'snorlax' | 'lapras' | 'dragonite' | 'lucario' | 'greninja' | 'ditto';
export type Phase = 'lobby' | 'kickoff' | 'playing' | 'goal' | 'halftime' | 'overtime' | 'finished';
export type Item = 'berry' | 'shield' | 'bomb';
export type AbilityKind = 'dash' | 'push' | 'projectile' | 'zone' | 'shield' | 'pull' | 'blink' | 'wall' | 'redirect' | 'buff' | 'shot' | 'cloak';
export interface Ability {
  name: string; description: string; kind: AbilityKind;
  color: string; range: number; radius: number; duration: number;
  power?: number; slow?: number; stun?: number; count?: number;
  allySpeed?: number; noSprint?: boolean; curve?: number; trail?: boolean;
}
export interface Pokemon {
  id: Species; name: string; type: string; color: string; accent: string;
  role: string; stats: [number, number, number, number]; abilities: [Ability, Ability, Ability];
}
export interface Vec { x: number; z: number }
export interface InputFrame {
  seq: number; epoch: number; moveX: number; moveZ: number;
  pass: boolean; lob: boolean; shoot: boolean; dodge: boolean; sprint: boolean;
  switch: boolean; simple: boolean; normal: boolean; special: boolean; item: boolean;
}
export interface Fighter extends Vec {
  id: string; team: Team; slot: number; species: Species; keeper: boolean;
  vx: number; vz: number; facingX: number; facingZ: number;
  controller: string | null; epoch: number;
  stamina: number; simpleCd: number; normal: number; special: number; item: Item | null;
  stun: number; immunity: number; slow: number; slowTime: number;
  shield: number; boost: number; buff: number; cloak: number; noSprint: number;
  actionCd: number; dodgeTime: number; charge: number;
  cast: number; castSlot: number; castX: number; castZ: number;
  aiTimer: number; aiX: number; aiZ: number; aiShoot: boolean; aiSprint: boolean;
  passCredit: number; anim: string;
}
export interface Ball extends Vec {
  y: number; vx: number; vy: number; vz: number;
  owner: string | null; lastTouch: string | null; passer: string | null;
  passSession: string | null; passTarget: string | null; shot: boolean;
  pickupLock: number; curve: number; fiery: number; lastTeam: Team | null;
}
export interface Effect extends Vec {
  id: number; owner: string; team: Team; kind: 'projectile' | 'zone' | 'wall' | 'burst' | 'warning';
  color: string; vx: number; vz: number; radius: number; life: number; maxLife: number;
  power: number; slow: number; stun: number; allySpeed: number; noSprint: boolean;
  hits: string[]; reflect: boolean; trail: boolean;
}
export interface Pickup extends Vec { id: number; kind: Item | 'orb'; life: number }
export interface GameEvent { id: number; kind: string; text: string; team?: Team; actor?: string }
export interface Human {
  id: string; name: string; team: Team; fighterId: string; ready: boolean;
  connected: boolean; captain: boolean;
}
export type Pace = 'slow' | 'balanced' | 'fast';
export type Difficulty = 'easy' | 'normal' | 'hard';
export interface MatchSettings { pace: Pace; difficulty: Difficulty }
export type TacticalRole = 'cover' | 'left' | 'right' | 'forward' | 'press' | 'carrier';
export interface TeamTactics { focus: Vec; presser: string | null; collector: string | null; roles: Record<string, TacticalRole>; targets: Record<string, Vec> }
export interface KeeperPossession {
  keeperId: string; capturedAt: number; remaining: number; controller: string | null;
  previousFighterId: string | null; targetId: string | null; retreat: Record<string, Vec>;
}
export interface MatchState {
  settings: MatchSettings; keeperPossession: KeeperPossession | null; tactics: [TeamTactics, TeamTactics];
  version: 1; tick: number; time: number; phase: Phase; remaining: number; phaseTime: number;
  half: number; score: [number, number]; players: Fighter[]; ball: Ball;
  effects: Effect[]; pickups: Pickup[]; humans: Human[]; host: string | null;
  events: GameEvent[]; seed: number; nextId: number; orbTimer: number; itemTimer: number;
  possession: Team | null; regulation: number; overtime: number; winner: Team | null;
}
export type ClientMessage =
  | { type: 'create'; name: string; team: Team }
  | { type: 'join'; code: string; name: string; team: Team }
  | { type: 'reconnect'; code: string; token: string }
  | { type: 'input'; input: InputFrame }
  | { type: 'choose'; slot: number; species: Species }
  | { type: 'team'; team: Team }
  | { type: 'ready'; ready: boolean }
  | { type: 'configure'; settings: MatchSettings }
  | { type: 'start' | 'rematch' | 'leave' }
  | { type: 'ping'; at: number };
export type ServerMessage =
  | { type: 'welcome'; id: string; code: string; token: string }
  | { type: 'state'; state: MatchState; ack: number; serverAt: number }
  | { type: 'error'; message: string; fatal?: boolean }
  | { type: 'pong'; at: number };
export interface GameTransport {
  onState: (state: MatchState, ack: number) => void;
  onStatus: (message: string) => void;
  sessionId: string; code: string;
  send(message: ClientMessage): void;
  close(): void;
}
