import { describe, expect, it } from 'vitest';

import { CaveOutcome } from './simTypes';
import { Dir, Tile } from './tiles';
import { eventsOfType, input, makeSim, run } from '../../test/harness';

describe('player movement', () => {
  it('digs dirt and steps into it', () => {
    const sim = makeSim(['WWWWW', 'WP..W', 'WWWWW']);

    const events = run(sim, 1, input(Dir.Right));

    expect(sim.runtime.playerX).toBe(2);
    expect(sim.cave.get(1, 1)).toBe(Tile.Empty);
    expect(eventsOfType(events, 'dig')).toHaveLength(1);
  });

  it('grabs dirt without moving when the modifier is held', () => {
    const sim = makeSim(['WWWWW', 'WP..W', 'WWWWW']);

    run(sim, 1, input(Dir.Right, true));

    expect(sim.runtime.playerX).toBe(1);
    expect(sim.cave.get(2, 1)).toBe(Tile.Empty);
  });

  it('is blocked by steel', () => {
    const sim = makeSim(['WWWWW', 'WPW W', 'WWWWW']);

    run(sim, 3, input(Dir.Right));

    expect(sim.runtime.playerX).toBe(1);
  });

  it('collects a diamond and scores it', () => {
    const sim = makeSim(['WWWWW', 'WPd W', 'WWWWW'], {
      tuning: { diamondsRequired: 5, diamondValue: 10 },
    });

    const events = run(sim, 1, input(Dir.Right));

    expect(sim.runtime.diamondsCollected).toBe(1);
    expect(sim.runtime.caveScore).toBe(10);
    expect(eventsOfType(events, 'diamond')).toHaveLength(1);
  });

  it('pays the higher rate for diamonds taken after the quota is met', () => {
    const sim = makeSim(['WWWWWW', 'WPdd W', 'WWWWWW'], {
      tuning: { diamondsRequired: 1, diamondValue: 10, extraDiamondValue: 50 },
    });

    run(sim, 2, input(Dir.Right));

    expect(sim.runtime.diamondsCollected).toBe(2);
    expect(sim.runtime.caveScore).toBe(60);
  });

  it('dies when walking into a firefly', () => {
    const sim = makeSim(['WWWWW', 'WPf W', 'W   W', 'WWWWW']);

    const events = run(sim, 1, input(Dir.Right));

    expect(sim.runtime.playerAlive).toBe(false);
    expect(eventsOfType(events, 'playerDied')).toHaveLength(1);
  });
});

describe('pushing boulders', () => {
  it('shoves a boulder sideways into empty space', () => {
    const sim = makeSim(['WWWWWW', 'WPr  W', 'WWWWWW'], { tuning: { pushChance: 1 } });

    const events = run(sim, 1, input(Dir.Right));

    expect(sim.cave.get(3, 1)).toBe(Tile.Boulder);
    expect(sim.runtime.playerX).toBe(2);
    expect(eventsOfType(events, 'push')).toHaveLength(1);
  });

  it('refuses to push when the far side is blocked', () => {
    const sim = makeSim(['WWWWW', 'WPrWW', 'WWWWW'], { tuning: { pushChance: 1 } });

    run(sim, 3, input(Dir.Right));

    expect(sim.runtime.playerX).toBe(1);
    expect(sim.cave.get(2, 1)).toBe(Tile.Boulder);
  });

  it('never pushes vertically', () => {
    const sim = makeSim(['WWW', 'WrW', 'WPW', 'WWW'], { tuning: { pushChance: 1 } });

    run(sim, 3, input(Dir.Up));

    expect(sim.runtime.playerY).toBe(2);
  });

  it('resists pushes according to the tuned probability', () => {
    const sim = makeSim(['WWWWWW', 'WPr  W', 'WWWWWW'], { tuning: { pushChance: 0 } });

    run(sim, 5, input(Dir.Right));

    expect(sim.runtime.playerX).toBe(1);
    expect(sim.cave.get(2, 1)).toBe(Tile.Boulder);
  });
});

describe('the exit', () => {
  it('stays shut until the quota is met, then opens', () => {
    const sim = makeSim(['WWWWWW', 'WPd EW', 'WWWWWW'], { tuning: { diamondsRequired: 1 } });

    expect(sim.cave.get(4, 1)).toBe(Tile.ExitClosed);

    const events = run(sim, 1, input(Dir.Right));

    expect(sim.runtime.exitOpen).toBe(true);
    expect(sim.cave.get(4, 1)).toBe(Tile.ExitOpen);
    expect(eventsOfType(events, 'exitOpen')).toHaveLength(1);
  });

  it('completes the cave when the player walks into an open exit', () => {
    const sim = makeSim(['WWWWW', 'WPdEW', 'WWWWW'], { tuning: { diamondsRequired: 1 } });

    const events = run(sim, 3, input(Dir.Right));

    expect(sim.runtime.outcome).toBe(CaveOutcome.Complete);
    expect(eventsOfType(events, 'caveComplete')).toHaveLength(1);
  });

  it('cannot be entered while it is still shut', () => {
    const sim = makeSim(['WWWWW', 'WP EW', 'WWWWW'], { tuning: { diamondsRequired: 1 } });

    run(sim, 5, input(Dir.Right));

    expect(sim.runtime.outcome).toBe(CaveOutcome.Running);
    expect(sim.runtime.playerX).toBe(2);
  });
});

describe('the clock', () => {
  it('ends the cave when time runs out', () => {
    const sim = makeSim(['WWWWW', 'WP  W', 'WWWWW'], {
      tuning: { timeLimit: 1, tickHz: 10 },
    });

    run(sim, 11);

    expect(sim.runtime.outcome).toBe(CaveOutcome.OutOfTime);
    expect(sim.secondsLeft).toBe(0);
  });
});

describe('the birth animation', () => {
  it('hatches the player after the intro beat', () => {
    const sim = makeSim(['WWWWW', 'WP  W', 'WWWWW'], { hatched: false });

    expect(sim.cave.get(1, 1)).toBe(Tile.PlayerBirth);
    expect(sim.runtime.playerAlive).toBe(false);

    const events = run(sim, 20);

    expect(sim.runtime.playerBorn).toBe(true);
    expect(sim.runtime.playerAlive).toBe(true);
    expect(sim.cave.get(1, 1)).toBe(Tile.Player);
    expect(eventsOfType(events, 'playerBorn')).toHaveLength(1);
  });
});
