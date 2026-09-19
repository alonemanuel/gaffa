/**
 * A stand-in decision model, used when no Vercel AI Gateway token is present.
 *
 * This is deliberately crude. It exists so the simulation runs, the inspector
 * has something to show, and the plumbing can be tested without spending calls
 * or needing auth. It is NOT the design. Every answer it produces is labelled
 * `mock` all the way through to the UI so it is never mistaken for Jev.
 */

import { ATTACK_INTENTS, DEFEND_INTENTS, JUDGMENT_LABEL } from '../types';
import type { DecideResponse, Intent, PlayerView } from '../types';

/** Turn scores into a distribution, so the shape matches a real answer. */
const softmax = (scores: Record<string, number>, temp = 0.5): Record<string, number> => {
  const keys = Object.keys(scores);
  const top = Math.max(...keys.map((k) => scores[k]));
  const w: Record<string, number> = {};
  let total = 0;
  for (const k of keys) {
    w[k] = Math.exp((scores[k] - top) / temp);
    total += w[k];
  }
  for (const k of keys) w[k] = Math.round((w[k] / total) * 1000) / 1000;
  return w;
};

/** Confidence as the model defines it: how concentrated the distribution is. */
const concentration = (probs: Record<string, number>): number => {
  const vals = Object.values(probs);
  const n = vals.length;
  if (n <= 1) return 1;
  const entropy = -vals.reduce((a, p) => a + (p > 0 ? p * Math.log(p) : 0), 0);
  return Math.round((1 - entropy / Math.log(n)) * 1000) / 1000;
};

const pick = (probs: Record<string, number>): string =>
  Object.entries(probs).sort((a, b) => b[1] - a[1])[0][0];

const offBall = (v: PlayerView) => {
  const scores: Record<string, number> = {};
  const marked = v.me.nearest_opponent_m < 4;
  const far = v.me.distance_to_ball_m > 22;

  if (v.role === 'attacking') {
    for (const i of ATTACK_INTENTS) scores[i] = 0;
    scores.show_for_the_ball = marked ? 0.2 : 1.0;
    scores.run_in_behind = far ? 0.7 : 0.2;
    scores.hold_width = v.me.y < 10 || v.me.y > 30 ? 0.8 : 0.1;
    scores.drop_between_lines = marked ? 0.8 : 0.3;
    scores.hold_position = 0.4;
  } else {
    for (const i of DEFEND_INTENTS) scores[i] = 0;
    const closest = v.me.distance_to_ball_m <= Math.min(...v.opponents.map((o) => o.distance_to_me_m), 99);
    scores.press_the_ball = v.me.distance_to_ball_m < 12 ? 1.0 : 0.1;
    scores.cover_behind = v.me.distance_to_ball_m < 20 ? 0.5 : 0.2;
    scores.mark_nearest = v.me.nearest_opponent_m < 8 ? 0.9 : 0.2;
    scores.block_lane = 0.5;
    scores.hold_shape = 0.6;
    if (closest) scores.press_the_ball += 0.5;
  }

  const probabilities = softmax(scores);
  return {
    intent: pick(probabilities) as Intent,
    probabilities,
    confidence: concentration(probabilities),
    keyJudgment: v.role === 'attacking' ? (marked ? 0.2 : 0.8) : marked ? 0.7 : 0.3,
    keyJudgmentLabel: JUDGMENT_LABEL[v.role],
    danger: v.role === 'attacking' ? 0.6 : 1.1,
  };
};

const onBall = (v: PlayerView) => {
  const scores: Record<string, number> = {};
  const dir = v.pitch.includes('x=60') ? 1 : -1;
  for (const m of v.team_mates) {
    const forward = (m.x - v.me.x) * dir;
    scores[`shirt_${m.shirt}`] =
      forward * 0.12 +
      Math.min(m.lane_from_ball_blocked_by_m, 8) * 0.25 +
      Math.min(m.nearest_opponent_m, 8) * 0.15;
  }
  // Holding is a last resort here, otherwise the stand-in never passes.
  scores.hold = Math.max(...Object.values(scores)) - 1.6;
  const probabilities = softmax(scores, 0.8);
  const choice = pick(probabilities);
  return {
    passToShirt: choice === 'hold' ? null : Number(choice.replace('shirt_', '')),
    probabilities,
    confidence: concentration(probabilities),
    weight: 0.6,
  };
};

export const mockDecide = (views: PlayerView[], carrierId: string | null): DecideResponse => {
  const players: DecideResponse['players'] = {};
  let onBallDecision: DecideResponse['onBall'] = null;
  for (const v of views) {
    if (v.id === carrierId) {
      onBallDecision = onBall(v);
      players[v.id] = {
        intent: 'on_the_ball',
        probabilities: {},
        confidence: 1,
        keyJudgment: 0.5,
        keyJudgmentLabel: JUDGMENT_LABEL.attacking,
        danger: 0.6,
      };
    } else {
      players[v.id] = offBall(v);
    }
  }
  return { source: 'mock', latencyMs: 0, players, onBall: onBallDecision };
};
