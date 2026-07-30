import { describe, expect, it } from 'vitest';

import {
  BIRTH_TICKS,
  DEATH_HOLD_TICKS,
  EXTRA_LIFE_EVERY,
  MAX_LIVES,
  STARTING_LIVES,
  TIME_BONUS_PER_SECOND,
} from '../../config';
import { CaveSession } from './CaveSession';
import { CaveOutcome, DEFAULT_TUNING, NO_INPUT } from './simTypes';
import { Dir } from './tiles';
import type { CaveSpec } from '../levels/caveFormat';

/**
 * Run-level rules: scoring, extra lives, losing lives and moving between
 * caves. These sit above the cellular automaton and were the last part of the
 * engine without coverage.
 */

/** A tiny two-cave run, so cave transitions can be exercised cheaply. */
function spec(overrides: Partial<CaveSpec> = {}): CaveSpec {
  return {
    ...DEFAULT_TUNING,
    id: 'test-a',
    letter: 'A',
    name: 'Test',
    paletteId: 'earth',
    hint: '',
    map: ['WWWWWWW', 'WP.d..W', 'W.....W', 'W....EW', 'WWWWWWW'],
    diamondsRequired: 1,
    diamondValue: 10,
    timeLimit: 30,
    ...overrides,
  } as CaveSpec;
}

function session(specs: CaveSpec[] = [spec()], lives = STARTING_LIVES): CaveSession {
  return new CaveSession(specs, 0, lives);
}

/** Advance real time far enough to produce `count` scans. */
function tick(run: CaveSession, count: number, input = NO_INPUT): void {
  for (let i = 0; i < count; i += 1) run.update(run.tickMs, input);
}

describe('scoring', () => {
  it('accumulates points', () => {
    const run = session();

    run.addScore(120);
    run.addScore(30);

    expect(run.score).toBe(150);
  });

  it('ignores non-positive awards', () => {
    const run = session();

    expect(run.addScore(0)).toBe(0);
    expect(run.addScore(-50)).toBe(0);
    expect(run.score).toBe(0);
  });

  it('grants an extra life at the threshold', () => {
    const run = session();

    const granted = run.addScore(EXTRA_LIFE_EVERY);

    expect(granted).toBe(1);
    expect(run.lives).toBe(STARTING_LIVES + 1);
  });

  it('grants one life per threshold crossed in a single award', () => {
    const run = session();

    // A single fat award (a cave clear with a big time bonus) must pay out
    // every threshold it crosses, not just the first.
    const granted = run.addScore(EXTRA_LIFE_EVERY * 3);

    expect(granted).toBe(3);
    expect(run.lives).toBe(STARTING_LIVES + 3);
  });

  it('does not re-award a threshold already crossed', () => {
    const run = session();

    run.addScore(EXTRA_LIFE_EVERY);
    const again = run.addScore(10);

    expect(again).toBe(0);
    expect(run.lives).toBe(STARTING_LIVES + 1);
  });

  it('caps lives but keeps consuming thresholds', () => {
    const run = session([spec()], MAX_LIVES);

    const granted = run.addScore(EXTRA_LIFE_EVERY * 2);

    expect(granted).toBe(0);
    expect(run.lives).toBe(MAX_LIVES);
    // The thresholds were still spent, so dropping below the cap does not
    // immediately hand back the lives that were forfeited at the cap.
    expect(run.pointsToExtraLife).toBe(EXTRA_LIFE_EVERY);
  });

  it('reports the distance to the next extra life', () => {
    const run = session();

    run.addScore(120);

    expect(run.pointsToExtraLife).toBe(EXTRA_LIFE_EVERY - 120);
  });
});

describe('finishing a cave', () => {
  it('banks the cave score plus a time bonus', () => {
    const run = session();
    const sim = run.simulation;
    sim.runtime.caveScore = 200;
    sim.runtime.diamondsCollected = 4;
    sim.runtime.timeLeft = 12;

    const result = run.finishCave();

    expect(result.diamonds).toBe(4);
    expect(result.caveScore).toBe(200);
    expect(result.secondsLeft).toBe(12);
    expect(result.timeBonus).toBe(12 * TIME_BONUS_PER_SECOND);
    expect(result.totalScore).toBe(200 + 12 * TIME_BONUS_PER_SECOND);
    expect(run.score).toBe(result.totalScore);
  });

  it('reports extra lives earned by the clear', () => {
    const run = session();
    run.simulation.runtime.caveScore = EXTRA_LIFE_EVERY;
    run.simulation.runtime.timeLeft = 0;

    const result = run.finishCave();

    expect(result.extraLives).toBe(1);
    expect(run.lives).toBe(STARTING_LIVES + 1);
  });

  it('flags the final cave', () => {
    const one = session([spec()]);
    const two = session([spec(), spec({ id: 'test-b', letter: 'B' })]);

    expect(one.finishCave().isFinalCave).toBe(true);
    expect(two.finishCave().isFinalCave).toBe(false);
  });
});

describe('advancing between caves', () => {
  it('restores the cave, score and lives from a checkpoint', () => {
    const run = new CaveSession(
      [spec(), spec({ id: 'test-b', letter: 'B' })],
      1,
      4,
      EXTRA_LIFE_EVERY + 250,
    );

    expect(run.caveIndex).toBe(1);
    expect(run.score).toBe(EXTRA_LIFE_EVERY + 250);
    expect(run.lives).toBe(4);
    expect(run.pointsToExtraLife).toBe(EXTRA_LIFE_EVERY - 250);
  });

  it('moves to the next cave and rebuilds it', () => {
    const run = session([spec(), spec({ id: 'test-b', letter: 'B' })]);
    const first = run.simulation;

    expect(run.advanceCave()).toBe(true);
    expect(run.caveIndex).toBe(1);
    expect(run.spec.letter).toBe('B');
    expect(run.simulation).not.toBe(first);
  });

  it('keeps the score across caves', () => {
    const run = session([spec(), spec({ id: 'test-b', letter: 'B' })]);
    run.addScore(340);

    run.advanceCave();

    expect(run.score).toBe(340);
  });

  it('refuses to advance past the last cave', () => {
    const run = session();

    expect(run.advanceCave()).toBe(false);
    expect(run.caveIndex).toBe(0);
  });

  it('clamps a start index that is out of range', () => {
    expect(new CaveSession([spec()], 99).caveIndex).toBe(0);
  });

  it('rejects an empty cave list', () => {
    expect(() => new CaveSession([])).toThrow(/at least one cave/);
  });
});

describe('losing lives', () => {
  it('deducts a life and rebuilds the cave', () => {
    const run = session();
    const first = run.simulation;

    expect(run.loseLife()).toBe(true);
    expect(run.lives).toBe(STARTING_LIVES - 1);
    expect(run.simulation).not.toBe(first);
  });

  it('keeps the banked score when a life is lost', () => {
    const run = session();
    run.addScore(275);

    run.loseLife();

    expect(run.score).toBe(275);
  });

  it('ends the run on the last life', () => {
    const run = session([spec()], 1);

    expect(run.loseLife()).toBe(false);
    expect(run.lives).toBe(0);
  });

  it('never reports negative lives', () => {
    const run = session([spec()], 1);

    run.loseLife();
    run.loseLife();

    expect(run.lives).toBe(0);
  });
});

describe('the fixed-step clock', () => {
  it('runs one scan per tick interval', () => {
    const run = session();

    const result = run.update(run.tickMs, NO_INPUT);

    expect(result.ticks).toBe(1);
  });

  it('does not scan until a full interval has elapsed', () => {
    const run = session();

    const result = run.update(run.tickMs / 3, NO_INPUT);

    expect(result.ticks).toBe(0);
    expect(run.tickAlpha).toBeCloseTo(1 / 3, 5);
  });

  it('caps catch-up so a long stall cannot fast-forward the cave', () => {
    const run = session();

    // Ten intervals of stall (an alt-tab, a GC pause) must not replay as ten
    // scans, or the player dies to hazards they never saw move.
    const result = run.update(run.tickMs * 10, NO_INPUT);

    expect(result.ticks).toBeLessThanOrEqual(4);
  });

  it('stops scanning once the cave is no longer running', () => {
    const run = session();
    run.simulation.runtime.outcome = CaveOutcome.Died;

    const result = run.update(run.tickMs * 4, NO_INPUT);

    expect(result.ticks).toBe(0);
    expect(result.outcome).toBe(CaveOutcome.Died);
  });
});

/** A boulder held up by a single cell of dirt, directly above the miner. */
const CRUSH_MAP = ['WWWWW', 'W r W', 'W . W', 'W P W', 'W   W', 'WWWWW'];

/** Run the birth animation out so the miner is controllable. */
function hatch(run: CaveSession): void {
  tick(run, BIRTH_TICKS + 1);
}

describe('the death path', () => {
  it('holds the cave open for the blast, then reports the death', () => {
    const run = session([spec({ map: CRUSH_MAP, diamondsRequired: 1 })]);

    hatch(run);
    // Grab the dirt propping the boulder up without stepping into the gap:
    // the classic way to drop a rock on your own head.
    tick(run, 1, { dir: Dir.Up, grab: true });
    tick(run, DEATH_HOLD_TICKS + 6);

    expect(run.simulation.runtime.playerAlive).toBe(false);
    expect(run.outcome).toBe(CaveOutcome.Died);
  });

  it('stays running while the death hold counts down', () => {
    const run = session([spec({ map: CRUSH_MAP, diamondsRequired: 1 })]);

    hatch(run);
    tick(run, 1, { dir: Dir.Up, grab: true });

    // Step until the miner is hit, then confirm the cave keeps scanning for
    // the hold window. GameScene relies on this: it reacts the moment the
    // outcome stops being "running", so the engine has to own the delay.
    let hitAt = -1;
    for (let i = 0; i < 20 && hitAt < 0; i += 1) {
      run.update(run.tickMs, NO_INPUT);
      if (!run.simulation.runtime.playerAlive) hitAt = i;
    }

    expect(hitAt).toBeGreaterThanOrEqual(0);
    expect(run.outcome).toBe(CaveOutcome.Running);

    tick(run, DEATH_HOLD_TICKS + 1);

    expect(run.outcome).toBe(CaveOutcome.Died);
  });

  it('times out when the clock runs down', () => {
    const run = session([spec({ timeLimit: 1 })]);

    tick(run, BIRTH_TICKS + Math.ceil(DEFAULT_TUNING.tickHz * 1.5) + DEATH_HOLD_TICKS + 2);

    expect(run.simulation.secondsLeft).toBe(0);
    expect(run.outcome).toBe(CaveOutcome.OutOfTime);
  });
});

describe('completing a cave by reaching the exit', () => {
  it('opens the exit and completes when the miner walks out', () => {
    // Two cells of dirt, a diamond, then the exit on the same row.
    const run = session([
      spec({
        map: ['WWWWWWW', 'WP.d.EW', 'WWWWWWW'],
        diamondsRequired: 1,
        diamondValue: 10,
      }),
    ]);

    tick(run, BIRTH_TICKS + 8, { dir: Dir.Right, grab: false });

    expect(run.simulation.runtime.diamondsCollected).toBe(1);
    expect(run.outcome).toBe(CaveOutcome.Complete);

    const result = run.finishCave();
    expect(result.caveScore).toBeGreaterThanOrEqual(10);
    expect(run.score).toBe(result.totalScore);
  });
});
