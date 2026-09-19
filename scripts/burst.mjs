/**
 * Reproduce a decision round outside the game: five concurrent calls, retries
 * off, so the first-attempt failure surfaces with its real message instead of
 * being hidden behind a 2s backoff.
 *
 *   node --env-file=.env.local scripts/burst.mjs [staggerMs]
 */
import { experimental_evaluate as evaluate } from 'ai';

const stagger = Number(process.argv[2] ?? 0);
const state = {
  pitch: 'The pitch is 60m long and 40m wide. My team attacks toward x=60.',
  me: { x: 29, y: 20, nearest_opponent_m: 2.1 },
};
const questions = {
  danger: {
    type: 'score',
    instructions: 'How much trouble my team is in.',
    criteria: ['Comfortable', 'Under some pressure', 'About to lose it'],
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Same fast retry the route now uses: 160ms, then 320ms. */
const RETRIES = 2;
const WAIT = 160;

const one = async (i) => {
  if (stagger) await sleep(i * stagger);
  const t0 = Date.now();
  let tries = 0;
  let last;
  for (let a = 0; a <= RETRIES; a++) {
    if (a) await sleep(WAIT * a);
    tries++;
    try {
      await evaluate({ model: 'typesafe-ai/jev', state, questions, maxRetries: 0 });
      return `call ${i}: ${Date.now() - t0}ms${tries > 1 ? `  (${tries} tries)` : ''}`;
    } catch (err) {
      last = err;
    }
  }
  const status = last?.statusCode ?? last?.cause?.statusCode ?? '?';
  return `call ${i}: FAILED ${Date.now() - t0}ms after ${tries} tries status=${status}`;
};

console.log(`burst of 5, stagger ${stagger}ms, retries off\n`);
for (const line of await Promise.all([0, 1, 2, 3, 4].map(one))) console.log(line);
