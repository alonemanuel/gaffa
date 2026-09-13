using Gaffa.Engine;
using UnityEngine;
using UnityEngine.InputSystem;

namespace Gaffa.Runtime
{
    /// <summary>
    /// Elevated behind-the-player camera: your perspective plus enough pitch to read the
    /// game. Tracks the ball while a clip plays; at the freeze it looks up the pitch,
    /// biased toward the presser. Drag horizontally to look around while frozen.
    /// Stand-in until Cinemachine is wired.
    /// </summary>
    public sealed class CarrierCamera : MonoBehaviour
    {
        public MomentDirector Director;
        [Header("Rig")]
        public float Back = 5.5f;
        public float Height = 3.2f;
        public float LookAhead = 12f;
        public float LookHeight = 0.8f;
        public float Smooth = 6f;
        public float DragSensitivity = 0.35f;

        float _yaw;
        bool _hasYaw;
        Vector2 _lastDrag;
        bool _dragging;

        void OnEnable()
        {
            if (Director != null) Director.FrozenForDecision += ResetYaw;
        }

        void OnDisable()
        {
            if (Director != null) Director.FrozenForDecision -= ResetYaw;
        }

        void LateUpdate()
        {
            if (Director == null || Director.Moment == null) return;
            if (!Director.Views.TryGetValue(Director.CarrierId, out var me)) return;
            var ball = Director.Ball != null ? Director.Ball.position : me.transform.position;

            if (Director.Current == MomentDirector.Phase.Playing)
            {
                var toBall = ball - me.transform.position;
                if (toBall.magnitude > 0.8f) _yaw = Mathf.Atan2(toBall.x, toBall.z) * Mathf.Rad2Deg;
                _hasYaw = true;
            }
            else if (Director.Current == MomentDirector.Phase.Frozen)
            {
                if (!_hasYaw) { _yaw = DefaultYaw(); _hasYaw = true; }
                HandleDrag();
            }

            var fwd = Quaternion.Euler(0f, _yaw, 0f) * Vector3.forward;
            var pos = me.transform.position - fwd * Back + Vector3.up * Height;
            var look = me.transform.position + fwd * LookAhead + Vector3.up * LookHeight;
            var k = 1f - Mathf.Exp(-Smooth * Time.deltaTime);
            transform.position = Vector3.Lerp(transform.position, pos, k);
            transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(look - transform.position), k);
        }

        public void ResetYaw()
        {
            _hasYaw = false;
        }

        float DefaultYaw()
        {
            var s = Director.Frozen;
            var carrier = s.PlayerById(Director.CarrierId);
            var presser = Model.NearestOpponent(s, carrier.Pos, carrier.Team, out _);
            var toP = Vec2.Norm(Vec2.Sub(presser.Pos, carrier.Pos));
            var dir = Vec2.Add(new Vec2(Model.AttackDir(carrier.Team), 0), Vec2.Scale(toP, 0.7));
            // Engine angle is atan2(y, x) in pitch space; Unity yaw is atan2(x, z) with z = pitch y.
            return Mathf.Atan2((float)dir.X, (float)dir.Y) * Mathf.Rad2Deg;
        }

        void HandleDrag()
        {
            var pointer = Pointer.current;
            if (pointer == null) return;
            var pos = pointer.position.ReadValue();
            if (pointer.press.wasPressedThisFrame) { _dragging = true; _lastDrag = pos; }
            if (pointer.press.wasReleasedThisFrame) _dragging = false;
            if (_dragging)
            {
                _yaw += (pos.x - _lastDrag.x) * DragSensitivity;
                _lastDrag = pos;
            }
        }
    }
}
