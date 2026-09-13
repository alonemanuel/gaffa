export type Rng = () => number;

/** mulberry32: small, fast, seedable. */
export const createRng = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const range = (rng: Rng, lo: number, hi: number): number => lo + rng() * (hi - lo);
export const chance = (rng: Rng, p: number): boolean => rng() < p;
export const pick = <T>(rng: Rng, arr: readonly T[]): T => {
  const item = arr[Math.floor(rng() * arr.length)];
  if (item === undefined) throw new Error('pick from empty array');
  return item;
};

export const hashString = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
