/**
 * A resolution's motion, recorded as keyframe tracks so playback follows what
 * actually happened in the sim instead of interpolating two end states.
 * Times are seconds of football; the UI chooses how slowly to play them.
 */
import { dist, lerp, type Vec } from './vec';

export interface Keyframe<T> {
  t: number;
  v: T;
}

export interface BallKey {
  pos: Vec;
  /** The leg starting at this key is in the air. */
  loft?: boolean;
}

export interface Timeline {
  duration: number;
  ball: Keyframe<BallKey>[];
  /** Positions indexed like State.players. */
  players: Keyframe<Vec[]>[];
}

export interface Sample {
  players: Vec[];
  facings: (number | null)[];
  ball: Vec;
  z: number;
}

const bracket = <T>(kfs: Keyframe<T>[], t: number): { a: Keyframe<T>; b: Keyframe<T>; u: number } => {
  const first = kfs[0];
  const last = kfs[kfs.length - 1];
  if (!first || !last) throw new Error('empty track');
  if (t <= first.t) return { a: first, b: first, u: 0 };
  if (t >= last.t) return { a: last, b: last, u: 0 };
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (a && b && t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      return { a, b, u: span < 1e-6 ? 0 : (t - a.t) / span };
    }
  }
  return { a: last, b: last, u: 0 };
};

const smooth = (u: number): number => u * u * (3 - 2 * u);

export const sampleTimeline = (tl: Timeline, t: number): Sample => {
  const pb = bracket(tl.players, t);
  const players = pb.a.v.map((p, i) => lerp(p, pb.b.v[i] ?? p, pb.u));
  const bb = bracket(tl.ball, t);
  // A struck ball leaves fast and slows as it rolls; lofted balls fly evenly.
  const roll = bb.a.v.loft ? bb.u : 1 - Math.pow(1 - bb.u, 1.8);
  const ball = lerp(bb.a.v.pos, bb.b.v.pos, roll);
  const z = bb.a.v.loft && bb.a !== bb.b ? Math.sin(Math.PI * smooth(bb.u)) : 0;
  // Facing from velocity over a short look-back; null when standing still.
  const back = Math.max(0, t - 0.12);
  const pp = bracket(tl.players, back);
  const facings = players.map((p, i) => {
    const prev = lerp(pp.a.v[i] ?? p, pp.b.v[i] ?? p, pp.u);
    return dist(prev, p) > 0.04 ? Math.atan2(p.y - prev.y, p.x - prev.x) : null;
  });
  return { players, facings, ball, z: Math.max(0, Math.min(1, z)) };
};
