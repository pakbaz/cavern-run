import { describe, expect, it, beforeEach } from 'vitest';

import { MemoryStore, useStore } from './db';
import {
  HIGH_SCORE_LIMIT,
  loadHighScores,
  mergeCaveBest,
  normalizeInitials,
  qualifies,
  rankScores,
  recordCaveBest,
  loadCaveBests,
  submitScore,
  type ScoreEntry,
} from './profile';
import { DEFAULT_SETTINGS, normalizeSettings, loadSettings, saveSettings } from './settings';

function entry(name: string, score: number, caveReached = 1, date = '2024-01-01'): ScoreEntry {
  return { name, score, caveReached, caveLetter: 'A', date };
}

beforeEach(() => {
  useStore(new MemoryStore());
});

describe('rankScores', () => {
  it('orders by score descending', () => {
    const ranked = rankScores([entry('AAA', 100), entry('BBB', 300), entry('CCC', 200)]);
    expect(ranked.map((r) => r.name)).toEqual(['BBB', 'CCC', 'AAA']);
  });

  it('breaks ties on cave reached', () => {
    const ranked = rankScores([entry('LOW', 500, 2), entry('DEEP', 500, 9)]);
    expect(ranked[0]?.name).toBe('DEEP');
  });

  it('breaks remaining ties on date, oldest first', () => {
    const ranked = rankScores([entry('NEW', 500, 3, '2024-06-01'), entry('OLD', 500, 3, '2024-01-01')]);
    expect(ranked[0]?.name).toBe('OLD');
  });

  it('truncates to the limit', () => {
    const many = Array.from({ length: 25 }, (_, i) => entry(`P${i}`, i * 10));
    expect(rankScores(many)).toHaveLength(HIGH_SCORE_LIMIT);
  });

  it('does not mutate its input', () => {
    const input = [entry('AAA', 100), entry('BBB', 300)];
    rankScores(input);
    expect(input[0]?.name).toBe('AAA');
  });
});

describe('qualifies', () => {
  it('accepts any positive score into an empty table', () => {
    expect(qualifies([], 10)).toBe(true);
  });

  it('rejects a zero score', () => {
    expect(qualifies([], 0)).toBe(false);
  });

  it('accepts while the table has room', () => {
    expect(qualifies([entry('AAA', 9999)], 5)).toBe(true);
  });

  it('rejects a score below a full table', () => {
    const full = Array.from({ length: HIGH_SCORE_LIMIT }, (_, i) => entry(`P${i}`, 1000 + i));
    expect(qualifies(full, 100)).toBe(false);
  });

  it('accepts a score above the bottom of a full table', () => {
    const full = Array.from({ length: HIGH_SCORE_LIMIT }, (_, i) => entry(`P${i}`, 1000 + i));
    expect(qualifies(full, 5000)).toBe(true);
  });
});

describe('normalizeInitials', () => {
  it('uppercases and trims to three characters', () => {
    expect(normalizeInitials('pakbaz')).toBe('PAK');
  });

  it('strips punctuation', () => {
    expect(normalizeInitials('a!b@c#')).toBe('ABC');
  });

  it('falls back when nothing usable remains', () => {
    expect(normalizeInitials('!!!')).toBe('YOU');
  });

  it('keeps digits', () => {
    expect(normalizeInitials('x1y')).toBe('X1Y');
  });
});

describe('mergeCaveBest', () => {
  const base = { caveIndex: 3, bestScore: 100, bestSecondsLeft: 20, diamonds: 5, completed: false };

  it('returns the candidate when nothing is stored', () => {
    expect(mergeCaveBest(undefined, base)).toEqual(base);
  });

  it('keeps the higher score', () => {
    const merged = mergeCaveBest({ ...base, bestScore: 500 }, base);
    expect(merged.bestScore).toBe(500);
  });

  it('keeps the better time remaining', () => {
    const merged = mergeCaveBest(base, { ...base, bestSecondsLeft: 90 });
    expect(merged.bestSecondsLeft).toBe(90);
  });

  it('never un-completes a cave', () => {
    const merged = mergeCaveBest({ ...base, completed: true }, { ...base, completed: false });
    expect(merged.completed).toBe(true);
  });
});

describe('storage round-trips', () => {
  it('persists and ranks submitted scores', async () => {
    await submitScore(entry('AAA', 100));
    await submitScore(entry('BBB', 900));
    const table = await loadHighScores();
    expect(table.map((r) => r.name)).toEqual(['BBB', 'AAA']);
  });

  it('keeps only the top ten across many submissions', async () => {
    for (let i = 0; i < 15; i += 1) await submitScore(entry(`P${i}`, i * 100));
    expect(await loadHighScores()).toHaveLength(HIGH_SCORE_LIMIT);
  });

  it('merges repeated cave bests', async () => {
    await recordCaveBest({ caveIndex: 2, bestScore: 100, bestSecondsLeft: 10, diamonds: 4, completed: false });
    await recordCaveBest({ caveIndex: 2, bestScore: 80, bestSecondsLeft: 55, diamonds: 9, completed: true });

    const best = (await loadCaveBests()).get(2);
    expect(best).toMatchObject({ bestScore: 100, bestSecondsLeft: 55, diamonds: 9, completed: true });
  });

  it('round-trips settings', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, musicVolume: 0.25, lighting: false });
    const loaded = await loadSettings();
    expect(loaded.musicVolume).toBe(0.25);
    expect(loaded.lighting).toBe(false);
  });
});

describe('normalizeSettings', () => {
  it('fills in defaults for an empty object', () => {
    expect(normalizeSettings({}).musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
  });

  it('survives a non-object', () => {
    expect(normalizeSettings('nonsense').sfxVolume).toBe(DEFAULT_SETTINGS.sfxVolume);
  });

  it('clamps volumes into range', () => {
    expect(normalizeSettings({ musicVolume: 9 }).musicVolume).toBe(1);
    expect(normalizeSettings({ sfxVolume: -3 }).sfxVolume).toBe(0);
  });

  it('rejects NaN volumes', () => {
    expect(normalizeSettings({ musicVolume: Number.NaN }).musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
  });

  it('keeps valid booleans', () => {
    expect(normalizeSettings({ scanlines: false }).scanlines).toBe(false);
  });
});
