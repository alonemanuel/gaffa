using System;
using System.Collections.Generic;

namespace Gaffa.Engine
{
    public struct Keyframe<TValue>
    {
        public double T;
        public TValue V;

        public Keyframe(double t, TValue v)
        {
            T = t;
            V = v;
        }
    }

    public struct BallKey
    {
        public Vec2 Pos;
        /// <summary>The leg starting at this key is in the air.</summary>
        public bool Loft;
    }

    /// <summary>
    /// A resolution's motion as keyframe tracks so playback follows what actually
    /// happened. Times are seconds of football; the presentation chooses the speed.
    /// </summary>
    public sealed class Timeline
    {
        public double Duration;
        public readonly List<Keyframe<BallKey>> Ball = new List<Keyframe<BallKey>>();
        /// <summary>Positions indexed like State.Players.</summary>
        public readonly List<Keyframe<Vec2[]>> Players = new List<Keyframe<Vec2[]>>();
    }

    public struct TimelineSample
    {
        public Vec2[] Players;
        /// <summary>Facing from velocity; NaN when standing still.</summary>
        public double[] Facings;
        public Vec2 Ball;
        public double Z;
    }

    public static class TimelineSampler
    {
        private static void Bracket<TValue>(List<Keyframe<TValue>> kfs, double t, out Keyframe<TValue> a, out Keyframe<TValue> b, out double u)
        {
            if (kfs.Count == 0) throw new InvalidOperationException("empty track");
            var first = kfs[0];
            var last = kfs[kfs.Count - 1];
            if (t <= first.T) { a = first; b = first; u = 0; return; }
            if (t >= last.T) { a = last; b = last; u = 0; return; }
            for (var i = 0; i < kfs.Count - 1; i++)
            {
                var ka = kfs[i];
                var kb = kfs[i + 1];
                if (t >= ka.T && t <= kb.T)
                {
                    var span = kb.T - ka.T;
                    a = ka; b = kb; u = span < 1e-6 ? 0 : (t - ka.T) / span;
                    return;
                }
            }
            a = last; b = last; u = 0;
        }

        private static double Smooth(double u) => u * u * (3 - 2 * u);

        public static TimelineSample Sample(Timeline tl, double t)
        {
            Bracket(tl.Players, t, out var pa, out var pb, out var pu);
            var players = new Vec2[pa.V.Length];
            for (var i = 0; i < players.Length; i++) players[i] = Vec2.Lerp(pa.V[i], i < pb.V.Length ? pb.V[i] : pa.V[i], pu);

            Bracket(tl.Ball, t, out var ba, out var bb, out var bu);
            // A struck ball leaves fast and slows as it rolls; lofted balls fly evenly.
            var roll = ba.V.Loft ? bu : 1 - Math.Pow(1 - bu, 1.8);
            var ball = Vec2.Lerp(ba.V.Pos, bb.V.Pos, roll);
            var z = ba.V.Loft && !(ba.T == bb.T) ? Math.Sin(Math.PI * Smooth(bu)) : 0;

            var back = Math.Max(0, t - 0.12);
            Bracket(tl.Players, back, out var qa, out var qb, out var qu);
            var facings = new double[players.Length];
            for (var i = 0; i < players.Length; i++)
            {
                var prev = Vec2.Lerp(i < qa.V.Length ? qa.V[i] : players[i], i < qb.V.Length ? qb.V[i] : players[i], qu);
                facings[i] = Vec2.Dist(prev, players[i]) > 0.04 ? Math.Atan2(players[i].Y - prev.Y, players[i].X - prev.X) : double.NaN;
            }
            return new TimelineSample { Players = players, Facings = facings, Ball = ball, Z = Math.Max(0, Math.Min(1, z)) };
        }
    }
}
