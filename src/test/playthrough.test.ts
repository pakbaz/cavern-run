import { describe, expect, it } from 'vitest';
import { CaveSession } from '../game/engine/CaveSession';
import { CaveOutcome } from '../game/engine/simTypes';
import { Tile, isFalling } from '../game/engine/tiles';
import { CAVES } from '../game/levels';
import { stageDefaults } from '../game/levels/stageProfiles';
import { replayCave } from './bot';
import { playReferenceStage } from './referenceCampaign';

describe('the individually referenced twenty-stage campaign', () => {
  it.each(CAVES.map((spec, index) => [index + 1, spec] as const))(
    'screen %i has a living normal-input finish and a reproducible route',
    (_screen, spec) => {
      const session = new CaveSession([spec]);
      const result = playReferenceStage(session);
      expect(result.outcome).toBe(CaveOutcome.Complete);
      expect(result.eventCounts.playerDied).toBe(0);
      expect(session.simulation.runtime.playerAlive).toBe(true);
      expect(result.diamonds).toBeGreaterThanOrEqual(spec.diamondsRequired);
      // Reference clocks are fixed. Keep human reaction room without padding
      // routes or overriding the published settings to force utilization bands.
      expect(result.secondsLeft).toBeGreaterThanOrEqual(spec.stageKind === 'intermission' ? 2 : 10);
      expect(replayCave(new CaveSession([spec]), result.inputs)).toEqual(result);
    },
  );

  it('plays the sixteen caves and four intermissions once each in reference order', () => {
    const session = new CaveSession(CAVES);
    const labels: string[] = [];
    for (let index = 0; index < CAVES.length; index += 1) {
      expect(session.caveIndex).toBe(index);
      expect(session.spec.displayLabel).toBe(stageDefaults(index).displayLabel);
      labels.push(session.spec.displayLabel!);
      expect(playReferenceStage(session).outcome).toBe(CaveOutcome.Complete);
      const result = session.finishCave();
      expect(result.caveIndex).toBe(index);
      expect(session.advanceCave()).toBe(index < CAVES.length - 1);
    }
    expect(labels).toEqual(Array.from({ length: 20 }, (_, index) => stageDefaults(index).displayLabel));
    expect(new Set(labels).size).toBe(20);
  });

  it.each(CAVES.map((spec, index) => [index + 1, spec] as const))(
    'screen %i gives the newly born player time to react',
    (_screen, spec) => {
      const session = new CaveSession([spec]);
      for (let tick = 0; tick < 30 && !session.simulation.runtime.playerBorn; tick += 1) {
        session.update(session.tickMs);
      }
      expect(session.simulation.runtime.playerBorn).toBe(true);
      for (let tick = 0; tick < 4; tick += 1) session.update(session.tickMs);
      expect(session.simulation.runtime.playerAlive).toBe(true);
    },
  );

  const production = [
    [3, 'butterfly', /[bB]/g, 'f'],
    [4, 'butterfly', /[bB]/g, 'f'],
    [7, 'amoeba', /a/g, 'r'],
    [8, 'magic wall', /M/g, 'W'],
    [17, 'magic wall', /M/g, 'W'],
    [18, 'magic wall', /M/g, 'W'],
    [19, 'magic wall', /M/g, 'W'],
  ] as const;

  it.each(production)(
    'screen index %i requires its %s diamond-production system',
    (index, _name, pattern, replacement) => {
      const spec = CAVES[index];
      const loose = spec.map.join('').split('d').length - 1;
      expect(loose).toBeLessThan(spec.diamondsRequired);
      const normal = playReferenceStage(new CaveSession([spec]));
      expect(normal.outcome).toBe(CaveOutcome.Complete);
      const disabled = { ...spec, map: spec.map.map((row) => row.replace(pattern, replacement)) };
      expect(playReferenceStage(new CaveSession([disabled])).outcome).not.toBe(CaveOutcome.Complete);
    },
  );

  it('keeps the introductory field playable and banks only earned points', () => {
    const session = new CaveSession(CAVES);
    const run = playReferenceStage(session);
    expect(run.eventCounts.land).toBeGreaterThan(0);
    expect(run.eventCounts.dig).toBeGreaterThan(0);
    const result = session.finishCave();
    expect(result.caveScore).toBeGreaterThan(0);
    expect(result.timeBonus).toBeGreaterThan(0);
    expect(result.totalScore).toBe(result.caveScore + result.timeBonus);
  });

  it('keeps the final hopper outlet clear through its three-second charge', () => {
    const spec = CAVES[19];
    const result = playReferenceStage(new CaveSession([spec]));
    expect(result.eventCounts.magicWallConvert).toBe(6);
    const replay = new CaveSession([spec]);
    let incomingScans = 0;
    const wallIndex = spec.map.join('').indexOf('M');
    const wallX = wallIndex % 40;
    const wallY = Math.floor(wallIndex / 40);
    for (const input of result.inputs) {
      const { cave } = replay.simulation;
      if (isFalling(cave.get(wallX, wallY - 1))) {
        expect(cave.get(wallX, wallY + 1)).not.toBe(Tile.Player);
        incomingScans += 1;
      }
      replay.update(replay.tickMs, input);
    }
    expect(incomingScans).toBeGreaterThan(0);
    const conversions = result.eventTicks.magicWallConvert!;
    expect(conversions.at(-1)! - conversions[0]).toBeLessThan(spec.magicWallTicks);
    expect(replay.outcome).toBe(CaveOutcome.Complete);
    expect(replay.simulation.cave.countTile(Tile.Player)).toBe(1);
  });
});
