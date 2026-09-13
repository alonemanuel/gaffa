using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using Gaffa.Engine;
using Xunit;

namespace Gaffa.Engine.Tests
{
    /// <summary>
    /// The TypeScript engine is the reference. fixtures/moments.json was produced by it;
    /// these tests prove the C# port reproduces the same moments from the same seeds.
    /// </summary>
    public class ParityTests
    {
        private static readonly JsonDocument Fixture = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "fixtures", "moments.json")));

        private static string Ts(Outcome o) => o.ToString().ToLowerInvariant();

        [Fact]
        public void RngMatchesTypeScript()
        {
            var rng = new Rng(12345);
            var expected = Fixture.RootElement.GetProperty("rngSample").EnumerateArray().Select(e => e.GetDouble()).ToArray();
            foreach (var e in expected) Assert.Equal(e, rng.Next(), 15);
        }

        [Fact]
        public void HashMatchesTypeScript()
        {
            Assert.Equal(Fixture.RootElement.GetProperty("hashAbc").GetUInt32(), Rng.HashString("abc"));
            Assert.Equal(Fixture.RootElement.GetProperty("hashPass").GetUInt32(), Rng.HashString("pass:u-GK"));
        }

        public static TheoryData<int> Seeds()
        {
            var data = new TheoryData<int>();
            foreach (var m in Fixture.RootElement.GetProperty("moments").EnumerateArray()) data.Add(m.GetProperty("seed").GetInt32());
            return data;
        }

        private static JsonElement MomentFor(int seed) =>
            Fixture.RootElement.GetProperty("moments").EnumerateArray().First(m => m.GetProperty("seed").GetInt32() == seed);

        [Theory]
        [MemberData(nameof(Seeds))]
        public void MomentMatches(int seed)
        {
            var f = MomentFor(seed);
            var m = Buildup.Generate((uint)seed);
            Assert.Equal(f.GetProperty("title").GetString(), m.Title);
            Assert.Equal(f.GetProperty("carrierId").GetString(), m.CarrierId);
            Assert.Equal(f.GetProperty("prompt").GetString(), m.Prompt);

            var players = f.GetProperty("players").EnumerateArray().ToArray();
            Assert.Equal(players.Length, m.State.Players.Count);
            for (var i = 0; i < players.Length; i++)
            {
                Assert.Equal(players[i].GetProperty("id").GetString(), m.State.Players[i].Id);
                Assert.Equal(players[i].GetProperty("x").GetDouble(), m.State.Players[i].Pos.X, 6);
                Assert.Equal(players[i].GetProperty("y").GetDouble(), m.State.Players[i].Pos.Y, 6);
            }

            var prelude = f.GetProperty("prelude").EnumerateArray().ToArray();
            Assert.Equal(prelude.Length, m.Prelude.Count);
            for (var i = 0; i < prelude.Length; i++)
            {
                Assert.Equal(prelude[i].GetProperty("text").GetString(), m.Prelude[i].Text);
                Assert.Equal(prelude[i].GetProperty("outcome").GetString(), Ts(m.Prelude[i].Outcome));
                Assert.Equal(prelude[i].GetProperty("duration").GetDouble(), m.Prelude[i].Timeline.Duration, 6);
                Assert.Equal(prelude[i].GetProperty("ballKeys").GetInt32(), m.Prelude[i].Timeline.Ball.Count);
                Assert.Equal(prelude[i].GetProperty("playerKeys").GetInt32(), m.Prelude[i].Timeline.Players.Count);
            }
        }

        [Theory]
        [MemberData(nameof(Seeds))]
        public void GradingMatches(int seed)
        {
            var f = MomentFor(seed);
            var m = Buildup.Generate((uint)seed);
            var evals = Rollout.EvaluateOptions(m.State, m.CarrierId, m.Id);
            var expected = f.GetProperty("evals").EnumerateArray().ToDictionary(e => e.GetProperty("key").GetString()!, e => e);
            Assert.Equal(expected.Count, evals.Count);
            foreach (var e in evals)
            {
                var x = expected[e.Key];
                Assert.Equal(x.GetProperty("immediate").GetDouble(), e.Immediate, 9);
                // Monte Carlo over identical RNG streams: identical unless a floating-point
                // last-bit difference flips a single roll. Allow a small drift.
                Assert.InRange(e.Ev, x.GetProperty("ev").GetDouble() - 1e-9, x.GetProperty("ev").GetDouble() + 1e-9);
                Assert.InRange(e.Retain, x.GetProperty("retain").GetDouble() - 1e-9, x.GetProperty("retain").GetDouble() + 1e-9);
            }
            // The best option is the same call in both engines.
            Assert.Equal(f.GetProperty("evals")[0].GetProperty("key").GetString(), evals[0].Key);
        }

        [Theory]
        [MemberData(nameof(Seeds))]
        public void ResolutionMatches(int seed)
        {
            var f = MomentFor(seed).GetProperty("bestResolution");
            var m = Buildup.Generate((uint)seed);
            var evals = Rollout.EvaluateOptions(m.State, m.CarrierId, m.Id);
            var res = Step.ResolveAction(m.State, evals[0].Action, new Rng((uint)(seed * 7 + 1)));
            Assert.Equal(f.GetProperty("text").GetString(), res.Text);
            Assert.Equal(f.GetProperty("outcome").GetString(), Ts(res.Outcome));
            Assert.Equal(f.GetProperty("duration").GetDouble(), res.Timeline.Duration, 6);
            Assert.Equal(f.GetProperty("holder").GetString(), res.After.Holder);
        }
    }
}
