using Gaffa.Engine;
using UnityEngine;

namespace Gaffa.Runtime
{
    /// <summary>Engine pitch coordinates (x along the length, y across) to Unity world (x, 0, z).</summary>
    public static class PitchSpace
    {
        public static Vector3 ToWorld(Vec2 p, float height = 0f) => new Vector3((float)p.X, height, (float)p.Y);
        public static Vec2 ToPitch(Vector3 w) => new Vec2(w.x, w.z);
        public static Quaternion FacingToRotation(double facing) => Quaternion.Euler(0f, -(float)(facing * Mathf.Rad2Deg), 0f);
    }
}
