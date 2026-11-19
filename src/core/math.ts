/** Shared numeric helpers. No DOM access, so this module runs in Node too. */

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Polynomial smooth minimum (quadratic). `k` is the blend radius: shapes whose
 * distance fields are closer than `k` fuse with a rounded fillet, which is what
 * turns a row of rounded rectangles into one organic background blob.
 */
export function smin(a: number, b: number, k: number): number {
  if (k <= 1e-9) return a < b ? a : b;
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return lerp(b, a, h) - k * h * (1 - h);
}

/** Deterministic 32-bit PRNG so generated backgrounds reproduce across reloads. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
