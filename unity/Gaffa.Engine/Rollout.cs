using System.Collections.Generic;
using System.Linq;

namespace Gaffa.Engine
{
    public sealed class OptionEval
    {
        public GameAction Action;
        public string Key = "";
        public string Label = "";
        /// <summary>Expected value, roughly [-1, 1].</summary>
        public double Ev;
        /// <summary>Share of rollouts still in possession (or a chance created) at the horizon.</summary>
        public double Retain;
        /// <summary>Share of rollouts where we lost it inside our own defensive zone.</summary>
        public double LostDanger;
        /// <summary>Immediate success probability of the action itself.</summary>
        public double Immediate;
    }

    /// <summary>
    /// Monte Carlo grader: for every option the carrier has, roll the possession
    /// forward N times with the default policy and average the terminal value.
    /// Mirrors src/sim/rollout.ts.
    /// </summary>
    public static class Rollout
    {
        public const int Rollouts = 220;
        public const int Horizon = 2;

        private struct Result
        {
            public double Value;
            public bool Retained;
            public bool LostDanger;
        }

        private static Result Run(State s0, GameAction first, Rng rng)
        {
            var res = Step.ResolveAction(s0, first, rng);
            for (var i = 0; i <= Horizon; i++)
            {
                var s = res.After;
                if (res.Outcome == Outcome.Lost) return new Result { Value = Model.LossValue(s.Ball), Retained = false, LostDanger = Model.IsDangerZone(s.Ball) };
                if (res.Outcome == Outcome.Cleared) return new Result { Value = Model.ClearValue(s), Retained = false, LostDanger = false };
                if (res.Outcome == Outcome.Chance) return new Result { Value = Model.ChanceValue, Retained = true, LostDanger = false };
                if (i == Horizon || s.Holder == null) break;
                res = Step.ResolveAction(s, Step.DefaultAction(s, s.Holder), rng);
            }
            var end = res.After;
            var holder = end.Holder != null ? end.PlayerById(end.Holder) : null;
            if (holder == null || holder.Team != Team.Us) return new Result { Value = Model.LossValue(end.Ball), Retained = false, LostDanger = Model.IsDangerZone(end.Ball) };
            return new Result { Value = Model.RetainValue(end, holder), Retained = true, LostDanger = false };
        }

        public static List<OptionEval> EvaluateOptions(State s, string carrierId, uint seed)
        {
            var carrier = s.PlayerById(carrierId);
            var out_ = new List<OptionEval>();
            foreach (var action in Step.AvailableActions(s, carrierId))
            {
                var key = action.Key;
                var rng = new Rng(seed ^ Rng.HashString(key));
                var sum = 0.0;
                var retained = 0;
                var danger = 0;
                for (var i = 0; i < Rollouts; i++)
                {
                    var r = Run(s, action, rng);
                    sum += r.Value;
                    if (r.Retained) retained++;
                    if (r.LostDanger) danger++;
                }
                var immediate = action.Kind == ActionKind.Pass
                    ? Model.PassProb(s, carrier, s.PlayerById(action.To!))
                    : action.Kind == ActionKind.Dribble
                        ? Model.DribbleProb(s, carrier)
                        : 1;
                out_.Add(new OptionEval
                {
                    Action = action,
                    Key = key,
                    Label = Step.ActionLabel(s, action),
                    Ev = sum / Rollouts,
                    Retain = retained / (double)Rollouts,
                    LostDanger = danger / (double)Rollouts,
                    Immediate = immediate,
                });
            }
            return out_.OrderByDescending(e => e.Ev).ToList();
        }
    }
}
