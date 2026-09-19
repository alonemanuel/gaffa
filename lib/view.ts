/**
 * Turning the match into one view per player.
 *
 * Each player gets his own object and nobody sees anybody else's. That is what
 * stops the team sharing a brain: two defenders can both conclude they are
 * closest to the ball, because each is reasoning from his own view.
 *
 * Only measured facts go in here. Everything that needs a judgment is asked as
 * a question instead.
 */

import { PITCH, attackDir, dist, laneClearance } from './pitch';
import type { MatchState, Player, PlayerView } from './types';
import { carrierOf } from './sim/motor';

const round = (n: number): number => Math.round(n * 10) / 10;

export const buildView = (s: MatchState, p: Player): PlayerView => {
  const carrier = carrierOf(s);
  const attacking = carrier ? carrier.team === p.team : false;
  const dir = attackDir(p.team);
  const opponents = s.players.filter((q) => q.team !== p.team);

  return {
    id: p.id,
    shirt: p.shirt,
    role: attacking ? 'attacking' : 'defending',
    task: p.task,
    pitch:
      `The pitch is ${PITCH.L}m long and ${PITCH.W}m wide. ` +
      (dir > 0
        ? 'My team attacks toward x=60 and defends the goal at x=0.'
        : 'My team attacks toward x=0 and defends the goal at x=60.'),
    me: {
      x: round(p.x),
      y: round(p.y),
      speed_ms: round(Math.hypot(p.vx, p.vy)),
      has_ball: s.ball.holder === p.id,
      nearest_opponent_m: round(p.belief.nearestOpponentM),
      distance_to_ball_m: round(p.belief.distToBallM),
    },
    ball: {
      x: round(s.ball.x),
      y: round(s.ball.y),
      speed_ms: round(Math.hypot(s.ball.vx, s.ball.vy)),
      held_by: carrier
        ? carrier.id === p.id
          ? 'me'
          : carrier.team === p.team
            ? `my team-mate #${carrier.shirt}`
            : `an opponent, their #${carrier.shirt}`
        : 'nobody, it is loose',
    },
    team_mates: s.players
      .filter((q) => q.team === p.team && q.id !== p.id)
      .map((q) => ({
        shirt: q.shirt,
        x: round(q.x),
        y: round(q.y),
        on_ball: s.ball.holder === q.id,
        nearest_opponent_m: round(
          Math.min(...opponents.map((o) => dist(q, o))),
        ),
        // How close the nearest opponent stands to the line from the ball to
        // him. Small means the pass would have to go through somebody.
        lane_from_ball_blocked_by_m: round(laneClearance(s.ball, q, opponents)),
      })),
    opponents: opponents.map((o) => ({
      shirt: o.shirt,
      x: round(o.x),
      y: round(o.y),
      distance_to_me_m: round(dist(p, o)),
    })),
  };
};

/**
 * Who re-decides on this beat.
 *
 * Not everybody, for two reasons. Twelve calls a second is more than the
 * gateway will serve on a free tier, and it is not how a team behaves either:
 * players do not all reconsider in lockstep. The man on the ball always
 * decides, because his choice is the one that moves the game. Everyone else
 * takes turns, so each is re-decided about every third beat.
 */
const OFF_BALL_PER_BEAT = 4;

export const decidingPlayers = (s: MatchState): Player[] => {
  const open = s.players.filter((p) => !p.gk && p.id !== s.ball.to);
  const carrier = open.filter((p) => p.id === s.ball.holder);
  const rest = open.filter((p) => p.id !== s.ball.holder);

  const start = (s.beat * OFF_BALL_PER_BEAT) % Math.max(rest.length, 1);
  const rotated = [...rest.slice(start), ...rest.slice(0, start)];
  return [...carrier, ...rotated.slice(0, OFF_BALL_PER_BEAT)];
};
