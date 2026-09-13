/**
 * Monte Carlo grader: for every option the carrier has, roll the possession
 * forward N times with a greedy default policy and average the terminal value.
 * This is the "engine eval" the verdict card shows.
 */
import { dist } from './vec';
import { createRng, type Rng } from './rng';
import { hashString } from './rng';
import { CHANCE_VALUE, clearValue, dribbleProb, isDangerZone, lossValue, passProb, retainValue } from './model';
import { resolveAction, availableActions, actionLabel, defaultAction } from './step';
import { actionKey, playerById, type Action, type State } from './types';

export interface OptionEval {
  action: Action;
  key: string;
  label: string;
  /** Expected value, roughly [-1.5, 1]. */
  ev: number;
  /** Share of rollouts still in possession (or a chance created) at the horizon. */
  retain: number;
  /** Share of rollouts where we lost it inside our own defensive zone. */
  lostDanger: number;
  /** Immediate success probability of the action itself. */
  immediate: number;
}

const ROLLOUTS = 220;
const HORIZON = 2;

export const greedyAction = defaultAction;

interface RolloutResult {
  value: number;
  retained: boolean;
  lostDanger: boolean;
}

export const rollout = (s0: State, first: Action, rng: Rng): RolloutResult => {
  let res = resolveAction(s0, first, rng);
  for (let i = 0; i <= HORIZON; i++) {
    const s = res.after;
    if (res.outcome === 'lost') return { value: lossValue(s.ball), retained: false, lostDanger: isDangerZone(s.ball) };
    if (res.outcome === 'cleared') return { value: clearValue(s), retained: false, lostDanger: false };
    if (res.outcome === 'chance') return { value: CHANCE_VALUE, retained: true, lostDanger: false };
    if (i === HORIZON || !s.holder) break;
    res = resolveAction(s, greedyAction(s, s.holder), rng);
  }
  const s = res.after;
  const holder = s.holder ? playerById(s, s.holder) : null;
  if (!holder || holder.team !== 'us') return { value: lossValue(s.ball), retained: false, lostDanger: isDangerZone(s.ball) };
  return { value: retainValue(s, holder), retained: true, lostDanger: false };
};

export const evaluateOptions = (s: State, carrierId: string, seed: number): OptionEval[] => {
  const carrier = playerById(s, carrierId);
  const out: OptionEval[] = [];
  for (const action of availableActions(s, carrierId)) {
    const key = actionKey(action);
    const rng = createRng((seed ^ hashString(key)) >>> 0);
    let sum = 0;
    let retained = 0;
    let danger = 0;
    for (let i = 0; i < ROLLOUTS; i++) {
      const r = rollout(s, action, rng);
      sum += r.value;
      if (r.retained) retained++;
      if (r.lostDanger) danger++;
    }
    const immediate =
      action.kind === 'pass'
        ? passProb(s, carrier, playerById(s, action.to))
        : action.kind === 'dribble'
          ? dribbleProb(s, carrier)
          : 1;
    out.push({
      action,
      key,
      label: actionLabel(s, action),
      ev: sum / ROLLOUTS,
      retain: retained / ROLLOUTS,
      lostDanger: danger / ROLLOUTS,
      immediate,
    });
  }
  return out.sort((a, b) => b.ev - a.ev);
};

export const passDistance = (s: State, a: Action): number => {
  if (a.kind !== 'pass' || !s.holder) return 0;
  return dist(playerById(s, s.holder).pos, playerById(s, a.to).pos);
};
