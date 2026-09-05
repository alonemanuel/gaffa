import type { IconName } from './icons';

/** Pitch coordinates. x: 0 (left touchline) -> 40 (right). y: 0 (our goal line) -> 60 (their goal line). */
export type Pt = [number, number];

export type PhaseId =
  | 'our-goal-kick'
  | 'attacking'
  | 'their-goal-kick'
  | 'defending'
  | 'transition';

export interface Phase {
  id: PhaseId;
  name: string;
  blurb: string;
  icon: IconName;
}

export interface Frame {
  /** Milliseconds from the start of the animation. */
  t: number;
  /** Either the id of the player carrying it, or an explicit point. */
  ball: string | Pt;
  us: Record<string, Pt>;
  them: Record<string, Pt>;
  /** Narration shown while this frame is on screen. */
  note: string;
}

export interface Tactic {
  id: string;
  phase: PhaseId;
  formation: string;
  title: string;
  /** The symptom this exists to fix, in the words you'd actually use. */
  problem: string;
  /** Why it works. */
  idea: string;
  /** Per-role instructions. */
  keys: { who: string; what: string }[];
  frames: Frame[];
}

export interface FormationPosition {
  /** Short label drawn on the dot. */
  id: string;
  /** Full name, e.g. "Left centre-back". */
  name: string;
  spot: Pt;
  /** One line on why this position exists at all. */
  purpose: string;
  attacking: string[];
  defending: string[];
  /** Which of your players to put here. */
  suits: string;
}

export interface Formation {
  id: string;
  name: string;
  nickname: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  positions: FormationPosition[];
}
