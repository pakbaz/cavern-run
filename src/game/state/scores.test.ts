import { describe, expect, it } from 'vitest';

import {
  HIGH_SCORE_LIMIT,
  normalizeInitials,
  qualifies,
  rankScores,
  type ScoreEntry,
} from './scores';

function entry(name: string, score: number, caveReached = 1, date = '2024-01-01'): ScoreEntry {
  return { name, score, caveReached, caveLetter: 'A', date };
}

describe('rankScores', () => {
  it('orders by score descending', () => {
    const ranked = rankScores([entry('AAA', 100), entry('BBB', 300), entry('CCC', 200)]);
    expect(ranked.map((row) => row.name)).toEqual(['BBB', 'CCC', 'AAA']);
  });

  it('breaks ties on cave reached and then oldest date', () => {
    const ranked = rankScores([
      entry('LOW', 500, 2),
      entry('NEW', 500, 9, '2024-06-01'),
      entry('OLD', 500, 9, '2024-01-01'),
    ]);
    expect(ranked.map((row) => row.name)).toEqual(['OLD', 'NEW', 'LOW']);
  });

  it('truncates without mutating its input', () => {
    const entries = Array.from({ length: 25 }, (_, index) => entry(`P${index}`, index * 10));
    expect(rankScores(entries)).toHaveLength(HIGH_SCORE_LIMIT);
    expect(entries[0]?.name).toBe('P0');
  });
});

describe('qualifies', () => {
  it('requires a positive score', () => {
    expect(qualifies([], 0)).toBe(false);
    expect(qualifies([], 10)).toBe(true);
  });

  it('only accepts a better score once the table is full', () => {
    const full = Array.from({ length: HIGH_SCORE_LIMIT }, (_, index) => entry(`P${index}`, 1000 + index));
    expect(qualifies(full, 100)).toBe(false);
    expect(qualifies(full, 5000)).toBe(true);
  });
});

describe('normalizeInitials', () => {
  it('normalizes initials for the API', () => {
    expect(normalizeInitials('pakbaz')).toBe('PAK');
    expect(normalizeInitials('a!b@c#')).toBe('ABC');
    expect(normalizeInitials('!!!')).toBe('YOU');
  });
});
