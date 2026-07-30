interface Env {
  SCORES_DB: D1Database;
  ALLOWED_ORIGIN: string;
}

interface ScoreEntry {
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

const SCORE_LIMIT = 10;
const CAVE_COUNT = 20;
const MAX_SCORE = 99_999_999;
const MAX_BODY_BYTES = 512;

const SELECT_SCORES = `
  SELECT
    name,
    score,
    cave_reached AS caveReached,
    cave_letter AS caveLetter,
    created_at AS date
  FROM scores
  ORDER BY score DESC, cave_reached DESC, created_at ASC, id ASC
  LIMIT ?
`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/api/scores' && url.pathname !== '/api/scores/') {
      return json(request, env, { error: 'Not found' }, 404);
    }

    if (!isOriginAllowed(request.headers.get('Origin'), env.ALLOWED_ORIGIN)) {
      return json(request, env, { error: 'Origin not allowed' }, 403, false);
    }

    try {
      if (request.method === 'OPTIONS') return preflight(request, env);
      if (request.method === 'GET') return json(request, env, await readScores(env));
      if (request.method === 'POST') return submit(request, env);
      return json(request, env, { error: 'Method not allowed' }, 405);
    } catch (error) {
      console.error('Score API failure', error);
      return json(request, env, { error: 'Score service unavailable' }, 503);
    }
  },
};

async function submit(request: Request, env: Env): Promise<Response> {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return json(request, env, { error: 'Content-Type must be application/json' }, 415);
  }

  const contentLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json(request, env, { error: 'Request body too large' }, 413);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return json(request, env, { error: 'Request body too large' }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(request, env, { error: 'Invalid JSON' }, 400);
  }

  const score = parseSubmission(body);
  if (!score) return json(request, env, { error: 'Invalid score submission' }, 400);

  const caveLetter = String.fromCharCode(64 + score.caveReached);
  await env.SCORES_DB.batch([
    env.SCORES_DB.prepare(
      'INSERT INTO scores (name, score, cave_reached, cave_letter) VALUES (?, ?, ?, ?)',
    ).bind(score.name, score.score, score.caveReached, caveLetter),
    env.SCORES_DB.prepare(`
      DELETE FROM scores
      WHERE id NOT IN (
        SELECT id
        FROM scores
        ORDER BY score DESC, cave_reached DESC, created_at ASC, id ASC
        LIMIT ?
      )
    `).bind(SCORE_LIMIT),
  ]);

  return json(request, env, await readScores(env), 201);
}

async function readScores(env: Env): Promise<ScoreEntry[]> {
  const result = await env.SCORES_DB.prepare(SELECT_SCORES).bind(SCORE_LIMIT).all<ScoreEntry>();
  return result.results;
}

export function parseSubmission(value: unknown): ScoreSubmission | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<ScoreSubmission>;
  const { name, score, caveReached } = row;
  if (
    typeof name !== 'string' ||
    !/^(?=.*[A-Z0-9])[A-Z0-9 ]{1,3}$/.test(name) ||
    typeof score !== 'number' ||
    !Number.isInteger(score) ||
    score <= 0 ||
    score > MAX_SCORE ||
    typeof caveReached !== 'number' ||
    !Number.isInteger(caveReached) ||
    caveReached < 1 ||
    caveReached > CAVE_COUNT
  ) {
    return null;
  }

  return { name, score, caveReached };
}

export function isOriginAllowed(origin: string | null, configuredOrigin: string): boolean {
  if (origin === null) return true;
  return configuredOrigin
    .split(',')
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .includes(origin);
}

function preflight(request: Request, env: Env): Response {
  const headers = corsHeaders(request, env);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(null, { status: 204, headers });
}

function json(
  request: Request,
  env: Env,
  body: unknown,
  status = 200,
  includeCors = true,
): Response {
  const headers = includeCors ? corsHeaders(request, env) : new Headers();
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(body), { status, headers });
}

function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers({ Vary: 'Origin' });
  const origin = request.headers.get('Origin');
  if (origin && isOriginAllowed(origin, env.ALLOWED_ORIGIN)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }
  return headers;
}
