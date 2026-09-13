using System;

namespace Gaffa.Engine
{
    /// <summary>Pitch-plane vector in metres. Mirrors src/sim/vec.ts.</summary>
    public struct Vec2
    {
        public double X;
        public double Y;

        public Vec2(double x, double y)
        {
            X = x;
            Y = y;
        }

        public static Vec2 Add(Vec2 a, Vec2 b) => new Vec2(a.X + b.X, a.Y + b.Y);
        public static Vec2 Sub(Vec2 a, Vec2 b) => new Vec2(a.X - b.X, a.Y - b.Y);
        public static Vec2 Scale(Vec2 a, double k) => new Vec2(a.X * k, a.Y * k);
        public static double Len(Vec2 a) => Hypot(a.X, a.Y);
        public static double Dist(Vec2 a, Vec2 b) => Hypot(a.X - b.X, a.Y - b.Y);
        public static Vec2 Lerp(Vec2 a, Vec2 b, double t) => new Vec2(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t);
        public static double Clamp(double v, double lo, double hi) => Math.Min(hi, Math.Max(lo, v));
        public static double AngleOf(Vec2 a) => Math.Atan2(a.Y, a.X);

        /// <summary>Same as JS Math.hypot for two arguments.</summary>
        public static double Hypot(double x, double y) => Math.Sqrt(x * x + y * y);

        public static Vec2 Norm(Vec2 a)
        {
            var l = Len(a);
            return l < 1e-9 ? new Vec2(0, 0) : new Vec2(a.X / l, a.Y / l);
        }

        /// <summary>Distance from p to segment ab, the parameter t of the closest point, and that point.</summary>
        public static void DistToSegment(Vec2 p, Vec2 a, Vec2 b, out double d, out double t, out Vec2 q)
        {
            var ab = Sub(b, a);
            var l2 = ab.X * ab.X + ab.Y * ab.Y;
            if (l2 < 1e-9)
            {
                d = Dist(p, a);
                t = 0;
                q = a;
                return;
            }
            t = Clamp(((p.X - a.X) * ab.X + (p.Y - a.Y) * ab.Y) / l2, 0, 1);
            q = Add(a, Scale(ab, t));
            d = Dist(p, q);
        }

        public static Vec2 MoveToward(Vec2 from, Vec2 to, double maxStep)
        {
            var d = Dist(from, to);
            if (d <= maxStep) return to;
            return Add(from, Scale(Norm(Sub(to, from)), maxStep));
        }

        public override string ToString() => $"({X:0.00}, {Y:0.00})";
    }
}
