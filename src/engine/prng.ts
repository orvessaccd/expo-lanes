/**
 * Deterministic Seeded PRNG (Mulberry32 + FNV-1a seed hashing)
 * Guarantees 100% identical simulation outcomes on any OS, CPU, or screen refresh rate.
 */

export interface SeededRng {
  /** Next float in [0, 1) */
  next: () => number;
  /** Uniform float in [min, max) */
  range: (min: number, max: number) => number;
  /** Uniform integer in [min, max] inclusive */
  int: (min: number, max: number) => number;
  /** Randomly -1 or 1 */
  sign: () => -1 | 1;
}

export function hashSeed(seed: string | number): number {
  const str = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 0x9e3779b9;
}

export function createMulberry32(seed: string | number): SeededRng {
  let state = typeof seed === "number" ? (seed >>> 0) || 1 : hashSeed(seed);

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range: (min: number, max: number) => min + (max - min) * next(),
    int: (min: number, max: number) =>
      Math.floor(min + (max - min + 1) * next()),
    sign: () => (next() < 0.5 ? -1 : 1),
  };
}
