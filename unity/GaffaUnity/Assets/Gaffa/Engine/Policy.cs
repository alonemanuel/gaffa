using System;
using System.Collections.Generic;
using System.Linq;

namespace Gaffa.Engine
{
    /// <summary>
    /// Movement policies for the players who are not making the decision.
    /// Defenders pick roles by utility (press / cover / mark); attackers hunt for
    /// receivable positions. Mirrors src/sim/policy.ts, including RNG call order.
    /// </summary>
    public static class Policy
    {
        private const double SpeedPress = 3.8;
        private const double SpeedCover = 3.2;
        private const double SpeedMark = 3.0;
        private const double SpeedSupport = 3.8;
        private const double PressStop = 1.5;

        private static readonly double[] Dirs = Enumerable.Range(0, 8).Select(i => (i / 8.0) * Math.PI * 2).ToArray();

        private static Vec2 Jitter(Rng rng, Vec2 p, double amt) =>
            new Vec2(p.X + rng.Range(-amt, amt), p.Y + rng.Range(-amt, amt));

        private static void Face(Player p, Vec2 toward)
        {
            var d = Vec2.Sub(toward, p.Pos);
            if (Vec2.Hypot(d.X, d.Y) > 0.2) p.Facing = Vec2.AngleOf(d);
        }

        public static void StepDefenders(State s, Rng rng, double dt = 1)
        {
            if (s.Holder == null) return;
            var holder = s.PlayerById(s.Holder);
            var holding = holder.Team;
            var dir = Model.AttackDir(holding);
            var ball = s.Ball;

            var beaten = s.Beaten;
            // OrderBy is stable, matching JS Array.prototype.sort.
            var defs = s.Players
                .Where(p => p.Team != holding && p.Role != Role.GK && p.Id != beaten)
                .OrderBy(p => Vec2.Dist(p.Pos, ball))
                .ToList();
            var recovering = beaten != null ? s.Players.FirstOrDefault(p => p.Id == beaten) : null;
            if (recovering != null)
            {
                recovering.Pos = Vec2.MoveToward(recovering.Pos, ball, SpeedPress * 0.4 * dt);
                Face(recovering, ball);
            }
            s.Beaten = null;
            var attackers = s.Players.Where(p => p.Team == holding && p.Role != Role.GK && p.Id != holder.Id).ToList();

            if (defs.Count > 0)
            {
                var presser = defs[0];
                var target = Vec2.MoveToward(presser.Pos, ball, SpeedPress * dt);
                presser.Pos = Vec2.Dist(target, ball) < PressStop
                    ? Vec2.Add(ball, Vec2.Scale(Vec2.Norm(Vec2.Sub(presser.Pos, ball)), PressStop))
                    : target;
                Face(presser, ball);
            }

            var marked = new HashSet<string>();
            if (defs.Count > 1)
            {
                var cover = defs[1];
                var forwardOptions = attackers
                    .Where(a => (a.Pos.X - ball.X) * dir > -2)
                    .OrderBy(a => Vec2.Dist(a.Pos, ball))
                    .ToList();
                if (forwardOptions.Count > 0)
                {
                    var option = forwardOptions[0];
                    cover.Pos = Vec2.MoveToward(cover.Pos, Jitter(rng, Vec2.Lerp(ball, option.Pos, 0.55), 0.5), SpeedCover * dt);
                    marked.Add(option.Id);
                }
                Face(cover, ball);
            }

            for (var i = 2; i < defs.Count; i++)
            {
                var def = defs[i];
                Player? best = null;
                var bestD = double.PositiveInfinity;
                foreach (var a in attackers)
                {
                    if (marked.Contains(a.Id)) continue;
                    var d = Vec2.Dist(a.Pos, def.Pos);
                    if (d < bestD)
                    {
                        bestD = d;
                        best = a;
                    }
                }
                if (best != null)
                {
                    marked.Add(best.Id);
                    // Mark goal-side (toward the goal we defend), leaning slightly toward the ball.
                    var toGoal = new Vec2(dir, 0);
                    var toBall = Vec2.Norm(Vec2.Sub(ball, best.Pos));
                    var spot = Vec2.Add(best.Pos, Vec2.Scale(Vec2.Norm(Vec2.Add(Vec2.Scale(toGoal, 0.65), Vec2.Scale(toBall, 0.35))), 2.8));
                    def.Pos = Vec2.MoveToward(def.Pos, Jitter(rng, spot, 0.5), SpeedMark * dt);
                }
                else
                {
                    def.Pos = Vec2.MoveToward(def.Pos, Vec2.Lerp(def.Anchor, ball, 0.3), SpeedMark * dt);
                }
                Face(def, ball);
            }

            var gk = s.Players.FirstOrDefault(p => p.Team != holding && p.Role == Role.GK);
            if (gk != null)
            {
                gk.Pos = new Vec2(gk.Anchor.X, Vec2.Lerp(gk.Anchor, ball, 0.3).Y);
                Face(gk, ball);
            }
        }

        /// <summary>Where each supporting attacker wants to be this tick (decided once per tick).</summary>
        public static Dictionary<string, Vec2> PlanAttackers(State s, Rng rng)
        {
            var targets = new Dictionary<string, Vec2>();
            if (s.Holder == null) return targets;
            var holder = s.PlayerById(s.Holder);
            var team = holder.Team;
            var dir = Model.AttackDir(team);

            foreach (var p in s.Players)
            {
                if (p.Team != team || p.Id == holder.Id) continue;
                if (p.Role == Role.GK)
                {
                    targets[p.Id] = new Vec2(p.Anchor.X, Vec2.Lerp(p.Anchor, s.Ball, 0.35).Y);
                    continue;
                }
                var radius = rng.Range(3, 4.2);
                var candidates = new List<Vec2> { p.Pos };
                foreach (var a in Dirs) candidates.Add(Vec2.Add(p.Pos, new Vec2(Math.Cos(a) * radius, Math.Sin(a) * radius)));
                var best = p.Pos;
                var bestScore = double.NegativeInfinity;
                foreach (var raw in candidates)
                {
                    var c = Model.ClampToPitch(raw, 1.5);
                    var lane = Model.LaneOpenness(s, holder.Pos, c, team);
                    Model.NearestOpponent(s, c, team, out var nd);
                    var space = Vec2.Clamp(nd / 6, 0, 1);
                    var score = lane * (0.35 + 0.65 * space) - 0.025 * Vec2.Dist(c, p.Anchor) + 0.006 * (c.X - p.Pos.X) * dir + rng.Range(0, 0.02);
                    if (score > bestScore)
                    {
                        bestScore = score;
                        best = c;
                    }
                }
                targets[p.Id] = best;
            }
            return targets;
        }

        /// <summary>Move attackers toward their planned spots for a fraction of a tick.</summary>
        public static void MoveAttackers(State s, Dictionary<string, Vec2> targets, double dt = 1)
        {
            foreach (var p in s.Players)
            {
                if (!targets.TryGetValue(p.Id, out var target)) continue;
                p.Pos = Vec2.MoveToward(p.Pos, target, (p.Role == Role.GK ? 3 : SpeedSupport) * dt);
                Face(p, s.Ball);
            }
        }

        public static void StepAttackers(State s, Rng rng, double dt = 1) => MoveAttackers(s, PlanAttackers(s, rng), dt);
    }
}
