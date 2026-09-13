using System;
using System.Collections.Generic;
using System.Linq;

namespace Gaffa.Engine
{
    public sealed class Moment
    {
        public uint Id;
        public string Title = "";
        public string Prompt = "";
        /// <summary>The frozen state you decide from.</summary>
        public State State;
        public string CarrierId = "";
        /// <summary>The live passage that led here, for playback. Empty when continuing a sequence.</summary>
        public List<Resolution> Prelude = new List<Resolution>();

        public Moment(State state)
        {
            State = state;
        }
    }

    /// <summary>
    /// Scenario seeds. A seed is a shape, a scripted prelude and a perturbation; the
    /// sim runs the prelude so every position at the freeze is a true consequence.
    /// Mirrors src/scenarios/buildup.ts.
    /// </summary>
    public static class Buildup
    {
        private static readonly Role[] RoleOrder = { Role.GK, Role.LCB, Role.RCB, Role.LM, Role.CM, Role.RM, Role.ST };

        private static readonly Dictionary<Role, Vec2> OurShape = new Dictionary<Role, Vec2>
        {
            { Role.GK, new Vec2(4, 20) },
            { Role.LCB, new Vec2(14, 11) },
            { Role.RCB, new Vec2(14, 29) },
            { Role.LM, new Vec2(26, 6) },
            { Role.CM, new Vec2(23, 20) },
            { Role.RM, new Vec2(26, 34) },
            { Role.ST, new Vec2(37, 20) },
        };

        /// <summary>Their pressing shape, already in our half.</summary>
        private static readonly Dictionary<Role, Vec2> TheirShape = new Dictionary<Role, Vec2>
        {
            { Role.GK, new Vec2(56, 20) },
            { Role.LCB, new Vec2(46, 27) },
            { Role.RCB, new Vec2(46, 13) },
            { Role.LM, new Vec2(33, 31) },
            { Role.CM, new Vec2(31, 20) },
            { Role.RM, new Vec2(33, 9) },
            { Role.ST, new Vec2(23, 20) },
        };

        private static readonly Dictionary<Role, int> Nums = new Dictionary<Role, int>
        {
            { Role.GK, 1 }, { Role.LCB, 4 }, { Role.RCB, 5 }, { Role.LM, 7 }, { Role.CM, 8 }, { Role.RM, 11 }, { Role.ST, 9 },
        };

        private sealed class Template
        {
            public string Title = "";
            /// <summary>Roles in passing order; the last one is you. Written for the left side; mirrored at random.</summary>
            public Role[] Chain = Array.Empty<Role>();
        }

        private static readonly Template[] Templates =
        {
            new Template { Title = "Build-up under press", Chain = new[] { Role.GK, Role.RCB, Role.LCB } },
            new Template { Title = "Switch across the back", Chain = new[] { Role.RCB, Role.LCB } },
            new Template { Title = "Receiving in midfield", Chain = new[] { Role.GK, Role.LCB, Role.CM } },
            new Template { Title = "Pinned on the touchline", Chain = new[] { Role.RCB, Role.LCB, Role.LM } },
            new Template { Title = "Keeper under pressure", Chain = new[] { Role.LCB, Role.GK } },
        };

        private static Role MirrorRole(Role r) => r switch
        {
            Role.LCB => Role.RCB,
            Role.RCB => Role.LCB,
            Role.LM => Role.RM,
            Role.RM => Role.LM,
            _ => r,
        };

        private static Vec2 MirrorY(Vec2 p) => new Vec2(p.X, Pitch.W - p.Y);

        private static Player Mk(Team team, Role role, Vec2 pos) =>
            new Player((team == Team.Us ? "u" : "t") + "-" + role, team, role, Nums[role], pos, pos, team == Team.Us ? 0 : Math.PI);

        private static Vec2 Wobble(Rng rng, Vec2 p, double amt) => new Vec2(p.X + rng.Range(-amt, amt), p.Y + rng.Range(-amt, amt));

        private static Player ByRole(IEnumerable<Player> team, Role role)
        {
            foreach (var p in team) if (p.Role == role) return p;
            throw new InvalidOperationException(role.ToString());
        }

        /// <summary>JS Math.round: halves round up.</summary>
        private static int JsRound(double v) => (int)Math.Floor(v + 0.5);

        private static string Describe(State final, Player carrier, Resolution last)
        {
            var senderId = last.Before.Holder;
            var sender = senderId != null ? final.PlayerById(senderId) : null;
            var presser = Model.NearestOpponent(final, carrier.Pos, carrier.Team, out var d);
            var presserBefore = last.Before.PlayerById(presser.Id);
            var closing = Vec2.Dist(presserBefore.Pos, carrier.Pos) - d > 1.5;
            var opening = sender != null ? $"{Names.ShortName(sender)} has just played it to you." : "The ball is yours.";
            var threat = d < 3
                ? $"Their {Names.ShortName(presser)} is right on your back."
                : closing
                    ? $"Their {Names.ShortName(presser)} is charging at you."
                    : $"Their {Names.ShortName(presser)} is {JsRound(d)}m off and watching.";
            return $"You're the {carrier.Role}. {opening} {threat}";
        }

        public static Moment Generate(uint seed)
        {
            var rng = new Rng(seed);
            var flip = rng.Chance(0.5);
            Vec2 M(Vec2 p) => flip ? MirrorY(p) : p;
            Role R(Role r) => flip ? MirrorRole(r) : r;

            // How high they press this time: 0 = sitting off, 1 = all in.
            var aggression = rng.Range(0.15, 1);
            var pushUp = 8 * aggression;

            var us = new List<Player>();
            foreach (var r in RoleOrder) us.Add(Mk(Team.Us, r, M(Wobble(rng, OurShape[r], 1.5))));
            var them = new List<Player>();
            foreach (var r in RoleOrder)
            {
                var b = TheirShape[r];
                var pos = r == Role.GK ? b : new Vec2(b.X - pushUp, b.Y);
                them.Add(Mk(Team.Them, r, M(Wobble(rng, pos, r == Role.GK ? 0.5 : 2.5))));
            }

            var template = rng.Pick(Templates);
            var chain = template.Chain.Select(R).ToArray();

            var first = ByRole(us, chain[0]);
            var players = new List<Player>(us);
            players.AddRange(them);
            var state = new State(players, first.Pos, first.Id, 0);
            foreach (var p in state.Players) p.Facing = Math.Atan2(state.Ball.Y - p.Pos.Y, state.Ball.X - p.Pos.X);

            var prelude = new List<Resolution>();
            for (var i = 1; i < chain.Length; i++)
            {
                var to = ByRole(state.Players.Where(p => p.Team == Team.Us), chain[i]);
                var isLast = i == chain.Length - 1;
                // On the last ball the press reads the pass and is already moving while it travels.
                var res = Step.ResolveAction(state, GameAction.Pass(to.Id), rng, new ResolveOpts { ForceSuccess = true, TickScale = isLast ? 1.15 : 1 });
                prelude.Add(res);
                state = res.After;
            }

            var last = prelude[prelude.Count - 1];
            var carrierId = state.Holder ?? throw new InvalidOperationException("prelude produced no carrier");
            var carrier = state.PlayerById(carrierId);

            return new Moment(state)
            {
                Id = seed,
                Title = template.Title,
                Prompt = Describe(state, carrier, last),
                CarrierId = carrierId,
                Prelude = prelude,
            };
        }
    }
}
