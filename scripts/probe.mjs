/**
 * One call to Jev, from one frozen position.
 *
 * The question this answers is the one the whole design rests on: does a model
 * trained for structured decisions over text have any sense of a football
 * pitch? Run it before spending anything on rate limits.
 *
 *   node --env-file=.env.local scripts/probe.mjs
 */

import { experimental_evaluate as evaluate } from 'ai';

/**
 * Blue #5, central midfielder, on the ball in his own half.
 * #7 is the lone forward, high and free. #4 and #6 are wide and square.
 * #2 and #3 are the two centre-backs behind him.
 * Their #7 is 2.1m away and closing. The lane to our #7 is wide open.
 *
 * The football answer is #7: the only ball that goes forward, into open grass,
 * from a man who is about to be pressed.
 */
const state = {
  pitch: 'The pitch is 60m long and 40m wide. My team attacks toward x=60 and defends the goal at x=0.',
  me: { x: 29, y: 20, speed_ms: 0, has_ball: true, nearest_opponent_m: 2.1, distance_to_ball_m: 0 },
  ball: { x: 29, y: 20, speed_ms: 0, held_by: 'me' },
  team_mates: [
    { shirt: 7, x: 43, y: 20, on_ball: false, nearest_opponent_m: 9.4, lane_from_ball_blocked_by_m: 7.8 },
    { shirt: 4, x: 29, y: 7, on_ball: false, nearest_opponent_m: 2.2, lane_from_ball_blocked_by_m: 1.1 },
    { shirt: 6, x: 29, y: 33, on_ball: false, nearest_opponent_m: 3.0, lane_from_ball_blocked_by_m: 2.4 },
    { shirt: 2, x: 17, y: 12, on_ball: false, nearest_opponent_m: 11.0, lane_from_ball_blocked_by_m: 6.2 },
    { shirt: 3, x: 17, y: 28, on_ball: false, nearest_opponent_m: 12.5, lane_from_ball_blocked_by_m: 8.0 },
    { shirt: 1, x: 5, y: 20, on_ball: false, nearest_opponent_m: 22.0, lane_from_ball_blocked_by_m: 9.9 },
  ],
  opponents: [
    { shirt: 7, x: 27, y: 19, distance_to_me_m: 2.1 },
    { shirt: 4, x: 31, y: 7, distance_to_me_m: 13.2 },
    { shirt: 6, x: 31, y: 32, distance_to_me_m: 12.2 },
    { shirt: 2, x: 45, y: 13, distance_to_me_m: 17.5 },
    { shirt: 3, x: 45, y: 27, distance_to_me_m: 17.5 },
    { shirt: 1, x: 55, y: 20, distance_to_me_m: 26.0 },
  ],
};

const questions = {
  danger: {
    type: 'score',
    instructions: 'How much trouble my team is in at this moment.',
    criteria: [
      'Comfortable. We have the ball under control or they are no threat.',
      'Under some pressure. They are closing us down but nothing is breaking yet.',
      'About to lose it, or already exposed at the back.',
    ],
  },
  pass_to: {
    type: 'choice',
    instructions:
      'I have the ball at 29m, 20m with my nearest opponent 2.1m away. Who should I pass to? ' +
      'Prefer the ball that moves us up the pitch, but do not play into a blocked lane or to a ' +
      'man who is tightly marked.',
    criteria: Object.fromEntries([
      ...state.team_mates.map((m) => [
        `shirt_${m.shirt}`,
        `Team-mate #${m.shirt}, standing at ${m.x}m, ${m.y}m. His nearest opponent is ` +
          `${m.nearest_opponent_m}m from him, and the closest opponent to the passing lane ` +
          `between me and him is ${m.lane_from_ball_blocked_by_m}m off that line.`,
      ]),
      ['hold', 'Nobody is on. Keep the ball and wait for someone to move.'],
    ]),
  },
  weight: {
    type: 'score',
    instructions: 'How far ahead of the receiver I should aim the pass.',
    criteria: [
      'Into his feet, because he is standing still and wants it now.',
      'Into his run, a metre or two ahead of where he is.',
      'Into the space well in front of him, for him to chase.',
    ],
  },
};

const started = Date.now();
const result = await evaluate({ model: 'typesafe-ai/jev', state, questions });
const ms = Date.now() - started;

const a = result.answers;
const conf = result.providerMetadata?.typesafe?.confidence ?? {};

console.log(`\nJev answered in ${ms}ms\n`);
console.log('pass_to ->', a.pass_to.choice, `(confidence ${(conf.pass_to ?? 0).toFixed(2)})`);
for (const [k, v] of Object.entries(a.pass_to.probabilities).sort((x, y) => y[1] - x[1])) {
  console.log(`   ${k.padEnd(10)} ${(v * 100).toFixed(1)}%`);
}
console.log('\ndanger  ->', a.danger.score.toFixed(2), `(confidence ${(conf.danger ?? 0).toFixed(2)})`);
console.log('weight  ->', a.weight.score.toFixed(2), `(confidence ${(conf.weight ?? 0).toFixed(2)})`);
console.log('\nusage:', JSON.stringify(result.usage));
console.log('\nThe football answer is shirt_7.\n');
