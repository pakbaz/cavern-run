import { describe, expect, it } from 'vitest';

import { TIME_CRITICAL_SECONDS, TIME_PRESSURE_SECONDS } from '../../config';
import { CAVE_COUNT } from '../levels/index';
import {
  MODES,
  STEPS_PER_BAR,
  THEMES,
  THREAT_RANGE,
  TIER_ROOTS,
  arpDegree,
  arpPlays,
  bassDegree,
  chordDegree,
  drumsAt,
  filterCutoff,
  intensityOf,
  keyForCave,
  keyShift,
  layerGains,
  leadDegree,
  leadPlays,
  loopSteps,
  midiToFreq,
  musicPhase,
  scaleNote,
  stepDuration,
  swingOffset,
  tempoFor,
  tensionOf,
  themeForCave,
  tickerFreq,
  timeSpentOf,
  type IntensityInputs,
  type Phase,
} from './musicMath';

const calm: IntensityInputs = {
  difficulty: 0,
  secondsLeft: 150,
  timeLimit: 150,
  diamondsCollected: 0,
  diamondsRequired: 10,
  threatDistance: Number.POSITIVE_INFINITY,
};

const themeA = themeForCave(0);
const phases: readonly Phase[] = [0, 1, 2, 3];

describe('keys and scales', () => {
  it('walks from the brightest mode to the darkest across the campaign', () => {
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
    expect(keyForCave(500, 20).tier).toBe(TIER_ROOTS.length - 1);
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

describe('cave themes', () => {
  it('has one theme per cave in the campaign', () => {
    expect(THEMES.length).toBe(CAVE_COUNT);
    expect(new Set(THEMES.map((theme) => theme.id)).size).toBe(THEMES.length);
  });

  it('gives every cave a musically different piece', () => {
    const signatures = THEMES.map((theme) =>
      [theme.mode, theme.progression.join(), theme.motif.join(), theme.rhythm.join()].join('|'),
    );
    expect(new Set(signatures).size).toBe(THEMES.length);

    // Neighbouring caves should not even share a groove.
    for (let i = 1; i < THEMES.length; i += 1) {
      const previous = THEMES[i - 1];
      const theme = THEMES[i];
      expect(
        theme.baseTempo !== previous.baseTempo ||
          theme.kicks.join() !== previous.kicks.join() ||
          theme.swing !== previous.swing,
      ).toBe(true);
    }
  });

  it('keeps every theme playable', () => {
    for (const theme of THEMES) {
      expect(theme.progression.length).toBeGreaterThanOrEqual(2);
      expect(theme.motif.length).toBeGreaterThanOrEqual(3);
      expect(theme.rhythm.length).toBeGreaterThanOrEqual(3);
      expect(theme.kicks).toContain(0);
      expect(theme.swing).toBeGreaterThanOrEqual(0);
      expect(theme.swing).toBeLessThanOrEqual(0.4);
      expect(theme.baseTempo).toBeGreaterThan(60);
      expect(theme.baseTempo + theme.tempoSpan).toBeLessThan(200);
      expect(Math.abs(theme.rootOffset)).toBeLessThanOrEqual(1);

      for (const beat of [...theme.rhythm, ...theme.kicks, ...theme.snares]) {
        expect(beat).toBeGreaterThanOrEqual(0);
        expect(beat).toBeLessThan(STEPS_PER_BAR);
      }
      // The motif is read in order, so its rhythm has to be too.
      expect([...theme.rhythm].sort((a, b) => a - b)).toEqual([...theme.rhythm]);
    }
  });

  it('wraps past the end of the table instead of failing', () => {
    expect(themeForCave(THEMES.length)).toBe(THEMES[0]);
    expect(themeForCave(-4)).toBe(THEMES[0]);
    expect(themeForCave(Number.NaN)).toBe(THEMES[0]);
  });
});

describe('the arc of a cave', () => {
  it('measures how much of the clock has been spent', () => {
    expect(timeSpentOf(150, 150)).toBe(0);
    expect(timeSpentOf(75, 150)).toBeCloseTo(0.5, 6);
    expect(timeSpentOf(0, 150)).toBe(1);
    expect(timeSpentOf(999, 0)).toBe(0);
  });

  it('moves through all four movements as the clock drains', () => {
    expect(musicPhase(150, 150)).toBe(0);
    expect(musicPhase(100, 150)).toBe(1);
    expect(musicPhase(55, 150)).toBe(2);
    expect(musicPhase(20, 150)).toBe(3);
  });

  it('never goes backwards while a cave plays out', () => {
    let previous = musicPhase(150, 150);
    for (let left = 150; left >= 0; left -= 1) {
      const phase = musicPhase(left, 150);
      expect(phase).toBeGreaterThanOrEqual(previous);
      previous = phase;
    }
    expect(previous).toBe(3);
  });

  it('reacts to the absolute clock, not just the fraction', () => {
    // A short cave: only a quarter spent, but half a minute is half a minute.
    expect(musicPhase(29, 40)).toBe(2);
    expect(musicPhase(TIME_CRITICAL_SECONDS, 600)).toBe(3);
  });

  it('builds tension steeply toward the end', () => {
    expect(tensionOf(150, 150)).toBe(0);
    expect(tensionOf(120, 150)).toBeLessThan(tensionOf(90, 150));
    expect(tensionOf(90, 150)).toBeLessThan(tensionOf(60, 150));
    expect(tensionOf(0, 150)).toBe(1);

    // The back half has to climb faster than the front half.
    const front = tensionOf(75, 150) - tensionOf(150, 150);
    const back = tensionOf(0, 150) - tensionOf(75, 150);
    expect(back).toBeGreaterThan(front);
  });

  it('floors tension inside the pressure and critical windows', () => {
    expect(tensionOf(TIME_PRESSURE_SECONDS, 600)).toBeGreaterThanOrEqual(0.72);
    expect(tensionOf(TIME_CRITICAL_SECONDS, 600)).toBeGreaterThanOrEqual(0.93);
    expect(tensionOf(-5, 150)).toBe(1);
  });

  it('only winches the key up for the endgame', () => {
    expect(keyShift(0)).toBe(0);
    expect(keyShift(1)).toBe(0);
    expect(keyShift(2)).toBe(0);
    expect(keyShift(3)).toBe(1);
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
    expect(intensityOf({ ...calm, secondsLeft: TIME_PRESSURE_SECONDS })).toBeGreaterThanOrEqual(
      0.62,
    );
    expect(intensityOf({ ...calm, secondsLeft: TIME_CRITICAL_SECONDS })).toBeGreaterThanOrEqual(
      0.85,
    );
  });

  it('does not divide by zero on a cave with no clock or no quota', () => {
    const odd = intensityOf({ ...calm, timeLimit: 0, diamondsRequired: 0, secondsLeft: 999 });
    expect(Number.isFinite(odd)).toBe(true);
    expect(odd).toBeGreaterThanOrEqual(0);
  });
});

describe('tempo and timing', () => {
  it('speeds up with intensity, inside the theme’s own range', () => {
    expect(tempoFor(0, themeA)).toBe(themeA.baseTempo);
    expect(tempoFor(1, themeA)).toBe(themeA.baseTempo + themeA.tempoSpan);
    expect(tempoFor(0.5, themeA)).toBeGreaterThan(tempoFor(0.2, themeA));
  });

  it('gives each cave its own pulse', () => {
    const tempos = THEMES.map((theme) => tempoFor(0.5, theme));
    expect(new Set(tempos).size).toBeGreaterThan(THEMES.length / 2);
  });

  it('turns BPM into a sixteenth-note duration', () => {
    expect(stepDuration(120)).toBeCloseTo(0.125, 6);
    expect(stepDuration(60)).toBeCloseTo(0.25, 6);
  });

  it('drags the offbeats late on swung themes only', () => {
    const straight = THEMES.find((theme) => theme.swing === 0);
    expect(straight).toBeDefined();

    expect(swingOffset(0, themeA, 0.12)).toBe(0);
    expect(swingOffset(1, themeA, 0.12)).toBeCloseTo(0.12 * themeA.swing, 6);
    expect(swingOffset(1, straight!, 0.12)).toBe(0);
    expect(swingOffset(1, themeA, 0.12)).toBeLessThan(0.12);
  });

  it('opens the filter as things get frantic', () => {
    expect(filterCutoff(1, 0)).toBeGreaterThan(filterCutoff(0, 0));
    expect(filterCutoff(0.5, 3)).toBeGreaterThan(filterCutoff(0.5, 0));
    expect(filterCutoff(0, 0)).toBeGreaterThan(0);
  });
});

describe('layers', () => {
  it('thins the pad and brings in drums as intensity climbs', () => {
    const quiet = layerGains(0, 150, 0);
    const loud = layerGains(1, 150, 3);

    expect(quiet.pad).toBeGreaterThan(loud.pad);
    // The pad never disappears: it is what holds the harmony together.
    expect(loud.pad).toBeGreaterThan(0);
    expect(loud.drums).toBeGreaterThan(quiet.drums);
    expect(loud.bass).toBeGreaterThan(quiet.bass);
    expect(quiet.drums).toBe(0);
    expect(quiet.hats).toBe(0);
  });

  it('keeps every gain inside a sane range', () => {
    for (const phase of phases) {
      for (let i = 0; i <= 10; i += 1) {
        const gains = layerGains(i / 10, 100, phase);
        for (const value of Object.values(gains)) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('adds a layer with every movement', () => {
    const at = (phase: Phase) => layerGains(0.8, 100, phase);

    expect(at(0).arp).toBe(0);
    expect(at(1).arp).toBeGreaterThan(0);
    expect(at(2).arp).toBeGreaterThan(at(1).arp);

    expect(at(1).riser).toBe(0);
    expect(at(2).riser).toBeGreaterThan(0);
    expect(at(3).riser).toBeGreaterThan(at(2).riser);

    expect(at(1).drone).toBe(0);
    expect(at(3).drone).toBeGreaterThan(at(2).drone);
  });

  it('only starts the ticker in the final seconds', () => {
    expect(layerGains(0.9, TIME_CRITICAL_SECONDS + 1, 3).ticker).toBe(0);
    expect(layerGains(0.9, TIME_CRITICAL_SECONDS, 3).ticker).toBe(1);
  });

  it('raises the ticker pitch as the clock empties', () => {
    expect(tickerFreq(0)).toBeGreaterThan(tickerFreq(TIME_CRITICAL_SECONDS));
    expect(tickerFreq(-5)).toBe(tickerFreq(0));
  });
});

describe('harmony', () => {
  it('walks the progression, one chord per bar', () => {
    expect(chordDegree(0, themeA, 0)).toBe(themeA.progression[0]);
    expect(chordDegree(STEPS_PER_BAR, themeA, 0)).toBe(themeA.progression[1]);
    expect(chordDegree(loopSteps(themeA), themeA, 0)).toBe(themeA.progression[0]);
  });

  it('refuses to resolve the last bar once the cave gets serious', () => {
    const lastBar = loopSteps(themeA) - STEPS_PER_BAR;
    expect(chordDegree(lastBar, themeA, 1)).toBe(themeA.progression[3]);
    expect(chordDegree(lastBar, themeA, 2)).toBe(themeA.tensionChords[0]);
    expect(chordDegree(lastBar, themeA, 3)).toBe(themeA.tensionChords[1]);
    // Only the turnaround changes; the rest of the tune stays put.
    expect(chordDegree(0, themeA, 3)).toBe(themeA.progression[0]);
  });

  it('arpeggiates the bass within a bar instead of holding one note', () => {
    const bar = Array.from({ length: STEPS_PER_BAR }, (_, i) => bassDegree(i, themeA, 0));
    expect(new Set(bar).size).toBeGreaterThan(1);
    expect(bar[0]).toBe(themeA.progression[0] + themeA.bassShape[0]);
  });

  it('hammers the root in the endgame instead of arpeggiating', () => {
    const bar = Array.from({ length: STEPS_PER_BAR }, (_, i) => bassDegree(i, themeA, 3));
    const root = themeA.progression[0];
    expect(bar.filter((degree) => degree === root).length).toBeGreaterThan(
      Array.from({ length: STEPS_PER_BAR }, (_, i) => bassDegree(i, themeA, 0)).filter(
        (degree) => degree === root,
      ).length,
    );
  });
});

describe('melody', () => {
  it('is repeatable and finite for every theme', () => {
    for (const theme of THEMES) {
      for (let step = 0; step < loopSteps(theme); step += 1) {
        expect(leadDegree(step, theme, 0)).toBe(leadDegree(step, theme, 0));
        expect(Number.isFinite(leadDegree(step, theme, 0))).toBe(true);
      }
    }
  });

  it('develops the motif from bar to bar instead of repeating it', () => {
    const bar = (index: number) =>
      themeA.rhythm.map((beat) => leadDegree(index * STEPS_PER_BAR + beat, themeA, 0));

    const first = bar(0);
    // Chord movement aside, the shape itself has to change.
    const shapeOf = (notes: number[]) => notes.map((n) => n - notes[0]).join();
    expect(shapeOf(bar(1))).not.toBe(shapeOf(first));
    expect(shapeOf(bar(2))).not.toBe(shapeOf(first));
    expect(shapeOf(bar(3))).not.toBe(shapeOf(first));
  });

  it('uses more than a handful of notes over a loop', () => {
    const line = Array.from({ length: loopSteps(themeA) }, (_, i) => leadDegree(i, themeA, 0));
    expect(new Set(line).size).toBeGreaterThan(3);
  });

  it('lifts the melody an octave for the endgame', () => {
    expect(leadDegree(0, themeA, 3)).toBeGreaterThan(leadDegree(0, themeA, 0));
  });

  it('plays more often as intensity rises', () => {
    const count = (intensity: number) =>
      Array.from({ length: loopSteps(themeA) }, (_, i) =>
        leadPlays(i, intensity, themeA),
      ).filter(Boolean).length;

    expect(count(0.9)).toBeGreaterThan(count(0.5));
    expect(count(0.5)).toBeGreaterThan(count(0.1));
    expect(count(0.1)).toBeGreaterThan(0);
  });

  it('lands the melody on the beats its theme asks for', () => {
    for (const theme of THEMES) {
      for (const beat of theme.rhythm) expect(leadPlays(beat, 0.6, theme)).toBe(true);
    }
  });
});

describe('counter-line and drums', () => {
  it('holds the arpeggio back until the cave has warmed up', () => {
    const count = (phase: Phase) =>
      Array.from({ length: STEPS_PER_BAR }, (_, i) => arpPlays(i, phase)).filter(Boolean).length;

    expect(count(0)).toBe(0);
    expect(count(1)).toBeGreaterThan(0);
    expect(count(2)).toBeGreaterThan(count(1));
    expect(count(3)).toBeGreaterThan(count(2));
  });

  it('keeps the counter-line on the chord under it', () => {
    expect(arpDegree(0, themeA, 0)).toBe(themeA.progression[0] + 7 + themeA.arpShape[0]);
    expect(arpDegree(0, themeA, 3)).toBe(arpDegree(0, themeA, 0));
  });

  it('lands each theme’s groove and gets busier when pushed', () => {
    for (const theme of THEMES) {
      for (const beat of theme.kicks) expect(drumsAt(beat, 0.5, theme, 0).kick).toBe(true);
      for (const beat of theme.snares) expect(drumsAt(beat, 0.5, theme, 0).snare).toBe(true);
    }

    const hats = (intensity: number) =>
      Array.from({ length: STEPS_PER_BAR }, (_, i) => drumsAt(i, intensity, themeA, 0).hat).filter(
        Boolean,
      ).length;
    expect(hats(0.9)).toBeGreaterThan(hats(0.4));
  });

  it('rolls a fill into the top of the loop once time is short', () => {
    const fills = (phase: Phase) =>
      Array.from({ length: loopSteps(themeA) }, (_, i) => drumsAt(i, 0.6, themeA, phase).fill)
        .filter(Boolean).length;

    expect(fills(0)).toBe(0);
    expect(fills(1)).toBe(0);
    expect(fills(2)).toBeGreaterThan(0);
    expect(fills(3)).toBeGreaterThan(fills(2));

    // Fills belong at the very end of the loop, not scattered through it.
    const last = loopSteps(themeA) - 1;
    expect(drumsAt(last, 0.6, themeA, 3).fill).toBe(true);
    expect(drumsAt(0, 0.6, themeA, 3).fill).toBe(false);
  });
});
