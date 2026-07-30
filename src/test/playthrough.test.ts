import { describe, expect, it } from 'vitest';

import { CaveSession } from '../game/engine/CaveSession';
import { CaveOutcome } from '../game/engine/simTypes';
import { Tile } from '../game/engine/tiles';
import { CAVES } from '../game/levels/index';
import { canReach, playCave } from './bot';

/**
 * End-to-end proof that every cave can actually be won by playing it.
 *
 * Every other test drives one rule in isolation. These drive the whole stack
 * the way a player does -- birth, movement, digging, collection, the exit
 * opening, walking out -- through the same `update(dt, input)` the keyboard
 * feeds, with no forced outcomes and no writing to the grid.
 *
 * Cave seeds are derived from the cave id, so a win here is the same win a
 * player gets: the campaign is provably completable, cave by cave, and no
 * retuning can quietly ship a quota that cannot be met in the time allowed.
 */

describe('playing the caves', () => {
  for (const spec of CAVES) {
    it(`cave ${spec.letter} can be played from birth to the exit`, () => {
      const run = new CaveSession([spec], 0, 3);

      const result = playCave(run);

      expect(`${spec.letter}: ${result.outcome} ${result.diamonds}/${spec.diamondsRequired}`).toBe(
        `${spec.letter}: ${CaveOutcome.Complete} ${result.diamonds}/${spec.diamondsRequired}`,
      );
      expect(result.diamonds).toBeGreaterThanOrEqual(spec.diamondsRequired);
      expect(run.simulation.runtime.exitOpen).toBe(true);
    });
  }

  it('banks a score and a time bonus for a cave that was really played', () => {
    const run = new CaveSession([CAVES[0]], 0, 3);

    playCave(run);
    const result = run.finishCave();

    expect(result.caveScore).toBeGreaterThan(0);
    expect(result.timeBonus).toBeGreaterThan(0);
    expect(result.totalScore).toBe(result.caveScore + result.timeBonus);
    expect(run.score).toBe(result.totalScore);
  });

  it('runs the whole campaign without a cave sealing its own exit', () => {
    // Left alone, no cave may close off its exit: expanding walls, the amoeba
    // and settling boulders all reshape the map, and a cave whose exit becomes
    // unreachable before the player gets there is unwinnable.
    for (const spec of CAVES) {
      const run = new CaveSession([spec], 0, 3);
      const scans = Math.ceil(spec.timeLimit * spec.tickHz);
      for (let i = 0; i < scans; i += 1) run.update(run.tickMs);

      const exitStandingOpen = canReach(
        run.simulation,
        (tile) => tile === Tile.ExitClosed || tile === Tile.ExitOpen,
      );
      expect(`${spec.letter}: ${exitStandingOpen}`).toBe(`${spec.letter}: true`);
    }
  });
});
