using System;
using System.Collections.Generic;
using System.Linq;

namespace Gaffa.Engine
{
    public struct ResolveOpts
    {
        /// <summary>Scripted preludes: the action cannot fail.</summary>
        public bool ForceSuccess;
        /// <summary>How much of a tick the other players get to move afterwards. 0 means default (1).</summary>
        public double TickScale;
    }

    /// <summary>Resolves actions and records their motion. Mirrors src/sim/step.ts.</summary>
    public static class Step
    {
        private const double PassSpeed = 13; // m/s along the ground
        private const double LongSpeed = 17;
        private const double ShotSpeed = 20;
        private const double Pre = 0.35; // seconds the carrier takes to set himself
        private const int Substeps = 4;
        private const double React = 0.4; // seconds before the others read the ball and move

        private struct GlideTrack
        {
            public int Idx;
            public Vec2 From;
            public Vec2 To;
            public double T0;
            public double T1;
        }

        /// <summary>Records keyframes while a tick is simulated in sub-steps.</summary>
        private sealed class Recorder
        {
            public readonly Timeline Tl = new Timeline();
            private readonly List<GlideTrack> _glides = new List<GlideTrack>();
            private readonly State _s;

            public Recorder(State s)
            {
                _s = s;
            }

            public void Glide(int idx, Vec2 from, Vec2 to, double t0, double t1) =>
                _glides.Add(new GlideTrack { Idx = idx, From = from, To = to, T0 = t0, T1 = t1 });

            public void Ball(double t, Vec2 pos, bool loft = false)
            {
                Tl.Ball.Add(new Keyframe<BallKey>(t, new BallKey { Pos = pos, Loft = loft }));
                Tl.Duration = Math.Max(Tl.Duration, t);
            }

            public void MarkLastBallLofted()
            {
                var last = Tl.Ball[Tl.Ball.Count - 1];
                last.V.Loft = true;
                Tl.Ball[Tl.Ball.Count - 1] = last;
            }

            /// <summary>Snapshot every player at time t, with glides overriding the sim position.</summary>
            public void Players(double t)
            {
                var v = new Vec2[_s.Players.Count];
                for (var i = 0; i < v.Length; i++)
                {
                    var found = false;
                    foreach (var g in _glides)
                    {
                        if (g.Idx != i) continue;
                        var u = Vec2.Clamp((t - g.T0) / Math.Max(1e-6, g.T1 - g.T0), 0, 1);
                        v[i] = Vec2.Lerp(g.From, g.To, u);
                        found = true;
                        break;
                    }
                    if (!found) v[i] = _s.Players[i].Pos;
                }
                Tl.Players.Add(new Keyframe<Vec2[]>(t, v));
                Tl.Duration = Math.Max(Tl.Duration, t);
            }

            public void Hold(double t)
            {
                if (Tl.Ball.Count > 0) Ball(t, Tl.Ball[Tl.Ball.Count - 1].V.Pos);
                Players(t);
            }
        }

        public static List<GameAction> AvailableActions(State s, string carrierId)
        {
            var carrier = s.PlayerById(carrierId);
            var actions = new List<GameAction>();
            foreach (var p in Model.TeammatesOf(s, carrier.Team))
                if (p.Id != carrierId) actions.Add(GameAction.Pass(p.Id));
            actions.Add(GameAction.Dribble);
            actions.Add(GameAction.Clear);
            return actions;
        }

        public static string ActionLabel(State s, GameAction a)
        {
            if (a.Kind == ActionKind.Pass) return "Pass to " + Names.ShortName(s.PlayerById(a.To!));
            if (a.Kind == ActionKind.Dribble)
            {
                if (s.Holder == null) return "Dribble";
                var carrier = s.PlayerById(s.Holder);
                var presser = Model.NearestOpponent(s, carrier.Pos, carrier.Team, out _);
                return "Dribble past " + Names.ShortName(presser);
            }
            return "Clear it long";
        }

        /// <summary>Resolve one action for the current holder, then advance every other player one tick.</summary>
        public static Resolution ResolveAction(State s, GameAction action, Rng rng, ResolveOpts opts = default)
        {
            if (s.Holder == null) throw new InvalidOperationException("no holder");
            var before = s.Clone();
            var after = s.Clone();
            var carrier = after.PlayerById(s.Holder);
            var start = carrier.Pos;
            var rec = new Recorder(after);
            var success = false;
            var outcome = Outcome.Retained;
            var text = "";
            var ballPath = new List<Vec2> { start };
            var flightEnd = Pre;
            var tickScale = opts.TickScale == 0 ? 1 : opts.TickScale;

            rec.Ball(0, start);
            rec.Players(0);
            rec.Ball(Pre, start);
            rec.Players(Pre);

            if (action.Kind == ActionKind.Pass)
            {
                var receiver = after.PlayerById(action.To!);
                var p = Model.PassProb(before, before.PlayerById(carrier.Id), before.PlayerById(receiver.Id));
                success = opts.ForceSuccess || rng.Chance(p);
                if (success)
                {
                    var tf = Math.Max(0.45, Vec2.Dist(start, receiver.Pos) / PassSpeed);
                    flightEnd = Pre + tf;
                    after.Ball = receiver.Pos;
                    after.Holder = receiver.Id;
                    ballPath.Add(receiver.Pos);
                    rec.Ball(flightEnd, receiver.Pos);
                    text = Names.Sentence($"{Names.NameOf(carrier)} finds {Names.NameOf(receiver)}.");
                }
                else
                {
                    outcome = Outcome.Lost;
                    var d = Vec2.Dist(start, receiver.Pos);
                    var r = 1.3 + 0.06 * d;
                    Player? interceptor = null;
                    var bestW = 0.0;
                    var at = receiver.Pos;
                    foreach (var def in Model.OpponentsOf(after, carrier.Team))
                    {
                        Vec2.DistToSegment(def.Pos, start, receiver.Pos, out var sd, out var st, out var sq);
                        if (st < 0.08 || st > 0.97) continue;
                        var w = Math.Exp(-(sd * sd) / (r * r));
                        if (w > bestW)
                        {
                            bestW = w;
                            interceptor = def;
                            at = sq;
                        }
                    }
                    if (interceptor != null && bestW > 0.15)
                    {
                        var tf = Math.Max(0.4, Vec2.Dist(start, at) / PassSpeed);
                        flightEnd = Pre + tf;
                        rec.Glide(after.IndexOf(interceptor.Id), interceptor.Pos, at, Pre, flightEnd);
                        interceptor.Pos = at;
                        after.Ball = at;
                        after.Holder = interceptor.Id;
                        ballPath.Add(at);
                        rec.Ball(flightEnd, at);
                        text = Names.Sentence($"cut out by {Names.NameOf(interceptor)}.");
                    }
                    else
                    {
                        var tf = Math.Max(0.45, d / PassSpeed);
                        var pouncer = Model.NearestOpponent(after, receiver.Pos, carrier.Team, out _);
                        var spot = Vec2.Add(receiver.Pos, Vec2.Scale(Vec2.Norm(Vec2.Sub(pouncer.Pos, receiver.Pos)), 1));
                        rec.Glide(after.IndexOf(pouncer.Id), pouncer.Pos, spot, Pre + tf * 0.5, Pre + tf + 0.45);
                        pouncer.Pos = spot;
                        after.Ball = spot;
                        after.Holder = pouncer.Id;
                        ballPath.Add(receiver.Pos);
                        ballPath.Add(spot);
                        rec.Ball(Pre + tf, receiver.Pos);
                        flightEnd = Pre + tf + 0.45;
                        rec.Ball(flightEnd, spot);
                        text = Names.Sentence($"{Names.NameOf(receiver)} takes a heavy touch and {Names.NameOf(pouncer)} pounces.");
                    }
                }
            }
            else if (action.Kind == ActionKind.Dribble)
            {
                var p = Model.DribbleProb(before, before.PlayerById(carrier.Id));
                var presser = Model.NearestOpponent(after, carrier.Pos, carrier.Team, out _);
                var target = Model.DribbleTarget(before, before.PlayerById(carrier.Id));
                success = opts.ForceSuccess || rng.Chance(p);
                if (success)
                {
                    const double td = 1.3;
                    flightEnd = Pre + td;
                    var beatenSpot = Vec2.Add(start, Vec2.Scale(Vec2.Norm(Vec2.Sub(target, start)), 1.5));
                    rec.Glide(after.IndexOf(carrier.Id), start, target, Pre, flightEnd);
                    rec.Glide(after.IndexOf(presser.Id), presser.Pos, beatenSpot, Pre, Pre + 0.8);
                    presser.Pos = beatenSpot;
                    carrier.Pos = target;
                    after.Ball = target;
                    after.Beaten = presser.Id;
                    ballPath.Add(target);
                    rec.Ball(flightEnd, target);
                    text = Names.Sentence($"{Names.NameOf(carrier)} carries it past {Names.NameOf(presser)}.");
                }
                else
                {
                    outcome = Outcome.Lost;
                    var caught = Vec2.Lerp(start, target, 0.4);
                    var spot = Vec2.Add(caught, Vec2.Scale(Vec2.Norm(Vec2.Sub(presser.Pos, caught)), 1.1));
                    rec.Glide(after.IndexOf(carrier.Id), start, caught, Pre, Pre + 0.7);
                    rec.Glide(after.IndexOf(presser.Id), presser.Pos, spot, Pre, Pre + 0.7);
                    carrier.Pos = caught;
                    presser.Pos = spot;
                    after.Ball = spot;
                    after.Holder = presser.Id;
                    ballPath.Add(caught);
                    ballPath.Add(spot);
                    rec.Ball(Pre + 0.7, caught);
                    flightEnd = Pre + 0.95;
                    rec.Ball(flightEnd, spot);
                    text = Names.Sentence($"{Names.NameOf(carrier)} tries to carry it and {Names.NameOf(presser)} nicks it off their toe.");
                }
            }
            else
            {
                var dir = Model.AttackDir(carrier.Team);
                var landing = Model.ClampToPitch(new Vec2(start.X + dir * rng.Range(28, 36), rng.Range(6, Pitch.W - 6)), 2);
                var ours = Model.TeammatesOf(after, carrier.Team)
                    .Where(p => p.Id != carrier.Id && p.Role != Role.GK)
                    .OrderBy(p => Vec2.Dist(p.Pos, landing))
                    .FirstOrDefault();
                var theirs = Model.OpponentsOf(after, carrier.Team)
                    .Where(p => p.Role != Role.GK)
                    .OrderBy(p => Vec2.Dist(p.Pos, landing))
                    .FirstOrDefault();
                var weWin = rng.Chance(0.3);
                var winner = weWin ? ours : theirs;
                if (winner == null) throw new InvalidOperationException("no one to win the second ball");
                var tf = Math.Max(1, Vec2.Dist(start, landing) / LongSpeed);
                flightEnd = Pre + tf;
                rec.Glide(after.IndexOf(winner.Id), winner.Pos, landing, Pre, flightEnd);
                winner.Pos = landing;
                after.Ball = landing;
                after.Holder = winner.Id;
                ballPath.Add(landing);
                rec.MarkLastBallLofted();
                rec.Ball(flightEnd, landing);
                success = weWin;
                outcome = Outcome.Cleared;
                text = Names.Sentence(weWin
                    ? $"{Names.NameOf(carrier)} goes long and {Names.NameOf(winner)} wins the second ball."
                    : $"{Names.NameOf(carrier)} goes long; {Names.NameOf(winner)} collects.");
            }

            after.Tick += 1;

            if (outcome == Outcome.Retained)
            {
                // Everyone else reacts while the ball travels and settles just after it lands.
                var moveEnd = flightEnd + 0.6;
                // Speeds are m/s, so the movement budget is the real time the ball was in play.
                var dt = Math.Max(0.3, moveEnd - Pre - React) * tickScale;
                var targets = Policy.PlanAttackers(after, rng);
                for (var k = 1; k <= Substeps; k++)
                {
                    Policy.StepDefenders(after, rng, dt / Substeps);
                    Policy.MoveAttackers(after, targets, dt / Substeps);
                    rec.Players(Pre + ((moveEnd - Pre) * k) / Substeps);
                }
                rec.Ball(moveEnd, after.Ball);
                var holder = after.PlayerById(after.Holder!);
                if (Model.IsChance(after, holder))
                {
                    outcome = Outcome.Chance;
                    text += " Into the final third with room to play.";
                }
            }
            else
            {
                rec.Hold(flightEnd + 0.4);
            }

            return new Resolution(action, success, outcome, text, before, after, ballPath, rec.Tl);
        }

        /// <summary>A shot on goal from the current holder.</summary>
        public static Resolution ResolveShot(State s, Rng rng)
        {
            if (s.Holder == null) throw new InvalidOperationException("no holder");
            var before = s.Clone();
            var after = s.Clone();
            var shooter = after.PlayerById(s.Holder);
            var gk = after.Players.FirstOrDefault(p => p.Team != shooter.Team && p.Role == Role.GK);
            if (gk == null) throw new InvalidOperationException("no keeper");
            var goal = Model.GoalOf(shooter.Team);
            var p = Model.ShotProb(before, before.PlayerById(shooter.Id));
            var success = rng.Chance(p);
            var target = success
                ? new Vec2(goal.X, goal.Y + rng.Range(-2.2, 2.2))
                : new Vec2(gk.Pos.X, Vec2.Clamp(gk.Pos.Y + rng.Range(-1.5, 1.5), 1, Pitch.W - 1));
            var rec = new Recorder(after);
            var start = shooter.Pos;
            var tf = Math.Max(0.35, Vec2.Dist(start, target) / ShotSpeed);
            rec.Ball(0, start);
            rec.Players(0);
            rec.Ball(Pre, start);
            rec.Players(Pre);
            if (!success) rec.Glide(after.IndexOf(gk.Id), gk.Pos, target, Pre + tf * 0.3, Pre + tf);
            if (!success) gk.Pos = target;
            after.Ball = target;
            after.Holder = success ? null : gk.Id;
            after.Tick += 1;
            rec.Ball(Pre + tf, target);
            rec.Hold(Pre + tf + 0.6);
            var text = success
                ? Names.Sentence($"{Names.NameOf(shooter)} scores.")
                : Names.Sentence($"{Names.NameOf(shooter)} shoots and {Names.NameOf(gk)} saves.");
            return new Resolution(GameAction.Clear, success, success ? Outcome.Goal : Outcome.Saved, text, before, after, new List<Vec2> { start, target }, rec.Tl);
        }

        /// <summary>What the ball's new owner does when it reaches them: best one-step expected value.</summary>
        public static GameAction DefaultAction(State s, string carrierId)
        {
            var carrier = s.PlayerById(carrierId);
            var team = carrier.Team;
            var best = GameAction.Clear;
            var bestScore = 0.3 * 0.15 + 0.7 * -0.15;
            double GainAt(Vec2 pos)
            {
                var prog = Vec2.Clamp((Model.ProgressOf(pos, team) - 8) / 45, 0, 1);
                var calm = 1 - Model.PressureAt(s, pos, team);
                return 0.15 + 0.65 * prog + 0.2 * calm;
            }
            foreach (var mate in Model.TeammatesOf(s, team))
            {
                if (mate.Id == carrierId) continue;
                var p = Model.PassProb(s, carrier, mate);
                var score = p * GainAt(mate.Pos) + (1 - p) * Model.LossValue(mate.Pos, team);
                if (score > bestScore)
                {
                    bestScore = score;
                    best = GameAction.Pass(mate.Id);
                }
            }
            var pd = Model.DribbleProb(s, carrier);
            var dribble = pd * GainAt(Model.DribbleTarget(s, carrier)) + (1 - pd) * Model.LossValue(carrier.Pos, team);
            if (dribble > bestScore) best = GameAction.Dribble;
            return best;
        }

        /// <summary>
        /// Play the consequence out: after a turnover, their attack until a shot, a regain,
        /// or four ticks; after a chance of ours, the shot itself.
        /// </summary>
        public static List<Resolution> SimulateFallout(State s, Rng rng)
        {
            var clips = new List<Resolution>();
            var cur = s;
            for (var i = 0; i < 4; i++)
            {
                var hid = cur.Holder;
                if (hid == null) break;
                var h = cur.PlayerById(hid);
                if (Model.InShootingRange(cur, h))
                {
                    clips.Add(ResolveShot(cur, rng));
                    break;
                }
                if (h.Team == Team.Us) break;
                var res = ResolveAction(cur, DefaultAction(cur, hid), rng);
                clips.Add(res);
                cur = res.After;
                if (res.Outcome == Outcome.Lost || res.Outcome == Outcome.Cleared) break;
            }
            return clips;
        }
    }
}
