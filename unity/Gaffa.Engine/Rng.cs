using System;
using System.Collections.Generic;

namespace Gaffa.Engine
{
    /// <summary>mulberry32, bit-for-bit compatible with the TypeScript engine so seeds are shareable.</summary>
    public sealed class Rng
    {
        private uint _a;

        public Rng(uint seed)
        {
            _a = seed;
        }

        public double Next()
        {
            _a += 0x6d2b79f5u;
            uint t = _a;
            t = (t ^ (t >> 15)) * (t | 1u);
            t ^= t + ((t ^ (t >> 7)) * (t | 61u));
            return (t ^ (t >> 14)) / 4294967296.0;
        }

        public double Range(double lo, double hi) => lo + Next() * (hi - lo);
        public bool Chance(double p) => Next() < p;

        public T Pick<T>(IReadOnlyList<T> items)
        {
            var i = (int)Math.Floor(Next() * items.Count);
            return items[i];
        }

        /// <summary>FNV-1a over UTF-16 code units, as the TypeScript version does.</summary>
        public static uint HashString(string s)
        {
            uint h = 2166136261u;
            foreach (var c in s)
            {
                h ^= c;
                h *= 16777619u;
            }
            return h;
        }
    }
}
