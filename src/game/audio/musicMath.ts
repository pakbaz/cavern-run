import { TIME_CRITICAL_SECONDS, TIME_PRESSURE_SECONDS } from '../../config';
import { clamp } from '../render/renderMath';
import { themeForCave, type CaveTheme } from './caveThemes';

/**
 * The soundtrack's brain.
 *
 * Nothing in here makes a sound: it decides *what* the music should be doing
 * given the state of the cave, and hands that to `MusicDirector` to synthesize.
 * Keeping it pure means the part of the audio system with actual rules in it
 * can be tested without a `AudioContext`.
 *
 * Two things shape a cave's music. Its `CaveTheme` (see `caveThemes.ts`) fixes
 * the tune -- mode, progression, motif, groove, timbres -- so every cave is a
 * different piece. The *phase*, driven by how much of the clock has been spent,
 * then develops that piece: layers arrive, the melody thickens, the final bar
 * stops resolving, and the whole thing is winched up a semitone for the last
 * few seconds.
 */

/* ------------------------------------------------------------------ *
 * Scales
 * ------------------------------------------------------------------ */

/** Semitone offsets from the root, darkest last. */
export const MODES = {
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  hungarian: [0, 2, 3, 6, 7, 8, 11],
  locrian: [0, 1, 3, 5, 6, 8, 10],
} as const;

export type ModeName = keyof typeof MODES;

/** Four tiers of five caves; the campaign audibly sinks as it goes. */
export const TIER_ROOTS: readonly number[] = [45, 43, 41, 39];

export interface MusicKey {
  readonly mode: ModeName;
  readonly scale: readonly number[];
  /** MIDI note number of the tonic. */
  readonly root: number;
  readonly tier: number;
}

/** Pick the key for a cave: the tier sets the depth, the theme the colour. */
export function keyForCave(caveIndex: number, caveCount: number): MusicKey {
  const perTier = Math.max(1, Math.ceil(caveCount / TIER_ROOTS.length));
  const tier = clamp(Math.floor(caveIndex / perTier), 0, TIER_ROOTS.length - 1);
  const theme = themeForCave(caveIndex);
  return {
    mode: theme.mode,
    scale: MODES[theme.mode],
    root: TIER_ROOTS[tier] + theme.rootOffset,
    tier,
  };
}

/** Equal-temperament frequency for a MIDI note number. */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Nth degree of a scale, wrapping into higher octaves for degrees past the
 * top of it. Negative degrees wrap downwards.
 */
export function scaleNote(key: MusicKey, degree: number): number {
  const size = key.scale.length;
  const octave = Math.floor(degree / size);
  const step = ((degree % size) + size) % size;
  return key.root + octave * 12 + key.scale[step];
}

/* ------------------------------------------------------------------ *
 * The arc of a cave
 * ------------------------------------------------------------------ */

/**
 * A cave is scored like a four-movement piece. Which movement is playing
 * depends only on the clock, so the music tells the same story every run.
 */
export const PHASE_NAMES = ['prowl', 'build', 'drive', 'panic'] as const;
export type Phase = 0 | 1 | 2 | 3;

/** Fractions of the clock at which each movement takes over. */
export const PHASE_EDGES: readonly number[] = [0.3, 0.58, 0.82];

/** 0 at the start of a cave, 1 when the clock has run out. */
export function timeSpentOf(secondsLeft: number, timeLimit: number): number {
  if (timeLimit <= 0) return 0;
  return clamp(1 - secondsLeft / timeLimit, 0, 1);
}

export function musicPhase(secondsLeft: number, timeLimit: number): Phase {
  const spent = timeSpentOf(secondsLeft, timeLimit);

  let phase: Phase = 0;
  if (spent >= PHASE_EDGES[2]) phase = 3;
  else if (spent >= PHASE_EDGES[1]) phase = 2;
  else if (spent >= PHASE_EDGES[0]) phase = 1;

  // A generous cave can still be near its limit in absolute terms; the last
  // half-minute always sounds like the last half-minute.
  if (secondsLeft <= TIME_PRESSURE_SECONDS && phase < 2) phase = 2;
  if (secondsLeft <= TIME_CRITICAL_SECONDS) phase = 3;
  return phase;
}

/**
 * Pure time pressure, 0..1. Curved so the first third of a cave stays calm and
 * the last third climbs steeply -- the dread should arrive gradually and then
 * all at once.
 */
export function tensionOf(secondsLeft: number, timeLimit: number): number {
  let tension = Math.pow(timeSpentOf(secondsLeft, timeLimit), 1.4);
  if (secondsLeft <= TIME_PRESSURE_SECONDS) tension = Math.max(tension, 0.72);
  if (secondsLeft <= TIME_CRITICAL_SECONDS) tension = Math.max(tension, 0.93);
  return clamp(tension, 0, 1);
}

/**
 * Semitones the whole key is lifted by. Winching the tune up for the endgame
 * is a cheap trick and it works every time.
 */
export function keyShift(phase: Phase): number {
  return phase >= 3 ? 1 : 0;
}

/* ------------------------------------------------------------------ *
 * Intensity
 * ------------------------------------------------------------------ */

export interface IntensityInputs {
  /** 0 for the first cave, 1 for the last. */
  readonly difficulty: number;
  readonly secondsLeft: number;
  readonly timeLimit: number;
  readonly diamondsCollected: number;
  readonly diamondsRequired: number;
  /**
   * Distance in cells to the nearest creature or amoeba, or Infinity when the
   * cave holds no threat at all.
   */
  readonly threatDistance: number;
}

/** How close a creature has to be before the music starts to notice. */
export const THREAT_RANGE = 8;

/**
 * Collapse the state of the cave into a single 0..1 dial that everything else
 * in the soundtrack hangs off.
 */
export function intensityOf(inputs: IntensityInputs): number {
  const difficulty = clamp(inputs.difficulty, 0, 1);
  const tension = tensionOf(inputs.secondsLeft, inputs.timeLimit);

  const quotaLeft =
    inputs.diamondsRequired > 0
      ? clamp(1 - inputs.diamondsCollected / inputs.diamondsRequired, 0, 1)
      : 0;

  const threat = Number.isFinite(inputs.threatDistance)
    ? clamp(1 - inputs.threatDistance / THREAT_RANGE, 0, 1)
    : 0;

  let intensity = 0.16 * difficulty + 0.36 * tension + 0.16 * quotaLeft + 0.32 * threat;

  // The clock overrides everything else once it gets short.
  if (inputs.secondsLeft <= TIME_PRESSURE_SECONDS) intensity = Math.max(intensity, 0.62);
  if (inputs.secondsLeft <= TIME_CRITICAL_SECONDS) intensity = Math.max(intensity, 0.85);

  return clamp(intensity, 0, 1);
}

/** Beats per minute for a given intensity, in the theme's own range. */
export function tempoFor(intensity: number, theme: CaveTheme): number {
  return theme.baseTempo + clamp(intensity, 0, 1) * theme.tempoSpan;
}

/** Seconds per sixteenth note. */
export function stepDuration(bpm: number): number {
  return 60 / bpm / 4;
}

/**
 * How late an offbeat sixteenth lands, in seconds. A swung cave lopes; a
 * straight one marches.
 */
export function swingOffset(step: number, theme: CaveTheme, stepSeconds: number): number {
  return step % 2 === 1 ? stepSeconds * clamp(theme.swing, 0, 0.4) : 0;
}

/* ------------------------------------------------------------------ *
 * Layers
 * ------------------------------------------------------------------ */

export interface LayerGains {
  /** Sustained chord bed; thins out but never quite leaves. */
  readonly pad: number;
  readonly bass: number;
  readonly lead: number;
  /** Sixteenth-note counter-line that answers the melody. */
  readonly arp: number;
  readonly drums: number;
  /** Driving sixteenth-note hats, for the back half of a cave. */
  readonly hats: number;
  /** Swell into each loop once the cave is running out of time. */
  readonly riser: number;
  /** Dissonant pedal underneath the endgame. */
  readonly drone: number;
  /** The countdown motif, only in the last few seconds. */
  readonly ticker: number;
}

export function layerGains(intensity: number, secondsLeft: number, phase: Phase): LayerGains {
  const i = clamp(intensity, 0, 1);
  return {
    pad: (0.28 + clamp(1 - i * 1.1, 0, 1) * 0.72) * 0.5,
    bass: 0.5 + i * 0.35,
    lead: ramp(i, 0.08, 0.32) * (0.45 + i * 0.3),
    arp: phase >= 1 ? ramp(i, 0.26, 0.6) * (0.28 + phase * 0.06) : 0,
    drums: ramp(i, 0.22, 0.5) * (0.4 + i * 0.45),
    hats: ramp(i, 0.45, 0.7) * 0.4,
    riser: phase >= 2 ? 0.45 + (phase - 2) * 0.35 : 0,
    drone: phase >= 3 ? 0.7 : phase >= 2 ? 0.22 : 0,
    ticker: secondsLeft <= TIME_CRITICAL_SECONDS ? 1 : 0,
  };
}

/** Linear fade-in of a layer between two intensity thresholds. */
function ramp(value: number, from: number, to: number): number {
  if (to <= from) return value >= to ? 1 : 0;
  return clamp((value - from) / (to - from), 0, 1);
}

/* ------------------------------------------------------------------ *
 * Patterns
 * ------------------------------------------------------------------ */

/** Sixteenths in a bar. */
export const STEPS_PER_BAR = 16;

/** How many sixteenths one time through a theme's progression takes. */
export function loopSteps(theme: CaveTheme): number {
  return theme.progression.length * STEPS_PER_BAR;
}

/** Which bar of the loop a step falls in. */
function barOf(step: number, theme: CaveTheme): number {
  const bars = theme.progression.length;
  return ((Math.floor(step / STEPS_PER_BAR) % bars) + bars) % bars;
}

/** Which sixteenth of its bar a step falls on. */
function beatOf(step: number): number {
  return ((step % STEPS_PER_BAR) + STEPS_PER_BAR) % STEPS_PER_BAR;
}

/**
 * The chord under a step. Late in a cave the last bar of the loop is swapped
 * for something that refuses to resolve, so the tune keeps asking a question
 * it never answers.
 */
export function chordDegree(step: number, theme: CaveTheme, phase: Phase): number {
  const bars = theme.progression.length;
  const bar = barOf(step, theme);

  if (bar === bars - 1) {
    if (phase >= 3) return theme.tensionChords[1];
    if (phase >= 2) return theme.tensionChords[0];
  }
  return theme.progression[bar];
}

/** Scale degree the bass plays on a given sixteenth-note step. */
export function bassDegree(step: number, theme: CaveTheme, phase: Phase): number {
  const root = chordDegree(step, theme, phase);
  const shape = theme.bassShape;
  const eighth = Math.floor(step / 2);
  // In the endgame the bass abandons its arpeggio and hammers the root.
  if (phase >= 3 && eighth % 2 === 1) return root;
  return root + shape[((eighth % shape.length) + shape.length) % shape.length];
}

/** Which note of the motif belongs to a given sixteenth of the bar. */
function motifSlot(theme: CaveTheme, beat: number): number {
  let slot = -1;
  for (let i = 0; i < theme.rhythm.length; i += 1) {
    if (theme.rhythm[i] <= beat) slot = i;
  }
  return slot < 0 ? 0 : slot;
}

/**
 * The melody.
 *
 * Each bar develops the theme's motif rather than repeating it: bar two is the
 * same shape a step higher, bar three turns it upside down, bar four sequences
 * it and falls back to close. That is what makes a cave sound like a tune
 * instead of a pattern, and it stays entirely deterministic, so a cave always
 * plays the same one.
 */
export function leadDegree(step: number, theme: CaveTheme, phase: Phase): number {
  const bars = theme.progression.length;
  const bar = barOf(step, theme);

  const cell = theme.motif;
  const slot = motifSlot(theme, beatOf(step));
  const last = slot === cell.length - 1;

  let note: number;
  switch (bar % 4) {
    case 0:
      note = cell[slot % cell.length];
      break;
    case 1:
      // Sequence: the same shape, a step up the scale.
      note = cell[(slot + 1) % cell.length] + 1;
      break;
    case 2:
      // Inversion: the shape turned on its head around the third.
      note = 2 - cell[slot % cell.length];
      break;
    default:
      // Turnaround: sequenced up a third, then pulled back down to close.
      note = cell[(slot + 2) % cell.length] + (last ? -1 : 2);
      break;
  }

  // An octave up for the endgame, and for the unresolved final bar before it.
  const lift = phase >= 3 ? 7 : phase >= 2 && bar === bars - 1 ? 7 : 0;
  return chordDegree(step, theme, phase) + 14 + note + lift;
}

/**
 * Does the lead sound on this step at all? Sparse and call-and-response at low
 * intensity, filled in with passing notes when the cave is frantic.
 */
export function leadPlays(step: number, intensity: number, theme: CaveTheme): boolean {
  const bar = barOf(step, theme);
  const beat = beatOf(step);
  const slot = theme.rhythm.indexOf(beat);

  if (slot < 0) return intensity >= 0.72 && beat % 4 === 2;
  // Calm caves only state the call, and only every other bar.
  if (intensity < 0.25) return bar % 2 === 0 && slot % 2 === 0;
  if (intensity < 0.5) return bar % 2 === 0 || slot % 2 === 0;
  return true;
}

/** The counter-line that runs under the melody once a cave gets going. */
export function arpDegree(step: number, theme: CaveTheme, phase: Phase): number {
  const shape = theme.arpShape;
  const index = ((step % shape.length) + shape.length) % shape.length;
  return chordDegree(step, theme, phase) + 7 + shape[index];
}

/** The counter-line thickens with every phase, from a hint to a torrent. */
export function arpPlays(step: number, phase: Phase): boolean {
  const beat = beatOf(step);
  if (phase <= 0) return false;
  if (phase === 1) return beat % 4 === 2;
  if (phase === 2) return beat % 2 === 1;
  return true;
}

export interface DrumHit {
  readonly kick: boolean;
  readonly snare: boolean;
  readonly hat: boolean;
  /** Part of the snare roll that tips the loop over into the next one. */
  readonly fill: boolean;
}

export function drumsAt(step: number, intensity: number, theme: CaveTheme, phase: Phase): DrumHit {
  const bars = theme.progression.length;
  const bar = barOf(step, theme);
  const beat = beatOf(step);

  const busy = intensity > 0.65;
  const fill = phase >= 2 && bar === bars - 1 && beat >= (phase >= 3 ? 12 : 14);

  return {
    kick: theme.kicks.includes(beat) || (busy && !fill && beat === 14),
    snare: theme.snares.includes(beat) || fill,
    hat: busy ? beat % 2 === 0 : beat % 4 === 2,
    fill,
  };
}

/**
 * Pitch of the countdown ticker. It climbs as the last seconds run out, so
 * you can hear the clock without looking at it.
 */
export function tickerFreq(secondsLeft: number): number {
  const t = clamp(1 - secondsLeft / TIME_CRITICAL_SECONDS, 0, 1);
  return 660 + t * 660;
}

/** Filter cutoff in Hz; brighter as the cave gets more frantic. */
export function filterCutoff(intensity: number, phase: Phase): number {
  return 380 + clamp(intensity, 0, 1) * 3400 + phase * 140;
}

/** Seconds to crossfade when moving between caves. */
export const CAVE_CROSSFADE = 0.9;

export { THEMES, themeForCave, type CaveTheme } from './caveThemes';
