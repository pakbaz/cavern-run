/**
 * Deterministic pseudo-random number generator.
 *
 * Every stochastic decision in the simulation (amoeba growth, slime
 * permeability, boulder push resistance) routes through this so a cave plus a
 * seed plus an input sequence always produces the same outcome. That keeps the
 * rule tests stable and makes replays possible.
 *
 * Algorithm: mulberry32 — small, fast, and good enough for game feel.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // Avoid the degenerate all-zero state.
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** Raw 32-bit unsigned draw. */
  nextUint32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Uniform float in [0, 1). */
  nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  /** Uniform integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0) return 0;
    return this.nextUint32() % maxExclusive;
  }

  /** Uniform integer in [min, max] inclusive. */
  range(min: number, max: number): number {
    if (max <= min) return min;
    return min + this.nextInt(max - min + 1);
  }

  /** True with the given probability (clamped to [0, 1]). */
  chance(probability: number): boolean {
    if (probability <= 0) return false;
    if (probability >= 1) return true;
    return this.nextFloat() < probability;
  }

  /** Uniformly pick one element; returns undefined for an empty list. */
  pick<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[this.nextInt(items.length)];
  }

  /** Snapshot / restore, so a cave can be rewound deterministically. */
  getState(): number {
    return this.state;
  }

  setState(state: number): void {
    this.state = state >>> 0 || 0x9e3779b9;
  }

  clone(): Rng {
    const copy = new Rng(1);
    copy.setState(this.state);
    return copy;
  }
}

/**
 * Stable 32-bit string hash, used to derive a per-cave seed from its id so
 * cave behaviour is reproducible across sessions.
 */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
