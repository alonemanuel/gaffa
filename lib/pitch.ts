/** Pitch geometry and the measurements every layer shares. */

import type { Player, Team, Vec } from './types';

/** 7v7. Blue attacks toward x = L, red toward x = 0. */
export const PITCH = { L: 60, W: 40 } as const;

export const GOAL = {
  blue: { x: PITCH.L, y: PITCH.W / 2 }, // the goal blue attacks
  red: { x: 0, y: PITCH.W / 2 },
} as const;

/* --- ball physics --------------------------------------------------------
 * A rolling ball loses speed to the turf at a roughly constant rate and to
 * the air in proportion to v squared.
 */
export const ROLL = 0.9;
export const DRAG = 0.0115;
export const STOPPED = 0.3;
export const CONTROL_R = 1.35;

/* --- player speeds ------------------------------------------------------- */
export const JOG = 1.9;
export const RUN = 4.0;
export const SPRINT = 5.6;
export const DEADZONE = 1.3;

export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;
export const onPitch = (p: Vec, m = 1): Vec => ({
  x: clamp(p.x, m, PITCH.L - m),
  y: clamp(p.y, m, PITCH.W - m),
});

export const attackDir = (team: Team): number => (team === 'blue' ? 1 : -1);
export const other = (team: Team): Team => (team === 'blue' ? 'red' : 'blue');

/** Shortest distance from `p` to the segment a-b. Zero means standing on it. */
export const distToSegment = (p: Vec, a: Vec, b: Vec): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = clamp(t, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/**
 * How open the lane from `a` to `b` is: the distance of the closest opponent
 * to that line. A large number means nobody is in the way.
 */
export const laneClearance = (a: Vec, b: Vec, defenders: Player[]): number => {
  let best = Infinity;
  for (const d of defenders) {
    const m = distToSegment(d, a, b);
    if (m < best) best = m;
  }
  return best === Infinity ? 99 : best;
};

/** How far a ball struck at v0 travels before dying, and how long it takes. */
export const rollTo = (v0: number, d: number): { reached: boolean; t: number; v: number } => {
  let v = v0;
  let s = 0;
  let t = 0;
  const h = 1 / 120;
  while (s < d && v > STOPPED && t < 8) {
    v -= (ROLL + DRAG * v * v) * h;
    if (v < 0) v = 0;
    s += v * h;
    t += h;
  }
  return { reached: s >= d, t, v };
};

/** How hard to strike it so it covers d and is still doing `arrive` when it gets there. */
export const solveKick = (d: number, arrive: number): number => {
  let lo = 3;
  let hi = 32;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const r = rollTo(mid, d);
    if (!r.reached || r.v < arrive) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

/**
 * The earliest point on the ball's roll that a player can reach in time,
 * falling back to where it comes to rest. Used by a receiver to meet a pass.
 */
export const interceptPoint = (
  from: Vec,
  ball: { x: number; y: number; vx: number; vy: number },
  speed = SPRINT,
): { x: number; y: number; t: number } => {
  let v = Math.hypot(ball.vx, ball.vy);
  if (v < STOPPED) return { x: ball.x, y: ball.y, t: dist(from, ball) / speed };
  let x = ball.x;
  let y = ball.y;
  const ux = ball.vx / v;
  const uy = ball.vy / v;
  const h = 1 / 30;
  for (let t = 0; t < 5; t += h) {
    v = Math.max(0, v - (ROLL + DRAG * v * v) * h);
    x += ux * v * h;
    y += uy * v * h;
    if (Math.hypot(x - from.x, y - from.y) / speed <= t + 0.15) return { x, y, t };
    if (v <= STOPPED) break;
  }
  return { x, y, t: 5 };
};

export const timeToBall = (p: Player, ball: Vec): number => dist(p, ball) / SPRINT;
