/**
 * The simulation. Two loops at different rates:
 *
 *   physics   120 Hz   ball rolls, players run toward their target
 *   beat      ~1 Hz    every player's intent is re-decided
 *
 * The engine never chooses an intent. It applies whatever the decision layer
 * returned, forces the two intents the situation dictates (on the ball, and
 * running onto a pass), and executes all of them as geometry.
 */

import {
  CONTROL_R,
  DRAG,
  PITCH,
  ROLL,
  STOPPED,
  attackDir,
  clamp,
  dist,
  onPitch,
  rollTo,
  solveKick,
  timeToBall,
} from '../pitch';
import type { DecideResponse, MatchState, Player, Team } from '../types';
import { carrierOf, motorTarget, moveAll, nearestOpponent } from './motor';

export const TICK = 1 / 120;
export const BEAT = 1.5; // seconds between decision rounds
const ARRIVE_V = 5.0; // m/s a pass should still be doing when it arrives
const SET_TIME = 0.35; // planting the standing foot
const DWELL = 0.4; // how long a receiver holds it before looking up
const CARRY_AHEAD = 0.9; // metres the ball sits in front of a moving carrier

const BLUE_SPOTS: Array<[number, number]> = [
  [5, 20],
  [17, 12],
  [17, 28],
  [29, 7],
  [29, 20],
  [29, 33],
  [43, 20],
];
const RED_SPOTS: Array<[number, number]> = [
  [55, 20],
  [45, 13],
  [45, 27],
  [33, 8],
  [33, 20],
  [33, 32],
  [19, 20],
];

const TASKS = [
  'keep goal',
  'defend the left side and stop crosses',
  'defend the right side and stop crosses',
  'cover the left of midfield and offer an outlet',
  'hold the middle and link defence to attack',
  'cover the right of midfield and offer an outlet',
  'lead the line and stretch their defence',
];

export const newMatch = (): MatchState => {
  const players: Player[] = [];
  const add = (spots: Array<[number, number]>, team: Team) =>
    spots.forEach(([x, y], i) =>
      players.push({
        id: `${team[0]}${i}`,
        team,
        shirt: i + 1,
        gk: i === 0,
        x,
        y,
        vx: 0,
        vy: 0,
        facing: team === 'blue' ? 0 : Math.PI,
        anchor: { x, y },
        belief: {
          distToBallM: 0,
          nearestOpponentM: 0,
          timeToBallS: 0,
          keyJudgment: 0.5,
          keyJudgmentLabel: 'Could receive a pass',
          danger: 0,
        },
        task: TASKS[i],
        intent: i === 0 ? 'keep_goal' : 'hold_position',
        intentProbs: {},
        intentConfidence: 0,
        intentSource: 'initial',
        intentNote: 'Nothing has been decided yet.',
        targetX: x,
        targetY: y,
        pace: 0,
      }),
    );
  add(BLUE_SPOTS, 'blue');
  add(RED_SPOTS, 'red');

  const starter = players.find((p) => p.id === 'b4')!;
  return {
    players,
    ball: {
      x: starter.x,
      y: starter.y,
      vx: 0,
      vy: 0,
      holder: starter.id,
      from: null,
      to: null,
      aim: null,
      struckAt: 0,
    },
    clock: 0,
    beat: 0,
    passes: 0,
    settingUpUntil: DWELL,
  };
};

/** Measured facts only. Judgments come back from the decision layer. */
export const refreshBeliefs = (s: MatchState): void => {
  for (const p of s.players) {
    const o = nearestOpponent(s, p);
    p.belief.distToBallM = dist(p, s.ball);
    p.belief.nearestOpponentM = o ? dist(p, o) : 99;
    p.belief.timeToBallS = timeToBall(p, s.ball);
  }
};

/** Apply a decision round. Forced intents override whatever came back. */
export const applyDecision = (s: MatchState, res: DecideResponse): void => {
  for (const p of s.players) {
    const d = res.players[p.id];
    if (d) {
      // Low confidence means the distribution was spread thin, so keep doing
      // what we were doing rather than flip-flopping on noise.
      if (d.confidence >= 0.25 || p.intentSource === 'initial') {
        p.intent = d.intent;
        p.intentNote = '';
      } else {
        p.intentNote = `Held the previous intent: confidence was only ${(d.confidence * 100).toFixed(0)}%.`;
      }
      p.intentProbs = d.probabilities;
      p.intentConfidence = d.confidence;
      p.intentSource = res.source;
      p.belief.keyJudgment = d.keyJudgment;
      p.belief.keyJudgmentLabel = d.keyJudgmentLabel;
      p.belief.danger = d.danger;
    }
  }
  forceIntents(s);
};

/** Two situations leave a player no choice at all. */
export const forceIntents = (s: MatchState): void => {
  for (const p of s.players) {
    if (p.id === s.ball.holder) {
      p.intent = 'on_the_ball';
      p.intentSource = 'forced';
      p.intentNote = 'He has the ball, so there is nothing to decide about movement.';
    } else if (p.id === s.ball.to && !s.ball.holder) {
      p.intent = 'receive_the_pass';
      p.intentSource = 'forced';
      p.intentNote = 'The ball has been played to him.';
    } else if (p.gk) {
      p.intent = 'keep_goal';
      p.intentSource = 'forced';
      p.intentNote = 'Keepers are not part of the decision model in this build.';
    }
  }
};

/** Strike the ball at a point, with the pace to arrive properly. */
const kick = (s: MatchState, _from: Player, aim: { x: number; y: number }): void => {
  // Struck from where the ball is sitting, so it never jumps to the passer.
  const ox = s.ball.x;
  const oy = s.ball.y;
  const d = Math.max(1, Math.hypot(aim.x - ox, aim.y - oy));
  const v0 = solveKick(d, ARRIVE_V);
  s.ball.vx = ((aim.x - ox) / d) * v0;
  s.ball.vy = ((aim.y - oy) / d) * v0;
  s.ball.holder = null;
  s.ball.struckAt = s.clock;
};

/**
 * Line up a pass. `weight` is how far ahead of the receiver to aim:
 * 0 into his feet, 1 into his run, 2 into the space in front of him.
 */
export const startPass = (s: MatchState, from: Player, to: Player, weight: number): void => {
  const dir = attackDir(from.team);
  let aim = { x: to.x, y: to.y };
  for (let i = 0; i < 2; i++) {
    const d = Math.max(1, Math.hypot(aim.x - from.x, aim.y - from.y));
    const t = SET_TIME + rollTo(solveKick(d, ARRIVE_V), d).t;
    const ahead = weight * 3.5;
    aim = onPitch(
      {
        x: to.x + to.vx * t + dir * ahead,
        y: to.y + to.vy * t,
      },
      1.5,
    );
  }
  s.ball.from = from.id;
  s.ball.to = to.id;
  s.ball.aim = aim;
  s.settingUpUntil = s.clock + SET_TIME;
};

const rollBall = (s: MatchState, dt: number): void => {
  const b = s.ball;
  if (b.holder) {
    // Carried at his feet, just ahead of him when he is moving, and eased into
    // rather than snapped to. Taking control up to CONTROL_R away used to jump
    // the ball onto the player in a single frame, which read as a glitch.
    const p = s.players.find((q) => q.id === b.holder)!;
    const sp = Math.hypot(p.vx, p.vy);
    const cx = p.x + (sp > 0.2 ? (p.vx / sp) * CARRY_AHEAD : 0);
    const cy = p.y + (sp > 0.2 ? (p.vy / sp) * CARRY_AHEAD : 0);
    const k = Math.min(1, dt * 9);
    b.x += (cx - b.x) * k;
    b.y += (cy - b.y) * k;
    b.vx = 0;
    b.vy = 0;
    return;
  }
  const v = Math.hypot(b.vx, b.vy);
  if (v > 0) {
    const nv = Math.max(0, v - (ROLL + DRAG * v * v) * dt);
    b.vx *= nv / v;
    b.vy *= nv / v;
    if (nv < STOPPED) {
      b.vx = 0;
      b.vy = 0;
    }
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  // Rebound off the touchline. Throw-ins are not in this build.
  if (b.x < 0.4) {
    b.x = 0.4;
    b.vx = -b.vx * 0.45;
  }
  if (b.x > PITCH.L - 0.4) {
    b.x = PITCH.L - 0.4;
    b.vx = -b.vx * 0.45;
  }
  if (b.y < 0.4) {
    b.y = 0.4;
    b.vy = -b.vy * 0.45;
  }
  if (b.y > PITCH.W - 0.4) {
    b.y = PITCH.W - 0.4;
    b.vy = -b.vy * 0.45;
  }
};

export interface TickEvent {
  kind: 'pass_struck' | 'received' | 'loose_collected';
  text: string;
  at: number;
}

/** One physics tick. Returns anything worth putting in the log. */
export const tick = (s: MatchState, dt: number): TickEvent | null => {
  s.clock += dt;

  for (const p of s.players) {
    const t = motorTarget(s, p);
    p.targetX = t.x;
    p.targetY = t.y;
    p.pace = t.pace;
  }
  moveAll(s, dt);
  rollBall(s, dt);

  const b = s.ball;

  // The passer has finished planting his foot.
  if (b.holder && b.to && b.aim && s.clock >= s.settingUpUntil) {
    const from = s.players.find((q) => q.id === b.from)!;
    kick(s, from, b.aim);
    const to = s.players.find((q) => q.id === b.to)!;
    forceIntents(s);
    return {
      kind: 'pass_struck',
      at: s.clock,
      text: `${from.team} #${from.shirt} plays it to #${to.shirt}`,
    };
  }

  // The ball is travelling. Only the intended receiver can take it, because
  // interceptions are not in this build.
  if (!b.holder && b.to) {
    const to = s.players.find((q) => q.id === b.to)!;
    if (dist(to, b) <= CONTROL_R) {
      b.holder = to.id;
      b.vx = 0;
      b.vy = 0;
      b.from = null;
      b.to = null;
      b.aim = null;
      s.passes++;
      s.settingUpUntil = s.clock + DWELL;
      forceIntents(s);
      return { kind: 'received', at: s.clock, text: `${to.team} #${to.shirt} takes it down` };
    }
    // A pass that died short and was never collected. Kept short, because
    // while the ball is loose nobody is deciding anything.
    if (s.clock - b.struckAt > 2.5) {
      const near = s.players
        .filter((q) => !q.gk)
        .sort((x, y) => dist(x, b) - dist(y, b))[0];
      b.holder = near.id;
      b.vx = 0;
      b.vy = 0;
      b.from = null;
      b.to = null;
      b.aim = null;
      s.settingUpUntil = s.clock + DWELL;
      forceIntents(s);
      return {
        kind: 'loose_collected',
        at: s.clock,
        text: `${near.team} #${near.shirt} picks up a loose ball`,
      };
    }
  }

  return null;
};

export const canPassNow = (s: MatchState): boolean =>
  s.ball.holder !== null && s.ball.to === null && s.clock >= s.settingUpUntil;

export { carrierOf, clamp };
