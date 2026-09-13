using System;
using System.Collections.Generic;

namespace Gaffa.Engine
{
    /// <summary>
    /// The probability model. This file is the only "opinion" in the engine:
    /// every outcome is computed from geometry here, never authored per scenario.
    /// Mirrors src/sim/model.ts.
    /// </summary>
    public static class Model
    {
        public const double ChanceValue = 1;

        public static double AttackDir(Team team) => team == Team.Us ? 1 : -1;

        public static List<Player> OpponentsOf(State s, Team team)
        {
            var list = new List<Player>();
            foreach (var p in s.Players) if (p.Team != team) list.Add(p);
            return list;
        }

        public static List<Player> TeammatesOf(State s, Team team)
        {
            var list = new List<Player>();
            foreach (var p in s.Players) if (p.Team == team) list.Add(p);
            return list;
        }

        public static Player NearestOpponent(State s, Vec2 pos, Team team, out double d)
        {
            Player? best = null;
            var bestD = double.PositiveInfinity;
            foreach (var p in s.Players)
            {
                if (p.Team == team) continue;
                var dd = Vec2.Dist(p.Pos, pos);
                if (dd < bestD)
                {
                    bestD = dd;
                    best = p;
                }
            }
            if (best == null) throw new InvalidOperationException("no opponents");
            d = bestD;
            return best;
        }

        /// <summary>1 when an opponent is on top of you, 0 when the nearest is 6m+ away.</summary>
        public static double PressureAt(State s, Vec2 pos, Team team)
        {
            NearestOpponent(s, pos, team, out var d);
            return Vec2.Clamp(1 - d / 6, 0, 1);
        }

        /// <summary>Probability that no defender gets a foot to a ball travelling from -> to.</summary>
        public static double LaneOpenness(State s, Vec2 from, Vec2 to, Team team)
        {
            var d = Vec2.Dist(from, to);
            var r = 1.3 + 0.06 * d;
            var open = 1.0;
            foreach (var def in s.Players)
            {
                if (def.Team == team) continue;
                Vec2.DistToSegment(def.Pos, from, to, out var dl, out var t, out _);
                if (t < 0.08 || t > 0.97) continue;
                open *= 1 - 0.92 * Math.Exp(-(dl * dl) / (r * r));
            }
            return open;
        }

        public static double PassProb(State s, Player passer, Player receiver)
        {
            var d = Vec2.Dist(passer.Pos, receiver.Pos);
            var pDist = d < 8 ? 0.97 : Math.Max(0.3, 0.97 - 0.011 * (d - 8));
            var lane = LaneOpenness(s, passer.Pos, receiver.Pos, passer.Team);
            var recv = 1 - 0.3 * PressureAt(s, receiver.Pos, receiver.Team);
            var pass = 1 - 0.25 * PressureAt(s, passer.Pos, passer.Team);
            return Vec2.Clamp(pDist * lane * recv * pass, 0.02, 0.98);
        }

        public static Vec2 ClampToPitch(Vec2 p, double margin = 1) =>
            new Vec2(Vec2.Clamp(p.X, margin, Pitch.L - margin), Vec2.Clamp(p.Y, margin, Pitch.W - margin));

        /// <summary>Where a dribble takes the carrier: forward, bending away from the nearest presser.</summary>
        public static Vec2 DribbleTarget(State s, Player carrier)
        {
            var presser = NearestOpponent(s, carrier.Pos, carrier.Team, out _);
            var forward = new Vec2(AttackDir(carrier.Team), 0);
            var away = Vec2.Norm(Vec2.Sub(carrier.Pos, presser.Pos));
            var dir = Vec2.Norm(Vec2.Add(forward, Vec2.Scale(away, 0.8)));
            return ClampToPitch(Vec2.Add(carrier.Pos, Vec2.Scale(dir, 8)), 1.5);
        }

        public static double DribbleProb(State s, Player carrier)
        {
            var ds = new List<double>();
            foreach (var p in OpponentsOf(s, carrier.Team)) ds.Add(Vec2.Dist(p.Pos, carrier.Pos));
            ds.Sort();
            var d1 = ds.Count > 0 ? ds[0] : 99;
            var d2 = ds.Count > 1 ? ds[1] : 99;
            var p1 = 0.25 + 0.5 * Vec2.Clamp(d1 / 7, 0, 1);
            p1 *= 0.6 + 0.4 * Vec2.Clamp((d2 - 3) / 8, 0, 1);
            var target = DribbleTarget(s, carrier);
            NearestOpponent(s, target, carrier.Team, out var spaceAhead);
            p1 *= 0.7 + 0.3 * Vec2.Clamp(spaceAhead / 6, 0, 1);
            return Vec2.Clamp(p1, 0.05, 0.92);
        }

        // ---- Value of terminal states, from the holding team's point of view. ----

        /// <summary>Metres advanced from the team's own goal line.</summary>
        public static double ProgressOf(Vec2 pos, Team team) => team == Team.Us ? pos.X : Pitch.L - pos.X;

        /// <summary>Losing the ball is worse the closer to your own goal it happens.</summary>
        public static double LossValue(Vec2 ballPos, Team team = Team.Us)
        {
            var danger = Vec2.Clamp(1 - ProgressOf(ballPos, team) / 35, 0, 1);
            return -(0.25 + 0.75 * danger);
        }

        /// <summary>Still in possession at the end of the horizon: reward progress and calm.</summary>
        public static double RetainValue(State s, Player holder)
        {
            var prog = Vec2.Clamp((ProgressOf(s.Ball, holder.Team) - 8) / 45, 0, 1);
            var calm = 1 - PressureAt(s, holder.Pos, holder.Team);
            return 0.15 + 0.65 * prog + 0.2 * calm;
        }

        public static Vec2 GoalOf(Team team) => team == Team.Us ? new Vec2(Pitch.L, Pitch.W / 2) : new Vec2(0, Pitch.W / 2);

        public static bool InShootingRange(State s, Player shooter) =>
            ProgressOf(shooter.Pos, shooter.Team) > 42 && PressureAt(s, shooter.Pos, shooter.Team) < 0.6;

        public static double ShotProb(State s, Player shooter)
        {
            var d = Vec2.Dist(shooter.Pos, GoalOf(shooter.Team));
            var p = Vec2.Clamp(0.55 - d / 40, 0.08, 0.5);
            return p * (1 - 0.4 * PressureAt(s, shooter.Pos, shooter.Team));
        }

        public static double ClearValue(State s)
        {
            var holder = s.Holder != null ? s.PlayerById(s.Holder) : null;
            return holder != null && holder.Team == Team.Us ? 0.15 : -0.15;
        }

        /// <summary>Carrier in the final third with room: we count that as a chance created.</summary>
        public static bool IsChance(State s, Player holder) =>
            ProgressOf(holder.Pos, holder.Team) > 46 && PressureAt(s, holder.Pos, holder.Team) < 0.35;

        public static bool IsDangerZone(Vec2 ballPos, Team team = Team.Us) => ProgressOf(ballPos, team) < 25;
    }
}
