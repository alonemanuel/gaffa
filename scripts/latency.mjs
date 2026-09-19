/**
 * Is the periodic ~2.6s round a slow model, or a silent retry?
 *
 * Retries are disabled here, so a call that would have been retried fails
 * outright instead of taking two seconds longer. Eight sequential calls is
 * enough to catch a one-in-five event and costs a fraction of a cent.
 *
 *   node --env-file=.env.local scripts/latency.mjs
 */
import { experimental_evaluate as evaluate } from 'ai';

const state = {
  pitch: 'The pitch is 60m long and 40m wide. My team attacks toward x=60.',
  me: { x: 29, y: 20, has_ball: true, nearest_opponent_m: 2.1 },
  team_mates: [
    { shirt: 7, x: 43, y: 20, nearest_opponent_m: 9.4, lane_from_ball_blocked_by_m: 7.8 },
    { shirt: 4, x: 29, y: 7, nearest_opponent_m: 2.2, lane_from_ball_blocked_by_m: 1.1 },
    { shirt: 6, x: 29, y: 33, nearest_opponent_m: 3.0, lane_from_ball_blocked_by_m: 2.4 },
  ],
};

const questions = {
  danger: {
    type: 'score',
    instructions: 'How much trouble my team is in.',
    criteria: ['Comfortable', 'Under some pressure', 'About to lose it'],
  },
};

const times = [];
let failures = 0;

for (let i = 1; i <= 8; i++) {
  const t0 = Date.now();
  try {
    await evaluate({ model: 'typesafe-ai/jev', state, questions, maxRetries: 0 });
    const ms = Date.now() - t0;
    times.push(ms);
    console.log(`call ${i}: ${ms}ms`);
  } catch (err) {
    failures++;
    const ms = Date.now() - t0;
    const name = err?.name ?? 'Error';
    const msg = String(err?.message ?? err).split('\n')[0].slice(0, 110);
    console.log(`call ${i}: FAILED after ${ms}ms  ${name}: ${msg}`);
  }
}

if (times.length) {
  const sorted = [...times].sort((a, b) => a - b);
  console.log(
    `\nok ${times.length}/8, failed ${failures}` +
      `  min ${sorted[0]}ms  median ${sorted[Math.floor(sorted.length / 2)]}ms  max ${sorted.at(-1)}ms`,
  );
}
