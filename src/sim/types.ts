import type { Vec } from './vec';
import type { Timeline } from './timeline';

export type Team = 'us' | 'them';
export type Role = 'GK' | 'LCB' | 'RCB' | 'LM' | 'CM' | 'RM' | 'ST';

export interface Player {
  id: string;
  team: Team;
  role: Role;
  num: number;
  pos: Vec;
  /** Home position in the team shape; movement policies drift back toward it. */
  anchor: Vec;
  /** Radians, pitch coordinates. */
  facing: number;
}

export interface State {
  players: Player[];
  ball: Vec;
  holder: string | null;
  tick: number;
  /** A defender just beaten on the dribble; recovers at half pace for one tick. */
  beaten?: string | null;
}

export type Action = { kind: 'pass'; to: string } | { kind: 'dribble' } | { kind: 'clear' };

export type Outcome = 'retained' | 'lost' | 'cleared' | 'chance' | 'goal' | 'saved';

export interface Resolution {
  action: Action;
  success: boolean;
  outcome: Outcome;
  text: string;
  before: State;
  after: State;
  /** Where the ball travels during this action, pitch coords. */
  ballPath: Vec[];
  /** Recorded motion for playback. */
  timeline: Timeline;
}

/** 7v7 pitch in metres. We attack toward +x; our goal is at x = 0. */
export const PITCH = { L: 60, W: 40 } as const;

export const playerById = (s: State, id: string): Player => {
  const p = s.players.find((pl) => pl.id === id);
  if (!p) throw new Error(`no player ${id}`);
  return p;
};

export const cloneState = (s: State): State => ({
  players: s.players.map((p) => ({ ...p, pos: { ...p.pos }, anchor: { ...p.anchor } })),
  ball: { ...s.ball },
  holder: s.holder,
  tick: s.tick,
  beaten: s.beaten ?? null,
});

export const actionKey = (a: Action): string => (a.kind === 'pass' ? `pass:${a.to}` : a.kind);

export const shortName = (p: Player): string => `#${p.num} ${p.role}`;

/** How the player reads from our bench: "#4 LCB" for ours, "their #9 ST" for theirs. */
export const nameOf = (p: Player): string => (p.team === 'us' ? shortName(p) : `their ${shortName(p)}`);
export const sentence = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
