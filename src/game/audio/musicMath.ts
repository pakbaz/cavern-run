import { TIME_CRITICAL_SECONDS, TIME_PRESSURE_SECONDS } from '../../config';
import { clamp } from '../render/renderMath';

/**
 * The soundtrack's brain.
 *
 * Nothing in here makes a sound: it decides *what* the music should be doing
 * given the state of the cave, and hands that to `MusicDirector` to synthesize.
 * Keeping it pure means the part of the audio system with actual rules in it
 * can be tested without a `AudioContext`.
 */

/* ------------------------------------------------------------------ *
 * Scales
 * ------------------------------------------------------------------ */

/** Semitone offsets from the root, darkest last. */
export const MODES = {
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
} as const;

export type ModeName = keyof typeof MODES;

/** Four tiers of five caves; the campaign audibly darkens as it goes. */
export const TIERS: ReadonlyArray<{ mode: ModeName; root: number }> = [
  { mode: 'dorian', root: 45 },
  { mode: 'aeolian', root: 43 },
  { mode: 'phrygian', root: 41 },
  { mode: 'locrian', root: 39 },
];

export interface MusicKey {
  readonly mode: ModeName;
  readonly scale: readonly number[];
  /** MIDI note number of the tonic. */
  readonly root: number;
  readonly tier: number;
}

/** Pick the key for a cave. Later caves sit lower and use darker modes. */
export function keyForCave(caveIndex: number, caveCount: number): MusicKey {
  const perTier = Math.max(1, Math.ceil(caveCount / TIERS.length));
  const tier = clamp(Math.floor(caveIndex / perTier), 0, TIERS.length - 1);
  const { mode, root } = TIERS[tier];
  return { mode, scale: MODES[mode], root, tier };
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

  const timeSpent =
    inputs.timeLimit > 0 ? clamp(1 - inputs.secondsLeft / inputs.timeLimit, 0, 1) : 0;

  const quotaLeft =
    inputs.diamondsRequired > 0
      ? clamp(1 - inputs.diamondsCollected / inputs.diamondsRequired, 0, 1)
      : 0;

  const threat = Number.isFinite(inputs.threatDistance)
    ? clamp(1 - inputs.threatDistance / THREAT_RANGE, 0, 1)
    : 0;

  let intensity =
    0.18 * difficulty + 0.34 * Math.pow(timeSpent, 1.6) + 0.16 * quotaLeft + 0.32 * threat;

  // The clock overrides everything else once it gets short.
  if (inputs.secondsLeft <= TIME_PRESSURE_SECONDS) intensity = Math.max(intensity, 0.62);
  if (inputs.secondsLeft <= TIME_CRITICAL_SECONDS) intensity = Math.max(intensity, 0.85);

  return clamp(intensity, 0, 1);
}

/** Beats per minute for a given intensity. */
export function tempoFor(intensity: number): number {
  return 100 + clamp(intensity, 0, 1) * 70;
}

/** Seconds per sixteenth note. */
export function stepDuration(bpm: number): number {
  return 60 / bpm / 4;
}

/* ------------------------------------------------------------------ *
 * Layers
 * ------------------------------------------------------------------ */

export interface LayerGains {
  /** Sustained chord bed; the first thing to go when things get tense. */
  readonly pad: number;
  readonly bass: number;
  readonly lead: number;
  readonly drums: number;
  /** Driving sixteenth-note hats, for the back half of a cave. */
  readonly hats: number;
  /** The countdown motif, only in the last few seconds. */
  readonly ticker: number;
}

export function layerGains(intensity: number, secondsLeft: number): LayerGains {
  const i = clamp(intensity, 0, 1);
  return {
    pad: clamp(1 - i * 1.15, 0, 1) * 0.55,
    bass: 0.5 + i * 0.35,
    lead: ramp(i, 0.12, 0.4) * (0.45 + i * 0.35),
    drums: ramp(i, 0.28, 0.55) * (0.4 + i * 0.45),
    hats: ramp(i, 0.5, 0.75) * 0.4,
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

/** Sixteen-step chord plan; one chord per bar, four bars to a loop. */
export const PROGRESSION: readonly number[] = [0, 5, 3, 4];

/** Scale degree the bass plays on a given sixteenth-note step. */
export function bassDegree(step: number): number {
  const bar = Math.floor(step / 16) % PROGRESSION.length;
  const root = PROGRESSION[bar];
  // Root, fifth, octave, fifth: a rolling arpeggio under everything.
  const shape = [0, 4, 7, 4][Math.floor(step / 2) % 4];
  return root + shape;
}

/**
 * Lead melody. Deterministic given the step, so a cave always plays the same
 * tune, but irregular enough not to sound like a scale exercise.
 */
export function leadDegree(step: number, seed: number): number {
  const bar = Math.floor(step / 16) % PROGRESSION.length;
  const beat = step % 16;
  const h = Math.sin((step * 12.9898 + seed * 78.233) * 43758.5453);
  const wobble = Math.floor((h - Math.floor(h)) * 5) - 2;
  return PROGRESSION[bar] + 7 + wobble + (beat % 8 === 0 ? 3 : 0);
}

/** Does the lead sound on this step at all? Sparse at low intensity. */
export function leadPlays(step: number, intensity: number): boolean {
  const beat = step % 16;
  if (intensity < 0.35) return beat === 0 || beat === 6;
  if (intensity < 0.65) return beat % 4 === 0 || beat === 6 || beat === 14;
  return beat % 2 === 0;
}

export interface DrumHit {
  readonly kick: boolean;
  readonly snare: boolean;
  readonly hat: boolean;
}

export function drumsAt(step: number, intensity: number): DrumHit {
  const beat = step % 16;
  const busy = intensity > 0.7;
  return {
    kick: beat === 0 || beat === 6 || (busy && beat === 10),
    snare: beat === 4 || beat === 12,
    hat: busy ? beat % 2 === 0 : beat % 4 === 2,
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
export function filterCutoff(intensity: number): number {
  return 420 + clamp(intensity, 0, 1) * 3600;
}

/** Seconds to crossfade when moving between caves. */
export const CAVE_CROSSFADE = 0.9;
