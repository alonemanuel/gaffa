/**
 * Scenario seeds. A seed is a shape, a scripted prelude (who plays it where)
 * and a perturbation; the sim runs the prelude so every position at the freeze
 * is a true consequence. Same seed => same moment, so links share.
 */
import { dist, type Vec } from '../sim/vec';
import { chance, createRng, pick, range, type Rng } from '../sim/rng';
import { nearestOpponent } from '../sim/model';
import { resolveAction } from '../sim/step';
import { PITCH, playerById, shortName, type Player, type Resolution, type Role, type State, type Team } from '../sim/types';

export interface Moment {
  id: number;
  title: string;
  prompt: string;
  /** The frozen state you decide from. */
  state: State;
  carrierId: string;
  /** The live passage that led here, for playback. Empty when continuing a sequence. */
  prelude: Resolution[];
}

const OUR_SHAPE: Record<Role, Vec> = {
  GK: { x: 4, y: 20 },
  LCB: { x: 14, y: 11 },
  RCB: { x: 14, y: 29 },
  LM: { x: 26, y: 6 },
  CM: { x: 23, y: 20 },
  RM: { x: 26, y: 34 },
  ST: { x: 37, y: 20 },
};

/** Their pressing shape, already in our half. */
const THEIR_SHAPE: Record<Role, Vec> = {
  GK: { x: 56, y: 20 },
  LCB: { x: 46, y: 27 },
  RCB: { x: 46, y: 13 },
  LM: { x: 33, y: 31 },
  CM: { x: 31, y: 20 },
  RM: { x: 33, y: 9 },
  ST: { x: 23, y: 20 },
};

const NUMS: Record<Role, number> = { GK: 1, LCB: 4, RCB: 5, LM: 7, CM: 8, RM: 11, ST: 9 };

const mk = (team: Team, role: Role, pos: Vec): Player => ({
  id: `${team === 'us' ? 'u' : 't'}-${role}`,
  team,
  role,
  num: NUMS[role],
  pos: { ...pos },
  anchor: { ...pos },
  facing: team === 'us' ? 0 : Math.PI,
});

const wobble = (rng: Rng, p: Vec, amt: number): Vec => ({ x: p.x + range(rng, -amt, amt), y: p.y + range(rng, -amt, amt) });

interface Template {
  title: string;
  /** Roles in passing order; the last one is you. Written for the left side; mirrored at random. */
  chain: Role[];
}

const TEMPLATES: Template[] = [
  { title: 'Build-up under press', chain: ['GK', 'RCB', 'LCB'] },
  { title: 'Switch across the back', chain: ['RCB', 'LCB'] },
  { title: 'Receiving in midfield', chain: ['GK', 'LCB', 'CM'] },
  { title: 'Pinned on the touchline', chain: ['RCB', 'LCB', 'LM'] },
  { title: 'Keeper under pressure', chain: ['LCB', 'GK'] },
];

const MIRROR: Partial<Record<Role, Role>> = { LCB: 'RCB', RCB: 'LCB', LM: 'RM', RM: 'LM' };
const mirrorRole = (r: Role): Role => MIRROR[r] ?? r;
const mirrorY = (p: Vec): Vec => ({ x: p.x, y: PITCH.W - p.y });

const describe = (final: State, carrier: Player, last: Resolution): string => {
  const senderId = last.before.holder;
  const sender = senderId ? playerById(final, senderId) : null;
  const { player: presser, d } = nearestOpponent(final, carrier.pos, carrier.team);
  const presserBefore = playerById(last.before, presser.id);
  const closing = dist(presserBefore.pos, carrier.pos) - d > 1.5;
  const opening = sender ? `${shortName(sender)} has just played it to you.` : 'The ball is yours.';
  const threat =
    d < 3
      ? `Their ${shortName(presser)} is right on your back.`
      : closing
        ? `Their ${shortName(presser)} is charging at you.`
        : `Their ${shortName(presser)} is ${Math.round(d)}m off and watching.`;
  return `You're the ${carrier.role}. ${opening} ${threat}`;
};

export const generateBuildup = (seed: number): Moment => {
  const rng = createRng(seed);
  const flip = chance(rng, 0.5);
  const M = (p: Vec): Vec => (flip ? mirrorY(p) : p);
  const R = (r: Role): Role => (flip ? mirrorRole(r) : r);

  // How high they press this time: 0 = sitting off, 1 = all in.
  const aggression = range(rng, 0.15, 1);
  const pushUp = 8 * aggression;

  const us = (Object.keys(OUR_SHAPE) as Role[]).map((r) => mk('us', r, M(wobble(rng, OUR_SHAPE[r], 1.5))));
  const them = (Object.keys(THEIR_SHAPE) as Role[]).map((r) => {
    const base = THEIR_SHAPE[r];
    const pos = r === 'GK' ? base : { x: base.x - pushUp, y: base.y };
    return mk('them', r, M(wobble(rng, pos, r === 'GK' ? 0.5 : 2.5)));
  });

  const template = pick(rng, TEMPLATES);
  const chain = template.chain.map(R);
  const byRole = (team: Player[], role: Role): Player => {
    const p = team.find((x) => x.role === role);
    if (!p) throw new Error(role);
    return p;
  };

  const first = byRole(us, chain[0] ?? 'GK');
  let state: State = { players: [...us, ...them], ball: { ...first.pos }, holder: first.id, tick: 0 };
  for (const p of state.players) p.facing = Math.atan2(state.ball.y - p.pos.y, state.ball.x - p.pos.x);

  const prelude: Resolution[] = [];
  for (let i = 1; i < chain.length; i++) {
    const to = byRole(state.players.filter((p) => p.team === 'us'), chain[i] ?? 'GK');
    const isLast = i === chain.length - 1;
    // On the last ball the press reads the pass and is already moving while it travels.
    const res = resolveAction(state, { kind: 'pass', to: to.id }, rng, { forceSuccess: true, tickScale: isLast ? 1.15 : 1 });
    prelude.push(res);
    state = res.after;
  }

  const last = prelude[prelude.length - 1];
  const carrierId = state.holder;
  if (!last || !carrierId) throw new Error('prelude produced no carrier');
  const carrier = playerById(state, carrierId);

  return {
    id: seed,
    title: template.title,
    prompt: describe(state, carrier, last),
    state,
    carrierId,
    prelude,
  };
};
