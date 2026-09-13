using System.Collections.Generic;
using System.Linq;
using Gaffa.Engine;
using UnityEngine;
using UnityEngine.InputSystem;
using Resolution = Gaffa.Engine.Resolution;

namespace Gaffa.Runtime
{
    /// <summary>
    /// Keyboard stand-in for the action UI so the loop is testable before the HUD exists.
    /// At the freeze: 1-6 pass to a teammate (listed in the console), D dribble, C clear,
    /// R replay the prelude. After a sequence: N next moment (random), Space replay the
    /// same seed. Verdict with the engine's ranking is printed to the console.
    /// </summary>
    public sealed class DebugControls : MonoBehaviour
    {
        public MomentDirector Director;

        List<GameAction> _options = new List<GameAction>();
        List<OptionEval> _evals;
        bool _ended;

        void OnEnable()
        {
            if (Director == null) Director = FindFirstObjectByType<MomentDirector>();
            Director.FrozenForDecision += OnFrozen;
            Director.SequenceEnded += OnEnded;
            Director.ClipStarted += r => Debug.Log($"[Gaffa] {r.Text}");
        }

        void OnFrozen()
        {
            _ended = false;
            var s = Director.Frozen;
            _options = Step.AvailableActions(s, Director.CarrierId);
            _evals = null;
            var lines = new List<string> { $"[Gaffa] {Director.Moment.Title}: {Director.Moment.Prompt}", "[Gaffa] Your move:" };
            var n = 1;
            foreach (var a in _options)
            {
                var key = a.Kind == ActionKind.Pass ? (n++).ToString() : a.Kind == ActionKind.Dribble ? "D" : "C";
                lines.Add($"   {key}  {Step.ActionLabel(s, a)}");
            }
            lines.Add("   R  replay the play");
            Debug.Log(string.Join("\n", lines));
        }

        void OnEnded(List<Resolution> clips)
        {
            _ended = true;
            var chosen = clips[0];
            var key = chosen.Action.Key;
            var mine = _evals.First(e => e.Key == key);
            var best = _evals[0];
            var gap = best.Ev - mine.Ev;
            var grade = gap <= 0.03 ? "Best call" : gap <= 0.12 ? "Fine" : gap <= 0.3 ? "Costly" : "Blunder";
            var lines = new List<string>
            {
                $"[Gaffa] {string.Join(" ", clips.Select(c => c.Text))}",
                $"[Gaffa] Verdict: {grade}  (you {mine.Ev:+0.00;-0.00}, best {best.Label} {best.Ev:+0.00;-0.00})",
            };
            foreach (var e in _evals)
                lines.Add($"   {(e.Key == key ? ">" : " ")} {e.Label,-24} {e.Ev:+0.00;-0.00}  on {e.Immediate:P0}  keep {e.Retain:P0}  lose deep {e.LostDanger:P0}");
            lines.Add("[Gaffa] N = new random moment, Space = same seed again");
            Debug.Log(string.Join("\n", lines));
        }

        void Update()
        {
            var kb = Keyboard.current;
            if (kb == null) return;
            if (Director.Current == MomentDirector.Phase.Frozen)
            {
                var passes = _options.Where(a => a.Kind == ActionKind.Pass).ToList();
                Key[] digits = { Key.Digit1, Key.Digit2, Key.Digit3, Key.Digit4, Key.Digit5, Key.Digit6 };
                for (var i = 0; i < passes.Count && i < digits.Length; i++)
                    if (kb[digits[i]].wasPressedThisFrame) { Choose(passes[i]); return; }
                if (kb.dKey.wasPressedThisFrame) Choose(GameAction.Dribble);
                else if (kb.cKey.wasPressedThisFrame) Choose(GameAction.Clear);
                else if (kb.rKey.wasPressedThisFrame) Director.ReplayPrelude();
            }
            else if (_ended)
            {
                if (kb.nKey.wasPressedThisFrame) Director.LoadMoment(Buildup.Generate((uint)Random.Range(1, int.MaxValue)), playPrelude: true);
                else if (kb.spaceKey.wasPressedThisFrame) Director.LoadMoment(Buildup.Generate(Director.Seed), playPrelude: true);
            }
        }

        void Choose(GameAction a)
        {
            // Grade before resolving so the verdict is ready when the clips finish.
            _evals = Rollout.EvaluateOptions(Director.Frozen, Director.CarrierId, Director.Moment.Id);
            Debug.Log($"[Gaffa] You chose: {Step.ActionLabel(Director.Frozen, a)}");
            Director.Choose(a);
        }
    }
}
