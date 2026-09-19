/** Smallest possible call: one state, one yes/no question. */
import { experimental_evaluate as evaluate } from 'ai';

const started = Date.now();
const r = await evaluate({
  model: 'typesafe-ai/jev',
  state: 'A striker is 6 metres from goal with only the keeper to beat.',
  questions: {
    good_chance: { type: 'boolean', instructions: 'This is a good goalscoring chance.' },
  },
});
console.log(`ok in ${Date.now() - started}ms`);
console.log('good_chance ->', r.answers.good_chance.probability);
console.log('usage:', JSON.stringify(r.usage));
