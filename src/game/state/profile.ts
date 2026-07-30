import { openStore, StoreName } from './db';

/** One row in the high-score table. */
export interface ScoreEntry {
  readonly name: string;
  readonly score: number;
  readonly caveReached: number;
  readonly caveLetter: string;
  readonly date: string;
}

/** Best result recorded for a single cave. */
export interface CaveBest {
  readonly caveIndex: number;
  readonly bestScore: number;
  readonly bestSecondsLeft: number;
  readonly diamonds: number;
  readonly completed: boolean;
}

export interface Progress {
  readonly furthestCave: number;
  readonly lastScore: number;
  readonly updated: string;
}

export const HIGH_SCORE_LIMIT = 10;

/* ------------------------------------------------------------------ *
 * Pure helpers -- the actual rules, kept out of the async plumbing so
 * they can be tested without a database.
 * ------------------------------------------------------------------ */

/** Sort descending by score, then by cave reached, and keep the top `limit`. */
export function rankScores(entries: readonly ScoreEntry[], limit = HIGH_SCORE_LIMIT): ScoreEntry[] {
  return [...entries]
    .sort((a, b) => b.score - a.score || b.caveReached - a.caveReached || a.date.localeCompare(b.date))
    .slice(0, limit);
}

/** Would this score make the table? An empty table always accepts. */
export function qualifies(entries: readonly ScoreEntry[], score: number, limit = HIGH_SCORE_LIMIT): boolean {
  if (score <= 0) return false;
  if (entries.length < limit) return true;
  const ranked = rankScores(entries, limit);
  const lowest = ranked[ranked.length - 1];
  return lowest === undefined || score > lowest.score;
}

/** Arcade-style initials: three uppercase A-Z characters. */
export function normalizeInitials(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .trim()
    .slice(0, 3);
  return cleaned.length > 0 ? cleaned : 'YOU';
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

/* ------------------------------------------------------------------ *
 * Storage-backed API
 * ------------------------------------------------------------------ */

/**
 * Nothing here rejects. Losing a high score is annoying; failing to show the
 * title screen because the score table would not load is much worse, so every
 * read falls back to an empty result and every write is best-effort.
 */

export async function loadHighScores(): Promise<ScoreEntry[]> {
  try {
    const store = await openStore();
    const rows = await store.all<ScoreEntry>(StoreName.highscores);
    return rankScores(rows.filter(isScoreEntry));
  } catch {
    return [];
  }
}

export async function submitScore(entry: ScoreEntry): Promise<ScoreEntry[]> {
  try {
    const store = await openStore();
    const existing = (await store.all<ScoreEntry>(StoreName.highscores)).filter(isScoreEntry);
    const ranked = rankScores([...existing, entry]);

    await store.clear(StoreName.highscores);
    await Promise.all(ranked.map((row, index) => store.put(StoreName.highscores, `${index}`, row)));
    return ranked;
  } catch {
    return rankScores([entry]);
  }
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

export async function loadProgress(): Promise<Progress> {
  try {
    const store = await openStore();
    const saved = await store.get<Progress>(StoreName.progress, 'current');
    if (saved && typeof saved.furthestCave === 'number') return saved;
  } catch {
    // Fall through to a fresh run.
  }
  return { furthestCave: 0, lastScore: 0, updated: new Date().toISOString() };
}

export async function saveProgress(furthestCave: number, lastScore: number): Promise<void> {
  try {
    const store = await openStore();
    const current = await loadProgress();
    await store.put(StoreName.progress, 'current', {
      furthestCave: Math.max(current.furthestCave, furthestCave),
      lastScore,
      updated: new Date().toISOString(),
    });
  } catch {
    // Best-effort.
  }
}

function isScoreEntry(value: unknown): value is ScoreEntry {
  const row = value as ScoreEntry | null;
  return typeof row?.name === 'string' && typeof row.score === 'number';
}
