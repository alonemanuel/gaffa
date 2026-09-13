export interface Vec {
  x: number;
  y: number;
}

export const vec = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const len = (a: Vec): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export const norm = (a: Vec): Vec => {
  const l = len(a);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};

export const angleOf = (a: Vec): number => Math.atan2(a.y, a.x);

/** Distance from p to segment ab, plus the parameter t of the closest point. */
export const distToSegment = (p: Vec, a: Vec, b: Vec): { d: number; t: number; q: Vec } => {
  const ab = sub(b, a);
  const l2 = ab.x * ab.x + ab.y * ab.y;
  if (l2 < 1e-9) return { d: dist(p, a), t: 0, q: { ...a } };
  const t = clamp(((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2, 0, 1);
  const q = add(a, scale(ab, t));
  return { d: dist(p, q), t, q };
};

export const moveToward = (from: Vec, to: Vec, maxStep: number): Vec => {
  const d = dist(from, to);
  if (d <= maxStep) return { ...to };
  return add(from, scale(norm(sub(to, from)), maxStep));
};
