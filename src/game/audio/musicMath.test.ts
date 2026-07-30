import { describe, expect, it } from 'vitest';

import { TIME_CRITICAL_SECONDS, TIME_PRESSURE_SECONDS } from '../../config';
import {
  MODES,
  PROGRESSION,
  THREAT_RANGE,
  TIERS,
  bassDegree,
  drumsAt,
  filterCutoff,
  intensityOf,
  keyForCave,
  layerGains,
  leadDegree,
  leadPlays,
  midiToFreq,
  scaleNote,
  stepDuration,
  tempoFor,
  tickerFreq,
  type IntensityInputs,
} from './musicMath';

const calm: IntensityInputs = {
  difficulty: 0,
  secondsLeft: 150,
  timeLimit: 150,
  diamondsCollected: 0,
  diamondsRequired: 10,
  threatDistance: Number.POSITIVE_INFINITY,
};

describe('keys and scales', () => {
  it('walks through every tier across the campaign, darkest last', () => {
    expect(keyForCave(0, 20).mode).toBe('dorian');
    expect(keyForCave(19, 20).mode).toBe('locrian');

    const tiers = [0, 5, 10, 15].map((i) => keyForCave(i, 20).tier);
    expect(tiers).toEqual([0, 1, 2, 3]);
  });

  it('drops the tonic lower with each tier', () => {
    const roots = [0, 5, 10, 15].map((i) => keyForCave(i, 20).root);
    for (let i = 1; i < roots.length; i += 1) expect(roots[i]).toBeLessThan(roots[i - 1]);
  });

  it('clamps rather than falling off the end of the tier table', () => {
    expect(keyForCave(-3, 20).tier).toBe(0);
    expect(keyForCave(500, 20).tier).toBe(TIERS.length - 1);
    expect(keyForCave(0, 1).tier).toBe(0);
  });

  it('gives every mode seven degrees starting on the tonic', () => {
    for (const intervals of Object.values(MODES)) {
      expect(intervals.length).toBe(7);
      expect(intervals[0]).toBe(0);
    }
  });

  it('wraps scale degrees into octaves in both directions', () => {
    const key = keyForCave(0, 20);
    expect(scaleNote(key, 0)).toBe(key.root);
    expect(scaleNote(key, 7)).toBe(key.root + 12);
    expect(scaleNote(key, -7)).toBe(key.root - 12);
    expect(scaleNote(key, 8)).toBe(key.root + 12 + key.scale[1]);
  });

  it('converts MIDI to frequency', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
    expect(midiToFreq(81)).toBeCloseTo(880, 6);
    expect(midiToFreq(57)).toBeCloseTo(220, 6);
  });
});

describe('intensity', () => {
  it('is low in a fresh, easy, empty cave', () => {
    expect(intensityOf(calm)).toBeLessThan(0.25);
  });

  it('stays within 0..1 for every plausible input', () => {
    const worst = intensityOf({
      difficulty: 1,
      secondsLeft: 0,
      timeLimit: 150,
      diamondsCollected: 0,
      diamondsRequired: 30,
      threatDistance: 0,
    });
    expect(worst).toBeGreaterThan(0.9);
    expect(worst).toBeLessThanOrEqual(1);
  });

  it('rises as the clock runs down', () => {
    const early = intensityOf({ ...calm, secondsLeft: 140 });
    const late = intensityOf({ ...calm, secondsLeft: 60 });
    expect(late).toBeGreaterThan(early);
  });

  it('rises as a creature closes in, and ignores anything out of range', () => {
    const far = intensityOf({ ...calm, threatDistance: THREAT_RANGE });
    const near = intensityOf({ ...calm, threatDistance: 1 });
    expect(near).toBeGreaterThan(far);
    expect(far).toBeCloseTo(intensityOf(calm), 6);
  });

  it('eases off as the quota gets filled', () => {
    const empty = intensityOf({ ...calm, diamondsCollected: 0 });
    const full = intensityOf({ ...calm, diamondsCollected: 10 });
    expect(full).toBeLessThan(empty);
  });

  it('slams a floor under the last thirty and last ten seconds', () => {
    expect(intensityOf({ ...calm, secondsLeft: TIME_PRESSURE_SECONDS })).toBeGreaterThanOrEqual(0.62);
    expect(intensityOf({ ...calm, secondsLeft: TIME_CRITICAL_SECONDS })).toBeGreaterThanOrEqual(0.85);
  });

  it('does not divide by zero on a cave with no clock or no quota', () => {
    const odd = intensityOf({ ...calm, timeLimit: 0, diamondsRequired: 0, secondsLeft: 999 });
    expect(Number.isFinite(odd)).toBe(true);
    expect(odd).toBeGreaterThanOrEqual(0);
  });
});

describe('tempo and timing', () => {
  it('speeds up with intensity, within a musical range', () => {
    expect(tempoFor(0)).toBe(100);
    expect(tempoFor(1)).toBe(170);
    expect(tempoFor(0.5)).toBeGreaterThan(tempoFor(0.2));
  });

  it('turns BPM into a sixteenth-note duration', () => {
    expect(stepDuration(120)).toBeCloseTo(0.125, 6);
    expect(stepDuration(60)).toBeCloseTo(0.25, 6);
  });

  it('opens the filter as things get frantic', () => {
    expect(filterCutoff(1)).toBeGreaterThan(filterCutoff(0));
    expect(filterCutoff(0)).toBeGreaterThan(0);
  });
});

describe('layers', () => {
  it('drops the pad and brings in drums as intensity climbs', () => {
    const quiet = layerGains(0, 150);
    const loud = layerGains(1, 150);

    expect(quiet.pad).toBeGreaterThan(loud.pad);
    expect(loud.pad).toBe(0);
    expect(loud.drums).toBeGreaterThan(quiet.drums);
    expect(loud.bass).toBeGreaterThan(quiet.bass);
    expect(quiet.drums).toBe(0);
    expect(quiet.hats).toBe(0);
  });

  it('keeps every gain inside a sane range', () => {
    for (let i = 0; i <= 10; i += 1) {
      const gains = layerGains(i / 10, 100);
      for (const value of Object.values(gains)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it('only starts the ticker in the final seconds', () => {
    expect(layerGains(0.9, TIME_CRITICAL_SECONDS + 1).ticker).toBe(0);
    expect(layerGains(0.9, TIME_CRITICAL_SECONDS).ticker).toBe(1);
  });

  it('raises the ticker pitch as the clock empties', () => {
    expect(tickerFreq(0)).toBeGreaterThan(tickerFreq(TIME_CRITICAL_SECONDS));
    expect(tickerFreq(-5)).toBe(tickerFreq(0));
  });
});

describe('patterns', () => {
  it('walks the bass through the progression, one chord per bar', () => {
    expect(bassDegree(0)).toBe(PROGRESSION[0]);
    expect(bassDegree(16)).toBe(PROGRESSION[1]);
    expect(bassDegree(64)).toBe(PROGRESSION[0]);
  });

  it('arpeggiates within a bar instead of holding one note', () => {
    const bar = Array.from({ length: 16 }, (_, i) => bassDegree(i));
    expect(new Set(bar).size).toBeGreaterThan(1);
  });

  it('produces a repeatable lead melody', () => {
    for (let step = 0; step < 64; step += 1) {
      expect(leadDegree(step, 3)).toBe(leadDegree(step, 3));
      expect(Number.isFinite(leadDegree(step, 3))).toBe(true);
    }
    const line = Array.from({ length: 32 }, (_, i) => leadDegree(i, 3));
    expect(new Set(line).size).toBeGreaterThan(3);
  });

  it('plays the lead more often as intensity rises', () => {
    const count = (intensity: number) =>
      Array.from({ length: 16 }, (_, i) => leadPlays(i, intensity)).filter(Boolean).length;

    expect(count(0.9)).toBeGreaterThan(count(0.5));
    expect(count(0.5)).toBeGreaterThan(count(0.1));
    expect(count(0.1)).toBeGreaterThan(0);
  });

  it('lands the backbeat on 2 and 4 and gets busier when pushed', () => {
    expect(drumsAt(0, 0.5).kick).toBe(true);
    expect(drumsAt(4, 0.5).snare).toBe(true);
    expect(drumsAt(12, 0.5).snare).toBe(true);

    const hats = (intensity: number) =>
      Array.from({ length: 16 }, (_, i) => drumsAt(i, intensity).hat).filter(Boolean).length;
    expect(hats(0.9)).toBeGreaterThan(hats(0.4));
  });
});
