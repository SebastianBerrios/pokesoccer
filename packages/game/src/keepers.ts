import { distance, segmentDistance, unit } from './math.ts';
import { passBall, passTarget } from './ball.ts';
import { attackDirection, byId, endKeeperPossession } from './state.ts';
import { PACE_PROFILES } from './tuning.ts';
import { setAction } from './state.ts';
import type { Fighter, InputFrame, MatchState, Vec } from './types.ts';

export function visibleRivals(s: MatchState, p: Fighter) {
  return s.players.filter(q => q.team !== p.team);
}
export function laneClearance(s: MatchState, p: Fighter, target: Vec): number {
  return Math.min(20, ...visibleRivals(s, p).map(q => segmentDistance(q, p, target)));
}
export function safeKeeperTarget(s: MatchState, p: Fighter): Fighter | undefined {
  const dir = attackDirection(s, p.team);
  return s.players.filter(q => q.team === p.team && !q.keeper && q.stun <= 0 &&
    dir * (q.x - p.x) > 2 && laneClearance(s, p, q) > 2.4 &&
    visibleRivals(s, p).every(r => distance(q, r) > 3))
    .sort((a, b) => (laneClearance(s, p, b) - distance(p, b) * .08) -
      (laneClearance(s, p, a) - distance(p, a) * .08) || a.id.localeCompare(b.id))[0];
}
export function distributeKeeper(s: MatchState, p: Fighter, action: 'pass' | 'lob' | 'clear', target?: Fighter) {
  if (s.keeperPossession?.keeperId !== p.id || s.ball.owner !== p.id) return;
  p.actionCd = 0;
  if (action === 'clear') {
    const v = unit(p.facingX, p.facingZ), b = s.ball;
    Object.assign(b, { owner: null, x: p.x + v.x * .95, z: p.z + v.z * .95, y: .7,
      vx: v.x * 29 * PACE_PROFILES[s.settings.pace].ball, vz: v.z * 29 * PACE_PROFILES[s.settings.pace].ball, vy: 7, pickupLock: .25, lastTouch: p.id,
      lastTeam: p.team, passer: null, passSession: null, passTarget: null, shot: false, curve: 0, fiery: 0 });
    p.anim = 'kick';setAction(s,p,'pass',.4);
    endKeeperPossession(s);
  } else {
    const receiver = target ?? passTarget(s, p);
    passBall(s, p, action === 'lob', receiver);
    endKeeperPossession(s, receiver);
  }
  p.aiTimer = .5;
}
export function automaticDistribution(s: MatchState, p: Fighter) {
  const target = safeKeeperTarget(s, p);
  if (target) distributeKeeper(s, p, 'pass', target);
  else {
    const dir = attackDirection(s, p.team);
    const options = [-.8, .8, 0].map(z => unit(dir, z));
    options.sort((a, b) => laneClearance(s, p, {x:p.x+b.x*20,z:p.z+b.z*20}) -
      laneClearance(s, p, {x:p.x+a.x*20,z:p.z+a.z*20}));
    p.facingX = options[0].x; p.facingZ = options[0].z;
    distributeKeeper(s, p, 'clear');
  }
}
export function keeperInput(s: MatchState, p: Fighter, input: InputFrame, previous: InputFrame) {
  const hold = s.keeperPossession;
  if (!hold || hold.keeperId !== p.id || s.ball.owner !== p.id) return;
  if (Math.hypot(input.moveX, input.moveZ) > .1) {
    const v = unit(input.moveX, input.moveZ); p.facingX = v.x; p.facingZ = v.z;
  }
  hold.targetId = passTarget(s, p)?.id ?? null;
  if (input.pass && !previous.pass) distributeKeeper(s, p, 'pass');
  else if (input.lob && !previous.lob) distributeKeeper(s, p, 'lob');
  else if (input.shoot && !previous.shoot) distributeKeeper(s, p, 'clear');
}
export function updateKeeperPossession(s: MatchState) {
  const hold = s.keeperPossession;
  if (!hold) return;
  const p = byId(s, hold.keeperId);
  if (!p || s.ball.owner !== p.id || !['playing', 'overtime'].includes(s.phase)) {endKeeperPossession(s); return;}
  hold.remaining = Math.max(0, 8 - (s.time - hold.capturedAt));
  hold.targetId = passTarget(s, p)?.id ?? null;
  if (hold.remaining <= 0 || !p.controller && s.time - hold.capturedAt >= 1) automaticDistribution(s, p);
}
