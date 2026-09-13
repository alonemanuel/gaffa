import { add, clamp, dist, distToSegment, lerp, norm, scale, sub, type Vec } from './vec';
import { chance, range, type Rng } from './rng';
import {
  attackDir,
  clampToPitch,
  dribbleProb,
  dribbleTarget,
  goalOf,
  inShootingRange,
  isChance,
  lossValue,
  nearestOpponent,
  opponentsOf,
  passProb,
  pressureAt,
  progressOf,
  shotProb,
  teammatesOf,
} from './model';
import { moveAttackers, planAttackers, stepDefenders } from './policy';
import type { Timeline } from './timeline';
import {
  cloneState,
  nameOf,
  playerById,
  sentence,
  shortName,
  type Action,
  type Player,
  type Resolution,
  type State,
  PITCH,
} from './types';

export const availableActions = (s: State, carrierId: string): Action[] => {
  const carrier = playerById(s, carrierId);
  const passes: Action[] = teammatesOf(s, carrier.team)
    .filter((p) => p.id !== carrierId)
    .map((p) => ({ kind: 'pass', to: p.id }));
  return [...passes, { kind: 'dribble' }, { kind: 'clear' }];
};

export const actionLabel = (s: State, a: Action): string => {
  if (a.kind === 'pass') return `Pass to ${shortName(playerById(s, a.to))}`;
  if (a.kind === 'dribble') {
    const carrier = s.holder ? playerById(s, s.holder) : null;
    const presser = carrier ? nearestOpponent(s, carrier.pos, carrier.team).player : null;
    return presser ? `Dribble past ${shortName(presser)}` : 'Dribble';
  }
  return 'Clear it long';
};

export interface ResolveOpts {
  /** Scripted preludes: the action cannot fail. */
  forceSuccess?: boolean;
  /** How much of a tick the other 12 players get to move afterwards. */
  tickScale?: number;
}

const PASS_SPEED = 13; // m/s along the ground
const LONG_SPEED = 17;
const SHOT_SPEED = 20;
const PRE = 0.35; // seconds the carrier takes to set himself
const SUBSTEPS = 4;
const REACT = 0.4; // seconds before the twelve others read the ball and move

/** A player the action moves directly (interceptor, beaten presser, carrier on a dribble). */
interface Glide {
  idx: number;
  from: Vec;
  to: Vec;
  t0: number;
  t1: number;
}

/** Records keyframes while a tick is simulated in sub-steps. */
class Recorder {
  readonly tl: Timeline = { duration: 0, ball: [], players: [] };
  private readonly glides: Glide[] = [];

  constructor(private readonly s: State) {}

  glide(g: Glide): void {
    this.glides.push(g);
  }

  ball(t: number, pos: Vec, loft = false): void {
    this.tl.ball.push({ t, v: { pos: { ...pos }, loft } });
    this.tl.duration = Math.max(this.tl.duration, t);
  }

  /** Snapshot every player at time t, with glides overriding the sim position. */
  players(t: number): void {
    const v = this.s.players.map((p, i) => {
      const g = this.glides.find((x) => x.idx === i);
      if (!g) return { ...p.pos };
      const u = clamp((t - g.t0) / Math.max(1e-6, g.t1 - g.t0), 0, 1);
      return lerp(g.from, g.to, u);
    });
    this.tl.players.push({ t, v });
    this.tl.duration = Math.max(this.tl.duration, t);
  }

  hold(t: number): void {
    const lastBall = this.tl.ball[this.tl.ball.length - 1];
    if (lastBall) this.ball(t, lastBall.v.pos);
    this.players(t);
  }
}

const idx = (s: State, id: string): number => s.players.findIndex((p) => p.id === id);

/** Resolve one action for the current holder, then advance every other player one tick. */
export const resolveAction = (s: State, action: Action, rng: Rng, opts: ResolveOpts = {}): Resolution => {
  if (!s.holder) throw new Error('no holder');
  const before = cloneState(s);
  const after = cloneState(s);
  const carrier = playerById(after, s.holder);
  const start = { ...carrier.pos };
  const rec = new Recorder(after);
  let success = false;
  let outcome: Resolution['outcome'] = 'retained';
  let text = '';
  const ballPath: Vec[] = [{ ...start }];
  let flightEnd = PRE;

  rec.ball(0, start);
  rec.players(0);
  rec.ball(PRE, start);
  rec.players(PRE);

  if (action.kind === 'pass') {
    const receiver = playerById(after, action.to);
    const p = passProb(before, playerById(before, carrier.id), playerById(before, receiver.id));
    success = opts.forceSuccess ? true : chance(rng, p);
    if (success) {
      const tf = Math.max(0.45, dist(start, receiver.pos) / PASS_SPEED);
      flightEnd = PRE + tf;
      after.ball = { ...receiver.pos };
      after.holder = receiver.id;
      ballPath.push({ ...receiver.pos });
      rec.ball(flightEnd, receiver.pos);
      text = sentence(`${nameOf(carrier)} finds ${nameOf(receiver)}.`);
    } else {
      outcome = 'lost';
      const d = dist(start, receiver.pos);
      const r = 1.3 + 0.06 * d;
      let interceptor: Player | null = null;
      let bestW = 0;
      let at: Vec = receiver.pos;
      for (const def of opponentsOf(after, carrier.team)) {
        const seg = distToSegment(def.pos, start, receiver.pos);
        if (seg.t < 0.08 || seg.t > 0.97) continue;
        const w = Math.exp(-(seg.d * seg.d) / (r * r));
        if (w > bestW) {
          bestW = w;
          interceptor = def;
          at = seg.q;
        }
      }
      if (interceptor && bestW > 0.15) {
        const tf = Math.max(0.4, dist(start, at) / PASS_SPEED);
        flightEnd = PRE + tf;
        rec.glide({ idx: idx(after, interceptor.id), from: { ...interceptor.pos }, to: { ...at }, t0: PRE, t1: flightEnd });
        interceptor.pos = { ...at };
        after.ball = { ...at };
        after.holder = interceptor.id;
        ballPath.push({ ...at });
        rec.ball(flightEnd, at);
        text = sentence(`cut out by ${nameOf(interceptor)}.`);
      } else {
        const tf = Math.max(0.45, d / PASS_SPEED);
        const { player: pouncer } = nearestOpponent(after, receiver.pos, carrier.team);
        const spot = add(receiver.pos, scale(norm(sub(pouncer.pos, receiver.pos)), 1));
        rec.glide({ idx: idx(after, pouncer.id), from: { ...pouncer.pos }, to: { ...spot }, t0: PRE + tf * 0.5, t1: PRE + tf + 0.45 });
        pouncer.pos = { ...spot };
        after.ball = { ...spot };
        after.holder = pouncer.id;
        ballPath.push({ ...receiver.pos }, { ...spot });
        rec.ball(PRE + tf, receiver.pos);
        flightEnd = PRE + tf + 0.45;
        rec.ball(flightEnd, spot);
        text = sentence(`${nameOf(receiver)} takes a heavy touch and ${nameOf(pouncer)} pounces.`);
      }
    }
  } else if (action.kind === 'dribble') {
    const p = dribbleProb(before, playerById(before, carrier.id));
    const { player: presser } = nearestOpponent(after, carrier.pos, carrier.team);
    const target = dribbleTarget(before, playerById(before, carrier.id));
    success = opts.forceSuccess ? true : chance(rng, p);
    if (success) {
      const td = 1.3;
      flightEnd = PRE + td;
      const beatenSpot = add(start, scale(norm(sub(target, start)), 1.5));
      rec.glide({ idx: idx(after, carrier.id), from: { ...start }, to: { ...target }, t0: PRE, t1: flightEnd });
      rec.glide({ idx: idx(after, presser.id), from: { ...presser.pos }, to: { ...beatenSpot }, t0: PRE, t1: PRE + 0.8 });
      presser.pos = { ...beatenSpot };
      carrier.pos = { ...target };
      after.ball = { ...target };
      after.beaten = presser.id;
      ballPath.push({ ...target });
      rec.ball(flightEnd, target);
      text = sentence(`${nameOf(carrier)} carries it past ${nameOf(presser)}.`);
    } else {
      outcome = 'lost';
      const caught = lerp(start, target, 0.4);
      const spot = add(caught, scale(norm(sub(presser.pos, caught)), 1.1));
      rec.glide({ idx: idx(after, carrier.id), from: { ...start }, to: { ...caught }, t0: PRE, t1: PRE + 0.7 });
      rec.glide({ idx: idx(after, presser.id), from: { ...presser.pos }, to: { ...spot }, t0: PRE, t1: PRE + 0.7 });
      carrier.pos = { ...caught };
      presser.pos = { ...spot };
      after.ball = { ...spot };
      after.holder = presser.id;
      ballPath.push({ ...caught }, { ...spot });
      rec.ball(PRE + 0.7, caught);
      flightEnd = PRE + 0.95;
      rec.ball(flightEnd, spot);
      text = sentence(`${nameOf(carrier)} tries to carry it and ${nameOf(presser)} nicks it off their toe.`);
    }
  } else {
    const dir = attackDir(carrier.team);
    const landing = clampToPitch(
      { x: start.x + dir * range(rng, 28, 36), y: range(rng, 6, PITCH.W - 6) },
      2,
    );
    const ours = teammatesOf(after, carrier.team)
      .filter((p) => p.id !== carrier.id && p.role !== 'GK')
      .sort((a, b) => dist(a.pos, landing) - dist(b.pos, landing))[0];
    const theirs = opponentsOf(after, carrier.team)
      .filter((p) => p.role !== 'GK')
      .sort((a, b) => dist(a.pos, landing) - dist(b.pos, landing))[0];
    const weWin = chance(rng, 0.3);
    const winner = weWin ? ours : theirs;
    if (!winner) throw new Error('no one to win the second ball');
    const tf = Math.max(1, dist(start, landing) / LONG_SPEED);
    flightEnd = PRE + tf;
    rec.glide({ idx: idx(after, winner.id), from: { ...winner.pos }, to: { ...landing }, t0: PRE, t1: flightEnd });
    winner.pos = { ...landing };
    after.ball = { ...landing };
    after.holder = winner.id;
    ballPath.push({ ...landing });
    rec.tl.ball[rec.tl.ball.length - 1]!.v.loft = true;
    rec.ball(flightEnd, landing);
    success = weWin;
    outcome = 'cleared';
    text = sentence(weWin ? `${nameOf(carrier)} goes long and ${nameOf(winner)} wins the second ball.` : `${nameOf(carrier)} goes long; ${nameOf(winner)} collects.`);
  }

  after.tick += 1;

  if (outcome === 'retained') {
    // Everyone else reacts while the ball travels and settles just after it lands.
    const moveEnd = flightEnd + 0.6;
    // Speeds are m/s, so the movement budget is the real time the ball was in play.
    const dt = Math.max(0.3, moveEnd - PRE - REACT) * (opts.tickScale ?? 1);
    const targets = planAttackers(after, rng);
    for (let k = 1; k <= SUBSTEPS; k++) {
      stepDefenders(after, rng, dt / SUBSTEPS);
      moveAttackers(after, targets, dt / SUBSTEPS);
      rec.players(PRE + ((moveEnd - PRE) * k) / SUBSTEPS);
    }
    rec.ball(moveEnd, after.ball);
    const holder = playerById(after, after.holder!);
    if (isChance(after, holder)) {
      outcome = 'chance';
      text += ' Into the final third with room to play.';
    }
  } else {
    rec.hold(flightEnd + 0.4);
  }

  return { action, success, outcome, text, before, after, ballPath, timeline: rec.tl };
};

/** A shot on goal from the current holder. */
export const resolveShot = (s: State, rng: Rng): Resolution => {
  if (!s.holder) throw new Error('no holder');
  const before = cloneState(s);
  const after = cloneState(s);
  const shooter = playerById(after, s.holder);
  const gk = after.players.find((p) => p.team !== shooter.team && p.role === 'GK');
  if (!gk) throw new Error('no keeper');
  const goal = goalOf(shooter.team);
  const p = shotProb(before, playerById(before, shooter.id));
  const success = chance(rng, p);
  const target = success
    ? { x: goal.x, y: goal.y + range(rng, -2.2, 2.2) }
    : { x: gk.pos.x, y: clamp(gk.pos.y + range(rng, -1.5, 1.5), 1, PITCH.W - 1) };
  const rec = new Recorder(after);
  const start = { ...shooter.pos };
  const tf = Math.max(0.35, dist(start, target) / SHOT_SPEED);
  rec.ball(0, start);
  rec.players(0);
  rec.ball(PRE, start);
  rec.players(PRE);
  if (!success) rec.glide({ idx: idx(after, gk.id), from: { ...gk.pos }, to: { ...target }, t0: PRE + tf * 0.3, t1: PRE + tf });
  gk.pos = success ? gk.pos : { ...target };
  after.ball = { ...target };
  after.holder = success ? null : gk.id;
  after.tick += 1;
  rec.ball(PRE + tf, target);
  rec.hold(PRE + tf + 0.6);
  const text = success ? sentence(`${nameOf(shooter)} scores.`) : sentence(`${nameOf(shooter)} shoots and ${nameOf(gk)} saves.`);
  return {
    action: { kind: 'clear' },
    success,
    outcome: success ? 'goal' : 'saved',
    text,
    before,
    after,
    ballPath: [start, { ...target }],
    timeline: rec.tl,
  };
};

/** What the ball's new owner does when it reaches them: best one-step expected value. */
export const defaultAction = (s: State, carrierId: string): Action => {
  const carrier = playerById(s, carrierId);
  const team = carrier.team;
  let best: Action = { kind: 'clear' };
  let bestScore = 0.3 * 0.15 + 0.7 * -0.15;
  const gainAt = (pos: Vec): number => {
    const prog = clamp((progressOf(pos, team) - 8) / 45, 0, 1);
    const calm = 1 - pressureAt(s, pos, team);
    return 0.15 + 0.65 * prog + 0.2 * calm;
  };
  for (const mate of teammatesOf(s, team)) {
    if (mate.id === carrierId) continue;
    const p = passProb(s, carrier, mate);
    const score = p * gainAt(mate.pos) + (1 - p) * lossValue(mate.pos, team);
    if (score > bestScore) {
      bestScore = score;
      best = { kind: 'pass', to: mate.id };
    }
  }
  const pd = dribbleProb(s, carrier);
  const dribble = pd * gainAt(dribbleTarget(s, carrier)) + (1 - pd) * lossValue(carrier.pos, team);
  if (dribble > bestScore) best = { kind: 'dribble' };
  return best;
};

/**
 * Play the consequence out: after a turnover, their attack until a shot, a regain,
 * or four ticks; after a chance of ours, the shot itself.
 */
export const simulateFallout = (s: State, rng: Rng): Resolution[] => {
  const clips: Resolution[] = [];
  let cur = s;
  for (let i = 0; i < 4; i++) {
    const hid = cur.holder;
    if (!hid) break;
    const h = playerById(cur, hid);
    if (inShootingRange(cur, h)) {
      clips.push(resolveShot(cur, rng));
      break;
    }
    if (h.team === 'us') break;
    const res = resolveAction(cur, defaultAction(cur, hid), rng);
    clips.push(res);
    cur = res.after;
    if (res.outcome === 'lost' || res.outcome === 'cleared') break;
  }
  return clips;
};
