/**
 * The shared vocabulary between the simulation, the decision layer and the UI.
 *
 * The model each player runs on is BDI: what he believes, the job he has been
 * given, and what he has decided to do about it right now.
 *
 *   belief  changes every tick   "I am pressed, nobody can reach me"
 *   task    changes per phase    "stop the ball reaching their striker"
 *   intent  changes per beat     "block the lane to #7"
 */

export type Team = 'blue' | 'red';

/** Everything a player off the ball can decide to do. */
export const ATTACK_INTENTS = [
  'show_for_the_ball',
  'run_in_behind',
  'hold_width',
  'drop_between_lines',
  'hold_position',
] as const;

export const DEFEND_INTENTS = [
  'press_the_ball',
  'cover_behind',
  'mark_nearest',
  'block_lane',
  'hold_shape',
] as const;

/** Assigned by the engine rather than chosen, because the situation forces them. */
export const FORCED_INTENTS = ['on_the_ball', 'receive_the_pass', 'keep_goal'] as const;

export type AttackIntent = (typeof ATTACK_INTENTS)[number];
export type DefendIntent = (typeof DEFEND_INTENTS)[number];
export type ForcedIntent = (typeof FORCED_INTENTS)[number];
export type Intent = AttackIntent | DefendIntent | ForcedIntent;

/** Plain English for the inspector, and the descriptions Jev reads as criteria. */
export const INTENT_TEXT: Record<Intent, string> = {
  show_for_the_ball: 'Move into a clear lane so the man on the ball can play me now',
  run_in_behind: 'Get past their last defender for a ball over the top',
  hold_width: 'Stay wide to stretch them and open the middle',
  drop_between_lines: 'Come short into the space in front of their defence',
  hold_position: 'Stay roughly where I am and keep the shape',
  press_the_ball: 'Go straight at the man on the ball and close him down',
  cover_behind: 'Sit behind whoever is pressing, in case he is beaten',
  mark_nearest: 'Stay goal-side and tight to the opponent nearest me',
  block_lane: 'Stand in the passing lane between the ball and the man I am watching',
  hold_shape: 'Hold my position in the defensive block',
  on_the_ball: 'I have the ball',
  receive_the_pass: 'The ball has been played to me, go and meet it',
  keep_goal: 'Stay near my goal',
};

export interface Vec {
  x: number;
  y: number;
}

/** What a player believes about the world. Measured facts, plus judgments. */
export interface Belief {
  /** Measured. */
  distToBallM: number;
  nearestOpponentM: number;
  timeToBallS: number;
  /**
   * The one yes/no that matters for his side of the ball, 0 to 1. Attacking it
   * is whether he could receive. Defending it is whether his man is a threat.
   * Asking an attacking question of a defender returns a meaningless number,
   * so the question changes with the role and the label travels with it.
   */
  keyJudgment: number;
  keyJudgmentLabel: string;
  /** Judged by the decision model, 0 (comfortable) to 2 (about to lose it). */
  danger: number;
}

export const JUDGMENT_LABEL = {
  attacking: 'Could receive a pass',
  defending: 'His man is a threat',
} as const;

export interface Player {
  id: string;
  team: Team;
  shirt: number;
  gk: boolean;

  x: number;
  y: number;
  vx: number;
  vy: number;
  /**
   * Where he is looking, in radians in pitch coordinates. A player faces the
   * way he is running, and when he is standing still he faces the ball.
   */
  facing: number;
  anchor: Vec;

  /** BDI. */
  belief: Belief;
  task: string;
  intent: Intent;
  intentProbs: Record<string, number>;
  intentConfidence: number;
  /** Where the decision came from, so the inspector never lies about it. */
  intentSource: 'jev' | 'mock' | 'initial' | 'forced';
  /** Why the engine overrode the model, when it did. */
  intentNote: string;

  /** Motor layer: the geometric execution of the intent. */
  targetX: number;
  targetY: number;
  pace: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Null while the ball is travelling. */
  holder: string | null;
  from: string | null;
  to: string | null;
  aim: Vec | null;
  struckAt: number;
}

export interface MatchState {
  players: Player[];
  ball: Ball;
  clock: number;
  beat: number;
  passes: number;
  /** Set while the passer is planting his foot, before the ball leaves. */
  settingUpUntil: number;
}

/* --- the wire format between client and server ------------------------- */

/** One player's own view of the world. Nobody sees anybody else's view. */
export interface PlayerView {
  id: string;
  shirt: number;
  role: 'attacking' | 'defending';
  task: string;
  me: {
    x: number;
    y: number;
    speed_ms: number;
    has_ball: boolean;
    nearest_opponent_m: number;
    distance_to_ball_m: number;
  };
  ball: {
    x: number;
    y: number;
    speed_ms: number;
    held_by: string;
  };
  team_mates: Array<{
    shirt: number;
    x: number;
    y: number;
    on_ball: boolean;
    nearest_opponent_m: number;
    lane_from_ball_blocked_by_m: number;
  }>;
  opponents: Array<{ shirt: number; x: number; y: number; distance_to_me_m: number }>;
  pitch: string;
}

export interface PlayerDecision {
  intent: Intent;
  probabilities: Record<string, number>;
  confidence: number;
  keyJudgment: number;
  keyJudgmentLabel: string;
  danger: number;
}

/** Per-call timing, so a slow round can be traced to the call that caused it. */
export interface CallTrace {
  id: string;
  ms: number;
  error?: string;
}

export interface OnBallDecision {
  /** Shirt number of the team-mate to pass to, or null to hold. */
  passToShirt: number | null;
  probabilities: Record<string, number>;
  confidence: number;
  /** 0 into his feet, 1 into his run, 2 into the space ahead of him. */
  weight: number;
}

export interface DecideResponse {
  source: 'jev' | 'mock';
  latencyMs: number;
  /** Keyed by player id. */
  players: Record<string, PlayerDecision>;
  onBall: OnBallDecision | null;
  calls?: CallTrace[];
  error?: string;
}
