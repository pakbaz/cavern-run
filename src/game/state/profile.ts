import { MAX_LIVES, STARTING_LIVES } from '../../config';
import { openStore, StoreName } from './db';

/** Best result recorded for a single cave. */
export interface CaveBest {
  readonly caveIndex: number;
  readonly bestScore: number;
  readonly bestSecondsLeft: number;
  readonly diamonds: number;
  readonly completed: boolean;
}

export interface Progress {
  /** Index of the next unfinished cave. May equal the cave count after a win. */
  readonly furthestCave: number;
  readonly lastScore: number;
  readonly lives: number;
  readonly updated: string;
}

/** Keep whichever of the two runs went better. */
export function mergeCaveBest(existing: CaveBest | undefined, candidate: CaveBest): CaveBest {
  if (!existing) return candidate;
  return {
    caveIndex: candidate.caveIndex,
    bestScore: Math.max(existing.bestScore, candidate.bestScore),
    bestSecondsLeft: Math.max(existing.bestSecondsLeft, candidate.bestSecondsLeft),
    diamonds: Math.max(existing.diamonds, candidate.diamonds),
    completed: existing.completed || candidate.completed,
  };
}

export async function loadCaveBests(): Promise<Map<number, CaveBest>> {
  const map = new Map<number, CaveBest>();
  try {
    const store = await openStore();
    for (const row of await store.all<CaveBest>(StoreName.caveBests)) {
      if (typeof row?.caveIndex === 'number') map.set(row.caveIndex, row);
    }
  } catch {
    // An empty map is a perfectly good answer.
  }
  return map;
}

export async function recordCaveBest(candidate: CaveBest): Promise<void> {
  try {
    const store = await openStore();
    const key = `${candidate.caveIndex}`;
    const existing = await store.get<CaveBest>(StoreName.caveBests, key);
    await store.put(StoreName.caveBests, key, mergeCaveBest(existing, candidate));
  } catch {
    // Best-effort.
  }
}

export function freshProgress(): Progress {
  return {
    furthestCave: 0,
    lastScore: 0,
    lives: STARTING_LIVES,
    updated: new Date().toISOString(),
  };
}

export function normalizeProgress(value: unknown): Progress {
  if (!value || typeof value !== 'object') return freshProgress();
  const row = value as Partial<Progress>;
  return {
    furthestCave: nonNegativeInteger(row.furthestCave),
    lastScore: nonNegativeInteger(row.lastScore),
    lives: positiveInteger(row.lives, STARTING_LIVES),
    updated: typeof row.updated === 'string' ? row.updated : new Date().toISOString(),
  };
}

/** Keep score and lives attached to the deepest checkpoint that earned them. */
export function mergeProgress(current: Progress, candidate: Progress): Progress {
  if (candidate.furthestCave > current.furthestCave) return candidate;
  if (candidate.furthestCave < current.furthestCave) return current;
  if (candidate.lastScore > current.lastScore) return candidate;
  if (candidate.lastScore < current.lastScore) return current;
  return candidate.lives > current.lives ? candidate : current;
}

export async function loadProgress(): Promise<Progress> {
  try {
    const store = await openStore();
    return normalizeProgress(await store.get<unknown>(StoreName.progress, 'current'));
  } catch {
    // Fall through to a fresh run.
  }
  return freshProgress();
}

export async function saveProgress(furthestCave: number, lastScore: number, lives: number): Promise<Progress> {
  const candidate = normalizeProgress({
    furthestCave,
    lastScore,
    lives,
    updated: new Date().toISOString(),
  });

  try {
    const store = await openStore();
    const current = await loadProgress();
    const merged = mergeProgress(current, candidate);
    await store.put(StoreName.progress, 'current', merged);
    return merged;
  } catch {
    return candidate;
  }
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(MAX_LIVES, Math.floor(value))
    : fallback;
}
