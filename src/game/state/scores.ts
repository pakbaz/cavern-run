/** One row returned by the server-side high-score table. */
export interface ScoreEntry {
  readonly name: string;
  readonly score: number;
  readonly caveReached: number;
  readonly caveLetter: string;
  readonly date: string;
}

export interface ScoreSubmission {
  readonly name: string;
  readonly score: number;
  readonly caveReached: number;
}

export const HIGH_SCORE_LIMIT = 10;

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

export async function loadHighScores(): Promise<ScoreEntry[]> {
  return requestScores(scoreApiUrl(), { method: 'GET' });
}

export async function submitScore(entry: ScoreSubmission): Promise<ScoreEntry[]> {
  return requestScores(scoreApiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
}

function scoreApiUrl(): string {
  const configured = import.meta.env.VITE_SCORE_API_URL?.trim();
  if (configured) return configured;
  return new URL(`${import.meta.env.BASE_URL}api/scores`, window.location.href).toString();
}

async function requestScores(url: string, init: RequestInit): Promise<ScoreEntry[]> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Score API returned ${response.status}`);

  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error('Score API returned an invalid response');
  return rankScores(body.filter(isScoreEntry));
}

function isScoreEntry(value: unknown): value is ScoreEntry {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<ScoreEntry>;
  return (
    typeof row.name === 'string' &&
    typeof row.score === 'number' &&
    typeof row.caveReached === 'number' &&
    typeof row.caveLetter === 'string' &&
    typeof row.date === 'string'
  );
}
