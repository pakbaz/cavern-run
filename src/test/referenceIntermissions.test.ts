import { describe, expect, it } from 'vitest';
import { CaveSession } from '../game/engine/CaveSession';
import { CaveOutcome } from '../game/engine/simTypes';
import { Tile } from '../game/engine/tiles';
import { CAVES } from '../game/levels';
import { stageDefaults } from '../game/levels/stageProfiles';
import { playCave, replayCave } from './bot';

describe('four separate intermissions', () => {
  it.each([4, 9, 14, 19])('screen %i uses its own published settings and completes', (index) => {
    const spec = CAVES[index];
    expect(spec).toMatchObject(stageDefaults(index));
    const run = new CaveSession([spec]);
    const result = playCave(run);
    expect(result.outcome).toBe(CaveOutcome.Complete);
    expect(result.secondsLeft).toBeGreaterThanOrEqual(2);
    expect(result.diamonds).toBeGreaterThanOrEqual(spec.diamondsRequired);
    const replay = replayCave(new CaveSession([spec]), result.inputs);
    expect(replay.outcome).toBe(CaveOutcome.Complete);
    expect(replay.ticks).toBe(result.ticks);
  });

  it('keeps the last pocket a six-diamond, three-second magic conversion puzzle', () => {
    const spec = CAVES[19];
    expect(spec.magicWallTicks).toBe(Math.round(spec.tickHz * 3));
    const run = playCave(new CaveSession([spec]));
    expect(run.eventCounts.magicWallConvert).toBe(6);
    expect(run.events.filter((event) => event.type === 'magicWallConvert')
      .every((event) => event.tile === Tile.DiamondFalling)).toBe(true);
  });
});
