/**
 * Movement policies for the 12 players who are not making the decision.
 * Defenders pick roles by utility (press / cover / mark); attackers hunt for
 * receivable positions. One call = one tick (~1s of football).
 */
import { add, angleOf, clamp, dist, lerp, moveToward, norm, scale, sub, type Vec } from './vec';
import { attackDir, clampToPitch, laneOpenness, nearestOpponent } from './model';
import { PITCH, playerById, type Player, type State, type Team } from './types';
import { range, type Rng } from './rng';

const SPEED = { press: 3.8, cover: 3.2, mark: 3, support: 3.8 } as const;
const PRESS_STOP = 1.5;

const jitter = (rng: Rng, p: Vec, amt: number): Vec => ({
  x: p.x + range(rng, -amt, amt),
  y: p.y + range(rng, -amt, amt),
});

const face = (p: Player, toward: Vec): void => {
  const d = sub(toward, p.pos);
  if (Math.hypot(d.x, d.y) > 0.2) p.facing = angleOf(d);
};

export const stepDefenders = (s: State, rng: Rng, dt = 1): void => {
  if (!s.holder) return;
  const holder = playerById(s, s.holder);
  const holding: Team = holder.team;
  const dir = attackDir(holding);
  const ball = s.ball;

  const beaten = s.beaten ?? null;
  const defs = s.players
    .filter((p) => p.team !== holding && p.role !== 'GK' && p.id !== beaten)
    .sort((a, b) => dist(a.pos, ball) - dist(b.pos, ball));
  const recovering = s.players.find((p) => p.id === beaten);
  if (recovering) {
    recovering.pos = moveToward(recovering.pos, ball, SPEED.press * 0.4 * dt);
    face(recovering, ball);
  }
  s.beaten = null;
  const attackers = s.players.filter((p) => p.team === holding && p.role !== 'GK' && p.id !== holder.id);

  const presser = defs[0];
  if (presser) {
    const target = moveToward(presser.pos, ball, SPEED.press * dt);
    presser.pos = dist(target, ball) < PRESS_STOP ? add(ball, scale(norm(sub(presser.pos, ball)), PRESS_STOP)) : target;
    face(presser, ball);
  }

  const marked = new Set<string>();
  const cover = defs[1];
  if (cover) {
    const forwardOptions = attackers
      .filter((a) => (a.pos.x - ball.x) * dir > -2)
      .sort((a, b) => dist(a.pos, ball) - dist(b.pos, ball));
    const option = forwardOptions[0];
    if (option) {
      cover.pos = moveToward(cover.pos, jitter(rng, lerp(ball, option.pos, 0.55), 0.5), SPEED.cover * dt);
      marked.add(option.id);
    }
    face(cover, ball);
  }

  for (const def of defs.slice(2)) {
    let best: Player | null = null;
    let bestD = Infinity;
    for (const a of attackers) {
      if (marked.has(a.id)) continue;
      const d = dist(a.pos, def.pos);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    if (best) {
      marked.add(best.id);
      // Mark goal-side (toward the goal we defend), leaning slightly toward the ball.
      const toGoal = { x: dir, y: 0 };
      const toBall = norm(sub(ball, best.pos));
      const spot = add(best.pos, scale(norm(add(scale(toGoal, 0.65), scale(toBall, 0.35))), 2.8));
      def.pos = moveToward(def.pos, jitter(rng, spot, 0.5), SPEED.mark * dt);
    } else {
      def.pos = moveToward(def.pos, lerp(def.anchor, ball, 0.3), SPEED.mark * dt);
    }
    face(def, ball);
  }

  const gk = s.players.find((p) => p.team !== holding && p.role === 'GK');
  if (gk) {
    gk.pos = { x: gk.anchor.x, y: lerp(gk.anchor, ball, 0.3).y };
    face(gk, ball);
  }
};

const DIRS = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);

/** Where each supporting attacker wants to be this tick (decided once per tick). */
export const planAttackers = (s: State, rng: Rng): Map<string, Vec> => {
  const targets = new Map<string, Vec>();
  if (!s.holder) return targets;
  const holder = playerById(s, s.holder);
  const team = holder.team;
  const dir = attackDir(team);

  for (const p of s.players) {
    if (p.team !== team || p.id === holder.id) continue;
    if (p.role === 'GK') {
      targets.set(p.id, { x: p.anchor.x, y: lerp(p.anchor, s.ball, 0.35).y });
      continue;
    }
    const radius = range(rng, 3, 4.2);
    const candidates: Vec[] = [p.pos, ...DIRS.map((a) => add(p.pos, { x: Math.cos(a) * radius, y: Math.sin(a) * radius }))];
    let best = p.pos;
    let bestScore = -Infinity;
    for (const raw of candidates) {
      const c = clampToPitch(raw, 1.5);
      const lane = laneOpenness(s, holder.pos, c, team);
      const space = clamp(nearestOpponent(s, c, team).d / 6, 0, 1);
      const score =
        lane * (0.35 + 0.65 * space) - 0.025 * dist(c, p.anchor) + 0.006 * (c.x - p.pos.x) * dir + range(rng, 0, 0.02);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    targets.set(p.id, best);
  }
  return targets;
};

/** Move attackers toward their planned spots for a fraction of a tick. */
export const moveAttackers = (s: State, targets: Map<string, Vec>, dt = 1): void => {
  for (const p of s.players) {
    const target = targets.get(p.id);
    if (!target) continue;
    p.pos = moveToward(p.pos, target, (p.role === 'GK' ? 3 : SPEED.support) * dt);
    face(p, s.ball);
  }
};

export const stepAttackers = (s: State, rng: Rng, dt = 1): void => {
  moveAttackers(s, planAttackers(s, rng), dt);
};

export const inPitch = (p: Vec): boolean => p.x >= 0 && p.x <= PITCH.L && p.y >= 0 && p.y <= PITCH.W;
