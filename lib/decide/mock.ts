/**
 * The stand-in decider, used when no gateway is reachable or when
 * `FORCE_MOCK=1` is set.
 *
 * It plays a complete game. Every player gets a legal intent, the man on the
 * ball nearly always picks someone to pass to, and the answers have the same
 * shape as Jev's, probabilities and confidence included, so nothing downstream
 * can tell the difference structurally.
 *
 * The one difference is that it is not thinking. Choices are sampled at random
 * rather than judged, so the football is nonsense while the machinery around it
 * is exercised exactly as it would be in a real match. That is the point: it
 * contains no football knowledge at all, and none should ever be added here.
 * Everything it returns is labelled `mock` all the way through to the UI.
 */

import { ATTACK_INTENTS, DEFEND_INTENTS, JUDGMENT_LABEL } from '../types';
import type { DecideResponse, Intent, PlayerView } from '../types';

/**
 * A random distribution with one clear winner.
 *
 * A flat distribution would be more purely random, but confidence is defined
 * as how concentrated the answer is, and the engine keeps the previous intent
 * when confidence is low. A flat draw would therefore freeze everyone on their
 * opening intent and the game would never move.
 */
const randomDistribution = (keys: readonly string[]): Record<string, number> => {
  const raw: Record<string, number> = {};
  let total = 0;
  for (const k of keys) {
    // Cubed, so one option usually runs away with it.
    const v = Math.random() ** 3 + 0.02;
    raw[k] = v;
    total += v;
  }
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = Math.round((raw[k] / total) * 1000) / 1000;
  return out;
};

/** How concentrated a distribution is, which is what Jev calls confidence. */
const concentration = (probs: Record<string, number>): number => {
  const vals = Object.values(probs);
  if (vals.length <= 1) return 1;
  const entropy = -vals.reduce((a, p) => a + (p > 0 ? p * Math.log(p) : 0), 0);
  return Math.round((1 - entropy / Math.log(vals.length)) * 1000) / 1000;
};

const winner = (probs: Record<string, number>): string =>
  Object.entries(probs).sort((a, b) => b[1] - a[1])[0][0];

const offBall = (v: PlayerView) => {
  const probabilities = randomDistribution(
    v.role === 'attacking' ? ATTACK_INTENTS : DEFEND_INTENTS,
  );
  return {
    intent: winner(probabilities) as Intent,
    probabilities,
    // Never below the engine's gate, or nobody would ever change their mind.
    confidence: Math.max(0.3, concentration(probabilities)),
    keyJudgment: Math.round(Math.random() * 100) / 100,
    keyJudgmentLabel: JUDGMENT_LABEL[v.role],
    danger: Math.round(Math.random() * 200) / 100,
  };
};

const onBall = (v: PlayerView) => {
  // Only team-mates in range, so the stand-in cannot stall by aiming at
  // somebody unreachable. Holding is possible but rare, so the ball keeps moving.
  const reachable = v.team_mates.filter((m) => {
    const d = Math.hypot(m.x - v.me.x, m.y - v.me.y);
    return d >= 3 && d <= 34;
  });
  const targets = (reachable.length ? reachable : v.team_mates).map((m) => `shirt_${m.shirt}`);
  const probabilities = randomDistribution([...targets, 'hold']);
  // Keep holding to roughly one ball in twenty.
  probabilities.hold = Math.min(probabilities.hold, 0.05);

  const choice = winner(probabilities);
  return {
    passToShirt: choice === 'hold' ? null : Number(choice.replace('shirt_', '')),
    probabilities,
    confidence: Math.max(0.3, concentration(probabilities)),
    weight: Math.round(Math.random() * 200) / 100,
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
        keyJudgment: Math.round(Math.random() * 100) / 100,
        keyJudgmentLabel: JUDGMENT_LABEL[v.role],
        danger: Math.round(Math.random() * 200) / 100,
      };
    } else {
      players[v.id] = offBall(v);
    }
  }

  return { source: 'mock', latencyMs: 0, players, onBall: onBallDecision };
};
