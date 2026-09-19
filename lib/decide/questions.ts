/**
 * The questions put to the decision model.
 *
 * All the football knowledge in this project lives in these strings. There are
 * no coefficients and no thresholds. If the team plays badly, the fix is to
 * write a better criterion, not to tune a number.
 */

import { ATTACK_INTENTS, DEFEND_INTENTS, INTENT_TEXT } from '../types';
import type { Intent, PlayerView } from '../types';

export type Question =
  | { type: 'boolean'; instructions: string; criteria?: { true: string; false: string } }
  | { type: 'score'; instructions: string; criteria: string[] }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> };

const criteriaFor = (intents: readonly Intent[]): Record<string, string> =>
  Object.fromEntries(intents.map((i) => [i, INTENT_TEXT[i]]));

export const DANGER_LEVELS = [
  'Comfortable. We have the ball under control or they are no threat.',
  'Under some pressure. They are closing us down but nothing is breaking yet.',
  'About to lose it, or already exposed at the back.',
];

export const WEIGHT_LEVELS = [
  'Into his feet, because he is standing still and wants it now.',
  'Into his run, a metre or two ahead of where he is.',
  'Into the space well in front of him, for him to chase.',
];

/**
 * The key yes/no differs by which side of the ball he is on. Asking a defender
 * whether he could receive a pass returns a number that means nothing, because
 * his team does not have the ball to give him.
 */
const KEY_JUDGMENT: Record<'attacking' | 'defending', Question> = {
  attacking: {
    type: 'boolean',
    instructions:
      'Right now I could receive a pass from my team-mate on the ball without it being cut out.',
    criteria: {
      true: 'There is a clear lane to me and no opponent close enough to step in.',
      false: 'Someone is marking me tightly, or an opponent stands in the passing lane.',
    },
  },
  defending: {
    type: 'boolean',
    instructions:
      'The opponent nearest me is a real threat right now, and would hurt us if the ball reached him.',
    criteria: {
      true: 'He is in space, or in a position to run in behind us if he gets it.',
      false: 'He is covered, facing our way, or too far from goal to do damage.',
    },
  },
};

/** Three questions for a player off the ball, evaluated in parallel. */
export const offBallQuestions = (v: PlayerView): Record<string, Question> => ({
  key: KEY_JUDGMENT[v.role],
  danger: {
    type: 'score',
    instructions: 'How much trouble my team is in at this moment.',
    criteria: DANGER_LEVELS,
  },
  intent: {
    type: 'choice',
    instructions:
      `I am ${v.role} and my job is to ${v.task}. ` +
      'What should I do over the next two seconds? Judge it from where everyone is standing.',
    criteria: criteriaFor(v.role === 'attacking' ? ATTACK_INTENTS : DEFEND_INTENTS),
  },
});

/** The man on the ball gets two more, in the same call. */
export const onBallQuestions = (v: PlayerView): Record<string, Question> => {
  const targets: Record<string, string> = {};
  for (const m of v.team_mates) {
    targets[`shirt_${m.shirt}`] =
      `Team-mate #${m.shirt}, standing at ${m.x}m, ${m.y}m. ` +
      `His nearest opponent is ${m.nearest_opponent_m}m from him, and the closest ` +
      `opponent to the passing lane between me and him is ${m.lane_from_ball_blocked_by_m}m off that line.`;
  }
  targets.hold = 'Nobody is on. Keep the ball and wait for someone to move.';

  return {
    danger: {
      type: 'score',
      instructions: 'How much trouble my team is in at this moment.',
      criteria: DANGER_LEVELS,
    },
    pass_to: {
      type: 'choice',
      instructions:
        `I have the ball at ${v.me.x}m, ${v.me.y}m with my nearest opponent ${v.me.nearest_opponent_m}m away. ` +
        'Who should I pass to? Prefer the ball that moves us up the pitch, but do not play ' +
        'into a blocked lane or to a man who is tightly marked.',
      criteria: targets,
    },
    weight: {
      type: 'score',
      instructions: 'How far ahead of the receiver I should aim the pass.',
      criteria: WEIGHT_LEVELS,
    },
  };
};
