import { describe, expect, it } from 'vitest';

import { isOriginAllowed, parseSubmission } from './index';

describe('score submission validation', () => {
  it('accepts a valid score and ignores client-derived fields', () => {
    expect(
      parseSubmission({
        name: 'PAK',
        score: 4200,
        caveReached: 13,
        caveLetter: 'Z',
        date: '1900-01-01',
      }),
    ).toEqual({ name: 'PAK', score: 4200, caveReached: 13 });
  });

  it('rejects invalid initials, scores and caves', () => {
    expect(parseSubmission({ name: '<X>', score: 10, caveReached: 1 })).toBeNull();
    expect(parseSubmission({ name: 'PAK', score: -1, caveReached: 1 })).toBeNull();
    expect(parseSubmission({ name: 'PAK', score: 10, caveReached: 21 })).toBeNull();
  });
});

describe('origin validation', () => {
  it('allows GitHub Pages and non-browser requests', () => {
    expect(isOriginAllowed('https://pakbaz.github.io', 'https://pakbaz.github.io')).toBe(true);
    expect(isOriginAllowed(null, 'https://pakbaz.github.io')).toBe(true);
  });

  it('rejects a different browser origin', () => {
    expect(isOriginAllowed('https://example.com', 'https://pakbaz.github.io')).toBe(false);
  });
});
