using System.Collections.Generic;
using Gaffa.Engine;
using UnityEngine;
using Resolution = Gaffa.Engine.Resolution;
using Random = UnityEngine.Random;

namespace Gaffa.Runtime
{
    /// <summary>
    /// Owns one moment: generates it from a seed, spawns the players and the ball,
    /// plays the recorded prelude, then freezes for the decision. Pure presentation;
    /// every position comes from the engine's timelines.
    /// </summary>
    public sealed class MomentDirector : MonoBehaviour
    {
        public enum Phase { Idle, Playing, Frozen }

        [Header("Moment")]
        public uint Seed = 3;
        public bool DailySeed = false;

        [Header("Playback")]
        [Range(0.2f, 1.5f)] public float PreludeSpeed = 0.55f;
        [Range(0.2f, 1.5f)] public float DecisionSpeed = 0.45f;

        [Header("Prefabs (optional; capsules are used when empty)")]
        public GameObject PlayerPrefab;
        public GameObject BallPrefab;
        public Material OurKit;
        public Material TheirKit;

        public Phase Current { get; private set; } = Phase.Idle;
        public Moment Moment { get; private set; }
        public State Frozen => Moment?.State;
        public string CarrierId => Moment?.CarrierId ?? "";
        public IReadOnlyDictionary<string, PlayerView> Views => _views;
        public Transform Ball => _ball;

        public event System.Action<Resolution> ClipStarted;
        public event System.Action FrozenForDecision;
        public event System.Action<List<Resolution>> SequenceEnded;

        readonly Dictionary<string, PlayerView> _views = new Dictionary<string, PlayerView>();
        Transform _ball;
        readonly List<Resolution> _queue = new List<Resolution>();
        int _clipIndex = -1;
        float _clipTime;
        float _speed = 1f;
        System.Action _onQueueDone;

        void Start()
        {
            if (DailySeed) Seed = Rng.HashString(System.DateTime.UtcNow.ToString("yyyy-MM-dd"));
            LoadMoment(Buildup.Generate(Seed), playPrelude: true);
        }

        public void LoadMoment(Moment m, bool playPrelude)
        {
            Moment = m;
            EnsureViews(m.State);
            var first = playPrelude && m.Prelude.Count > 0 ? m.Prelude[0].Before : m.State;
            SnapTo(first);
            if (playPrelude && m.Prelude.Count > 0) Play(m.Prelude, PreludeSpeed, Freeze);
            else Freeze();
        }

        /// <summary>Resolve the player's choice and play it plus the fallout.</summary>
        public void Choose(GameAction action)
        {
            if (Current != Phase.Frozen) return;
            var rng = new Rng((uint)Random.Range(1, int.MaxValue));
            var res = Step.ResolveAction(Moment.State, action, rng);
            var clips = new List<Resolution> { res };
            if (res.Outcome == Outcome.Lost || res.Outcome == Outcome.Chance) clips.AddRange(Step.SimulateFallout(res.After, rng));
            Play(clips, DecisionSpeed, () => { Current = Phase.Idle; SequenceEnded?.Invoke(clips); });
        }

        public void ReplayPrelude()
        {
            if (Current != Phase.Frozen || Moment.Prelude.Count == 0) return;
            SnapTo(Moment.Prelude[0].Before);
            Play(Moment.Prelude, PreludeSpeed, Freeze);
        }

        void Play(List<Resolution> clips, float speed, System.Action onDone)
        {
            _queue.Clear();
            _queue.AddRange(clips);
            _speed = speed;
            _onQueueDone = onDone;
            _clipIndex = -1;
            Current = Phase.Playing;
            NextClip();
        }

        void NextClip()
        {
            _clipIndex++;
            if (_clipIndex >= _queue.Count)
            {
                _onQueueDone?.Invoke();
                return;
            }
            _clipTime = 0f;
            ClipStarted?.Invoke(_queue[_clipIndex]);
        }

        void Freeze()
        {
            Current = Phase.Frozen;
            SnapTo(Moment.State);
            FrozenForDecision?.Invoke();
        }

        void Update()
        {
            if (Current != Phase.Playing) return;
            var clip = _queue[_clipIndex];
            var simDt = Time.deltaTime * _speed;
            _clipTime += simDt;
            var sample = TimelineSampler.Sample(clip.Timeline, _clipTime);
            var ballWorld = PitchSpace.ToWorld(sample.Ball, 0.22f + (float)sample.Z * 3.2f);
            for (var i = 0; i < clip.After.Players.Count; i++)
            {
                var p = clip.After.Players[i];
                if (!_views.TryGetValue(p.Id, out var view)) continue;
                view.SetTarget(PitchSpace.ToWorld(sample.Players[i]), ballWorld);
                view.Step(simDt);
            }
            if (_ball != null) _ball.position = Vector3.Lerp(_ball.position, ballWorld, Mathf.Min(1f, simDt / 0.06f));
            if (_clipTime >= clip.Timeline.Duration) NextClip();
        }

        void SnapTo(State s)
        {
            foreach (var p in s.Players)
                if (_views.TryGetValue(p.Id, out var v)) v.Snap(PitchSpace.ToWorld(p.Pos), PitchSpace.FacingToRotation(p.Facing));
            if (_ball != null) _ball.position = PitchSpace.ToWorld(s.Ball, 0.22f);
        }

        void EnsureViews(State s)
        {
            foreach (var p in s.Players)
            {
                if (_views.ContainsKey(p.Id)) continue;
                var go = PlayerPrefab != null ? Instantiate(PlayerPrefab, transform) : MakeCapsule(p);
                go.name = p.Id;
                var view = go.GetComponent<PlayerView>() ?? go.AddComponent<PlayerView>();
                view.Id = p.Id;
                _views[p.Id] = view;
            }
            if (_ball == null)
            {
                var b = BallPrefab != null ? Instantiate(BallPrefab, transform) : GameObject.CreatePrimitive(PrimitiveType.Sphere);
                b.name = "Ball";
                b.transform.SetParent(transform);
                if (BallPrefab == null) b.transform.localScale = Vector3.one * 0.44f;
                _ball = b.transform;
            }
        }

        GameObject MakeCapsule(Player p)
        {
            var root = new GameObject(p.Id);
            root.transform.SetParent(transform);
            var body = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            body.transform.SetParent(root.transform);
            body.transform.localPosition = new Vector3(0f, 0.9f, 0f);
            body.transform.localScale = new Vector3(0.6f, 0.9f, 0.6f);
            var kit = p.Team == Team.Us ? OurKit : TheirKit;
            var r = body.GetComponent<Renderer>();
            if (kit != null) r.sharedMaterial = kit;
            else r.material.color = p.Team == Team.Us ? new Color(1f, 0.85f, 0.3f) : new Color(0.9f, 0.22f, 0.39f);
            // A nose so orientation reads until real characters arrive.
            var nose = GameObject.CreatePrimitive(PrimitiveType.Cube);
            nose.transform.SetParent(root.transform);
            nose.transform.localPosition = new Vector3(0f, 1.6f, 0.35f);
            nose.transform.localScale = new Vector3(0.15f, 0.15f, 0.3f);
            nose.GetComponent<Renderer>().material.color = Color.black;
            return root;
        }
    }
}
