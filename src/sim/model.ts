/**
 * The probability model. This file is the only "opinion" in the engine:
 * every outcome is computed from geometry here, never authored per scenario.
 */
import { add, clamp, dist, distToSegment, norm, scale, sub, type Vec } from './vec';
import { PITCH, type Player, type State, type Team } from './types';

export const attackDir = (team: Team): number => (team === 'us' ? 1 : -1);

export const opponentsOf = (s: State, team: Team): Player[] => s.players.filter((p) => p.team !== team);
export const teammatesOf = (s: State, team: Team): Player[] => s.players.filter((p) => p.team === team);

export const nearestOpponent = (s: State, pos: Vec, team: Team): { player: Player; d: number } => {
  let best: Player | null = null;
  let bestD = Infinity;
  for (const p of s.players) {
    if (p.team === team) continue;
    const d = dist(p.pos, pos);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  if (!best) throw new Error('no opponents');
  return { player: best, d: bestD };
};

/** 1 when an opponent is on top of you, 0 when the nearest is 8m+ away. */
export const pressureAt = (s: State, pos: Vec, team: Team): number => {
  const { d } = nearestOpponent(s, pos, team);
  return clamp(1 - d / 6, 0, 1);
};

/**
 * Probability that no defender gets a foot to a ball travelling from -> to.
 * Longer passes are in the air longer, so the interception radius grows with distance.
 */
export const laneOpenness = (s: State, from: Vec, to: Vec, team: Team): number => {
  const d = dist(from, to);
  const r = 1.3 + 0.06 * d;
  let open = 1;
  for (const def of s.players) {
    if (def.team === team) continue;
    const { d: dl, t } = distToSegment(def.pos, from, to);
    if (t < 0.08 || t > 0.97) continue;
    open *= 1 - 0.92 * Math.exp(-(dl * dl) / (r * r));
  }
  return open;
};

export const passProb = (s: State, passer: Player, receiver: Player): number => {
  const d = dist(passer.pos, receiver.pos);
  const pDist = d < 8 ? 0.97 : Math.max(0.3, 0.97 - 0.011 * (d - 8));
  const lane = laneOpenness(s, passer.pos, receiver.pos, passer.team);
  const recv = 1 - 0.3 * pressureAt(s, receiver.pos, receiver.team);
  const pass = 1 - 0.25 * pressureAt(s, passer.pos, passer.team);
  return clamp(pDist * lane * recv * pass, 0.02, 0.98);
};

export const clampToPitch = (p: Vec, margin = 1): Vec => ({
  x: clamp(p.x, margin, PITCH.L - margin),
  y: clamp(p.y, margin, PITCH.W - margin),
});

/** Where a dribble takes the carrier: forward, bending away from the nearest presser. */
export const dribbleTarget = (s: State, carrier: Player): Vec => {
  const { player: presser } = nearestOpponent(s, carrier.pos, carrier.team);
  const forward = { x: attackDir(carrier.team), y: 0 };
  const away = norm(sub(carrier.pos, presser.pos));
  const dir = norm(add(forward, scale(away, 0.8)));
  return clampToPitch(add(carrier.pos, scale(dir, 8)), 1.5);
};

export const dribbleProb = (s: State, carrier: Player): number => {
  const opps = opponentsOf(s, carrier.team)
    .map((p) => dist(p.pos, carrier.pos))
    .sort((a, b) => a - b);
  const d1 = opps[0] ?? 99;
  const d2 = opps[1] ?? 99;
  let p = 0.25 + 0.5 * clamp(d1 / 7, 0, 1);
  p *= 0.6 + 0.4 * clamp((d2 - 3) / 8, 0, 1);
  const target = dribbleTarget(s, carrier);
  const spaceAhead = nearestOpponent(s, target, carrier.team).d;
  p *= 0.7 + 0.3 * clamp(spaceAhead / 6, 0, 1);
  return clamp(p, 0.05, 0.92);
};

// ---- Value of terminal states, from the holding team's point of view. Range roughly [-1, 1]. ----

export const CHANCE_VALUE = 1;

/** Metres advanced from the team's own goal line. */
export const progressOf = (pos: Vec, team: Team): number => (team === 'us' ? pos.x : PITCH.L - pos.x);

/** Losing the ball is worse the closer to your own goal it happens. */
export const lossValue = (ballPos: Vec, team: Team = 'us'): number => {
  const danger = clamp(1 - progressOf(ballPos, team) / 35, 0, 1);
  return -(0.25 + 0.75 * danger);
};

/** Still in possession at the end of the horizon: reward progress and calm. */
export const retainValue = (s: State, holder: Player): number => {
  const prog = clamp((progressOf(s.ball, holder.team) - 8) / 45, 0, 1);
  const calm = 1 - pressureAt(s, holder.pos, holder.team);
  return 0.15 + 0.65 * prog + 0.2 * calm;
};

export const goalOf = (team: Team): Vec => (team === 'us' ? { x: PITCH.L, y: PITCH.W / 2 } : { x: 0, y: PITCH.W / 2 });

export const inShootingRange = (s: State, shooter: Player): boolean =>
  progressOf(shooter.pos, shooter.team) > 42 && pressureAt(s, shooter.pos, shooter.team) < 0.6;

export const shotProb = (s: State, shooter: Player): number => {
  const d = dist(shooter.pos, goalOf(shooter.team));
  const p = clamp(0.55 - d / 40, 0.08, 0.5);
  return p * (1 - 0.4 * pressureAt(s, shooter.pos, shooter.team));
};

export const clearValue = (s: State): number => {
  const holder = s.holder ? s.players.find((p) => p.id === s.holder) : null;
  return holder?.team === 'us' ? 0.15 : -0.15;
};

/** Carrier in the final third with room: we count that as a chance created. */
export const isChance = (s: State, holder: Player): boolean =>
  progressOf(holder.pos, holder.team) > 46 && pressureAt(s, holder.pos, holder.team) < 0.35;

export const isDangerZone = (ballPos: Vec, team: Team = 'us'): boolean => progressOf(ballPos, team) < 25;
