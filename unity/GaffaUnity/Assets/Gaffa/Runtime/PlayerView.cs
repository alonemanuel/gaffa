using UnityEngine;

namespace Gaffa.Runtime
{
    /// <summary>
    /// One rendered player. Steers toward the sampled sim position with acceleration and
    /// turn limits so starts, stops and turns ease; exposes speed for animation.
    /// Placeholder body until a rigged character is dropped in.
    /// </summary>
    public sealed class PlayerView : MonoBehaviour
    {
        public string Id = "";
        public float Speed { get; private set; }

        [SerializeField] float maxSpeed = 7.5f;
        [SerializeField] float maxAccel = 11f;
        [SerializeField] float closeTime = 0.16f;
        [SerializeField] float turnRate = 7f;
        [SerializeField] float snapDistance = 4f;

        Vector3 _vel;
        Vector3 _target;
        Vector3 _lookAt;

        public void Snap(Vector3 pos, Quaternion rot)
        {
            transform.SetPositionAndRotation(pos, rot);
            _vel = Vector3.zero;
            _target = pos;
        }

        /// <summary>Where the sim says we should be right now, and what to face when standing still.</summary>
        public void SetTarget(Vector3 pos, Vector3 lookAt)
        {
            _target = pos;
            _lookAt = lookAt;
        }

        /// <summary>Advance by dt seconds of sim time.</summary>
        public void Step(float dt)
        {
            var gap = _target - transform.position;
            if (gap.magnitude > snapDistance)
            {
                transform.position = _target;
                _vel = Vector3.zero;
            }
            else
            {
                var desired = gap / closeTime;
                if (desired.magnitude > maxSpeed) desired = desired.normalized * maxSpeed;
                var dv = desired - _vel;
                var maxDv = maxAccel * dt;
                if (dv.magnitude > maxDv) dv = dv.normalized * maxDv;
                _vel += dv;
                transform.position += _vel * dt;
            }
            Speed = _vel.magnitude;
            var face = Speed > 0.7f ? _vel : _lookAt - transform.position;
            face.y = 0f;
            if (face.sqrMagnitude > 0.01f)
            {
                var want = Quaternion.LookRotation(face);
                transform.rotation = Quaternion.RotateTowards(transform.rotation, want, turnRate * Mathf.Rad2Deg * dt);
            }
        }
    }
}
