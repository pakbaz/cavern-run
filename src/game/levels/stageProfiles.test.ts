import { describe, expect, it } from 'vitest';
import { stageLabel } from './caveFormat';
import { stageDefaults } from './stageProfiles';
import { CAVES } from './index';

describe('individual Level 1 reference profiles', () => {
  const quotas = [12, 10, 24, 36, 6, 4, 4, 15, 10, 16, 75, 12, 6, 19, 14, 50, 30, 15, 12, 6];
  const clocks = [150, 150, 150, 120, 10, 150, 150, 120, 120, 15, 150, 150, 120, 180, 20, 160, 150, 120, 150, 20];
  const values = [10, 20, 15, 5, 30, 50, 40, 10, 10, 10, 5, 25, 50, 20, 10, 5, 10, 10, 10, 30];
  const bonuses = [15, 50, 0, 20, 0, 90, 60, 20, 20, 0, 10, 60, 0, 0, 0, 8, 20, 20, 20, 0];
  const profiles = Array.from({ length: 20 }, (_, index) => stageDefaults(index));

  it('matches the published numeric table separately for every screen', () => {
    expect(profiles.map((profile) => profile.diamondsRequired)).toEqual(quotas);
    expect(profiles.map((profile) => profile.timeLimit)).toEqual(clocks);
    expect(profiles.map((profile) => profile.diamondValue)).toEqual(values);
    expect(profiles.map((profile) => profile.extraDiamondValue)).toEqual(bonuses);
  });

  it.each(Array.from({ length: 20 }, (_, index) => index))(
    'wires screen %i to its own profile instead of reusing another screen',
    (index) => {
      const profile = profiles[index];
      expect(CAVES[index]).toMatchObject({
        id: profile.id,
        letter: profile.letter,
        name: profile.name,
        displayLabel: profile.displayLabel,
        stageKind: profile.stageKind,
        diamondsRequired: profile.diamondsRequired,
        timeLimit: profile.timeLimit,
        diamondValue: profile.diamondValue,
        extraDiamondValue: profile.extraDiamondValue,
      });
      if ([8, 17, 18, 19].includes(index)) {
        expect(CAVES[index].magicWallTicks).toBe(profile.magicWallTicks);
      }
      if ([7, 15].includes(index)) {
        expect(CAVES[index].amoebaSlowGrowthTicks).toBe(profile.amoebaSlowGrowthTicks);
      }
    },
  );

  it('inserts four distinct intermissions into the sixteen-cave sequence', () => {
    expect(profiles.flatMap((profile, index) => profile.stageKind === 'intermission' ? [index + 1] : []))
      .toEqual([5, 10, 15, 20]);
    expect(profiles.filter((profile) => profile.stageKind === 'cave')
      .map((profile) => stageLabel(profile, true)).join('')).toBe('ABCDEFGHIJKLMNOP');
    expect(stageLabel(profiles[4])).toBe('INTERMISSION 1');
    expect(stageLabel(profiles[19], true)).toBe('I-4');
  });

  it('converts each published magic and amoeba duration to simulation scans', () => {
    for (const [index, seconds] of [[8, 20], [17, 8], [18, 20], [19, 3]]) {
      expect(profiles[index].magicWallTicks).toBe(Math.round(seconds * profiles[index].tickHz));
    }
    for (const [index, seconds] of [[7, 75], [15, 140]]) {
      expect(profiles[index].amoebaSlowGrowthTicks).toBe(Math.round(seconds * profiles[index].tickHz));
    }
  });

  it('rejects an invalid profile instead of reusing another stage', () => {
    for (const index of [-1, 20, 0.5, Number.NaN]) {
      expect(() => stageDefaults(index)).toThrow('Invalid reference stage');
    }
  });
});
