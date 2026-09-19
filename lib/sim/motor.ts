/**
 * The motor layer: turning a chosen intent into a point on the grass and a
 * speed to get there at.
 *
 * Nothing here decides anything. Every branch is the geometric execution of an
 * intent that the decision model already picked. That division is deliberate:
 * judgment is asked, geometry is measured.
 */

import {
  GOAL,
  JOG,
  PITCH,
  RUN,
  SPRINT,
  attackDir,
  clamp,
  dist,
  interceptPoint,
  onPitch,
  other,
} from '../pitch';
import type { MatchState, Player, Vec } from '../types';

const byId = (s: MatchState, id: string | null): Player | null =>
  id ? (s.players.find((p) => p.id === id) ?? null) : null;

export const carrierOf = (s: MatchState): Player | null =>
  byId(s, s.ball.holder) ?? byId(s, s.ball.to);

const nearestOpponent = (s: MatchState, p: Player): Player | null => {
  let best: Player | null = null;
  let bd = Infinity;
  for (const q of s.players) {
    if (q.team === p.team || q.gk) continue;
    const d = dist(p, q);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best;
};

/** Their deepest defender, which is what a run in behind has to beat. */
const lastDefender = (s: MatchState, attacking: Player): Player | null => {
  const dir = attackDir(attacking.team);
  let best: Player | null = null;
  let bx = -Infinity;
  for (const q of s.players) {
    if (q.team === attacking.team || q.gk) continue;
    const depth = q.x * dir;
    if (depth > bx) {
      bx = depth;
      best = q;
    }
  }
  return best;
};

/** The whole block slides toward the ball. This is shape, not a decision. */
const shifted = (s: MatchState, p: Player): Vec => {
  const lead = p.gk ? 0.25 : 1;
  return onPitch(
    {
      x: p.anchor.x + (s.ball.x - PITCH.L / 2) * 0.22 * lead,
      y: p.anchor.y + (s.ball.y - PITCH.W / 2) * 0.32 * lead,
    },
    2,
  );
};

/** Push away from anyone standing within `r`, so bodies do not stack up. */
const unstack = (s: MatchState, p: Player, want: Vec, r = 4): Vec => {
  let { x, y } = want;
  for (const q of s.players) {
    if (q.id === p.id) continue;
    const d = Math.hypot(q.x - x, q.y - y);
    if (d < r && d > 0.01) {
      const k = (r - d) * 0.5;
      x += ((x - q.x) / d) * k;
      y += ((y - q.y) / d) * k;
    }
  }
  return onPitch({ x, y }, 1.5);
};

export interface MotorTarget {
  x: number;
  y: number;
  pace: number;
}

export const motorTarget = (s: MatchState, p: Player): MotorTarget => {
  const carrier = carrierOf(s);
  const base = shifted(s, p);
  const dir = attackDir(p.team);
  const ourGoal = p.team === 'blue' ? GOAL.red : GOAL.blue;
  const theirGoal = p.team === 'blue' ? GOAL.blue : GOAL.red;

  switch (p.intent) {
    case 'on_the_ball':
      // Standing still. Dribbling is not in this build.
      return { x: p.x, y: p.y, pace: 0 };

    case 'receive_the_pass': {
      const m = interceptPoint(p, s.ball);
      return { ...onPitch(m), pace: SPRINT };
    }

    case 'keep_goal': {
      const t = onPitch({ x: ourGoal.x + dir * 4, y: clamp(s.ball.y, 14, 26) }, 2);
      return { ...t, pace: JOG };
    }

    case 'press_the_ball': {
      const d = Math.max(dist(p, s.ball), 0.001);
      return {
        x: s.ball.x - ((s.ball.x - p.x) / d) * 1.6,
        y: s.ball.y - ((s.ball.y - p.y) / d) * 1.6,
        pace: RUN,
      };
    }

    case 'cover_behind': {
      // Between the ball and our own goal, a few metres back.
      const t = onPitch({
        x: s.ball.x + (ourGoal.x - s.ball.x) * 0.22,
        y: s.ball.y + (ourGoal.y - s.ball.y) * 0.22,
      });
      return { ...unstack(s, p, t), pace: RUN };
    }

    case 'mark_nearest': {
      const o = nearestOpponent(s, p);
      if (!o) return { ...base, pace: JOG };
      // Goal-side of him, close enough to step in but not standing on him.
      const gx = ourGoal.x - o.x;
      const gy = ourGoal.y - o.y;
      const g = Math.max(Math.hypot(gx, gy), 0.001);
      return { ...onPitch({ x: o.x + (gx / g) * 2.6, y: o.y + (gy / g) * 2.6 }), pace: RUN };
    }

    case 'block_lane': {
      // Stand on the line between the ball and the opponent nearest our goal
      // among those this player can plausibly cover.
      const o = nearestOpponent(s, p);
      if (!o || !carrier) return { ...base, pace: JOG };
      const t = onPitch({ x: (s.ball.x + o.x) / 2, y: (s.ball.y + o.y) / 2 });
      return { ...unstack(s, p, t, 3), pace: RUN };
    }

    case 'hold_shape':
      return { ...unstack(s, p, base), pace: JOG };

    case 'show_for_the_ball': {
      if (!carrier) return { ...base, pace: JOG };
      // Step off the man marking him, toward a spot about 12m from the ball.
      const o = nearestOpponent(s, p);
      let want: Vec = { ...base };
      if (o) {
        const d = Math.max(dist(p, o), 0.001);
        want = { x: want.x + ((p.x - o.x) / d) * 3.5, y: want.y + ((p.y - o.y) / d) * 3.5 };
      }
      const dc = Math.max(dist(want, carrier), 0.001);
      const k = (clamp(dc, 8, 14) - dc) * 0.8;
      want = { x: want.x + ((want.x - carrier.x) / dc) * k, y: want.y + ((want.y - carrier.y) / dc) * k };
      return { ...unstack(s, p, want), pace: RUN };
    }

    case 'run_in_behind': {
      const last = lastDefender(s, p);
      const beyond = last ? last.x + dir * 6 : p.x + dir * 10;
      const t = onPitch({ x: beyond, y: clamp(p.y + (theirGoal.y - p.y) * 0.25, 4, PITCH.W - 4) }, 2);
      return { ...t, pace: SPRINT };
    }

    case 'hold_width': {
      // Hug whichever touchline he already favours, level with the ball.
      const side = p.anchor.y < PITCH.W / 2 ? 4.5 : PITCH.W - 4.5;
      return { ...onPitch({ x: clamp(s.ball.x + dir * 4, 4, PITCH.L - 4), y: side }, 2), pace: JOG };
    }

    case 'drop_between_lines': {
      const last = lastDefender(s, p);
      const infront = last ? last.x - dir * 7 : p.x - dir * 4;
      const t = onPitch({ x: infront, y: p.y + (PITCH.W / 2 - p.y) * 0.3 }, 2);
      return { ...unstack(s, p, t), pace: RUN };
    }

    case 'hold_position':
    default:
      return { ...unstack(s, p, base), pace: JOG };
  }
};

/** Move everyone toward their target, under a speed and acceleration cap. */
export const moveAll = (s: MatchState, dt: number): void => {
  for (const p of s.players) {
    const dx = p.targetX - p.x;
    const dy = p.targetY - p.y;
    const d = Math.hypot(dx, dy);
    const dz = p.pace >= RUN ? 0.15 : 1.3;
    let wx = 0;
    let wy = 0;
    if (d > dz && p.pace > 0) {
      const want = Math.min(p.pace, (d - dz) * 1.6);
      wx = (dx / d) * want;
      wy = (dy / d) * want;
    }
    const k = Math.min(1, dt * 3);
    p.vx += (wx - p.vx) * k;
    p.vy += (wy - p.vy) * k;
    const next = onPitch({ x: p.x + p.vx * dt, y: p.y + p.vy * dt });
    p.x = next.x;
    p.y = next.y;
  }
};

export { nearestOpponent, lastDefender, shifted };
