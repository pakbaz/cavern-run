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
 * different piece. Time and nearby danger gently adjust tempo, tone and rhythm
 * weight, while the harmony and foreground melody remain stable enough to
 * listen to over a full cave.
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
 * urgency arrives gradually rather than dominating the whole run.
 */
export function tensionOf(secondsLeft: number, timeLimit: number): number {
  let tension = Math.pow(timeSpentOf(secondsLeft, timeLimit), 1.4);
  if (secondsLeft <= TIME_PRESSURE_SECONDS) tension = Math.max(tension, 0.72);
  if (secondsLeft <= TIME_CRITICAL_SECONDS) tension = Math.max(tension, 0.93);
  return clamp(tension, 0, 1);
}

/** Compatibility hook for key movement; the relaxed score stays in one key. */
export function keyShift(_phase: Phase): number {
  return 0;
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

  // Nearby danger matters, but it should colour the score rather than make
  // every passing creature sound like the final ten seconds. The clock owns
  // the long arc; quota and threat add shorter waves inside it.
  let intensity = 0.12 * difficulty + 0.44 * tension + 0.1 * quotaLeft + 0.28 * threat;

  // The clock overrides everything else once it gets short.
  if (inputs.secondsLeft <= TIME_PRESSURE_SECONDS) intensity = Math.max(intensity, 0.5);
  if (inputs.secondsLeft <= TIME_CRITICAL_SECONDS) intensity = Math.max(intensity, 0.68);

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
  /** Reserved counter-line gain; zero in the single-melody arrangement. */
  readonly arp: number;
  readonly drums: number;
  /** Sparse hat accents in the back half of a cave. */
  readonly hats: number;
  /** Reserved transition layer; zero in the relaxed arrangement. */
  readonly riser: number;
  /** Reserved tension layer; zero in the relaxed arrangement. */
  readonly drone: number;
  /** Reserved countdown layer; zero so it cannot interrupt the melody. */
  readonly ticker: number;
}

export function layerGains(intensity: number, _secondsLeft: number, _phase: Phase): LayerGains {
  const i = clamp(intensity, 0, 1);
  return {
    pad: 0.44 - i * 0.08,
    bass: 0.36 + i * 0.1,
    lead: ramp(i, 0.05, 0.28) * (0.38 + i * 0.14),
    arp: 0,
    drums: ramp(i, 0.42, 0.78) * (0.18 + i * 0.14),
    hats: ramp(i, 0.62, 0.88) * 0.1,
    riser: 0,
    drone: 0,
    ticker: 0,
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

/** The authored chord under a step; pressure never replaces the progression. */
export function chordDegree(step: number, theme: CaveTheme, _phase: Phase): number {
  const bar = barOf(step, theme);
  return theme.progression[bar];
}

/** Scale degree the bass plays on a given sixteenth-note step. */
export function bassDegree(step: number, theme: CaveTheme, phase: Phase): number {
  const root = chordDegree(step, theme, phase);
  const shape = theme.bassShape;
  const eighth = Math.floor(step / 2);
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

/** Shared three-note cave cadence that closes every otherwise unique phrase. */
export const CAVE_LEITMOTIF: readonly number[] = [2, -1, 0];

function melodicContour(theme: CaveTheme, bar: number, slot: number): number {
  const cell = theme.motif;
  const base = cell[slot % cell.length];
  const centre = cell[0];

  let contour = base;
  switch (bar % 4) {
    case 0:
      // State the cave's recognisable cell plainly.
      contour = base;
      break;
    case 1:
      // Echo it, lifting only the tail so it feels like a response.
      contour = base + (slot >= Math.ceil(cell.length / 2) ? 1 : 0);
      break;
    case 2:
      // Invert the contour around its opening note.
      contour = centre - (base - centre) + 1;
      break;
    default:
      // Every cave answers with the same short descending turn. It is the
      // campaign's shared subterranean signature around each unique melody.
      const cadenceStart = Math.max(0, theme.rhythm.length - CAVE_LEITMOTIF.length);
      contour =
        slot >= cadenceStart
          ? CAVE_LEITMOTIF[slot - cadenceStart]
          : base + (slot % 2 === 0 ? 1 : 0);
      break;
  }

  return clamp(contour, -2, 5);
}

/**
 * The melody.
 *
 * Each bar develops the theme's motif rather than repeating it: bar two lifts
 * the tail as an answer, bar three turns it upside down, and bar four returns
 * to the chord to close. That is what makes a cave sound like a tune
 * instead of a pattern, and it stays entirely deterministic, so a cave always
 * plays the same one.
 */
export function leadDegree(step: number, theme: CaveTheme, phase: Phase): number {
  const bar = barOf(step, theme);

  const beat = beatOf(step);
  const slot = motifSlot(theme, beat);
  const contour = melodicContour(theme, bar, slot);

  return chordDegree(step, theme, phase) + 10 + contour;
}

/**
 * Does the lead sound on this step at all? It remains call-and-response at
 * every intensity, adding only a few notes while preserving the third-bar rest.
 */
export function leadPlays(step: number, intensity: number, theme: CaveTheme): boolean {
  const bar = barOf(step, theme);
  const beat = beatOf(step);
  const slot = theme.rhythm.indexOf(beat);

  if (intensity < 0.08) return false;

  // At rest the tune is a call and answer with a whole middle bar left open.
  // More notes fill in as pressure rises, but the inverted third bar remains
  // deliberately sparse so the phrase keeps breathing.
  if (slot >= 0) {
    if (intensity < 0.32) {
      return bar !== 2 && (slot === 0 || slot === theme.rhythm.length - 1);
    }
    if (intensity < 0.75) {
      return bar !== 2 || slot === 0 || slot === theme.rhythm.length - 1;
    }
    return bar !== 2 || slot % 2 === 0 || slot === theme.rhythm.length - 1;
  }
  return false;
}

/** Dynamic shape for a melody note: phrase openings and endings read clearly. */
export function leadAccent(step: number, theme: CaveTheme): number {
  const beat = beatOf(step);
  const slot = theme.rhythm.indexOf(beat);
  if (slot === 0) return 1;
  if (slot === theme.rhythm.length - 1) return 0.9;
  return beat >= 8 ? 0.72 : 0.8;
}

/** Note length in sixteenth steps, with room after each phrase ending. */
export function leadLength(step: number, theme: CaveTheme): number {
  const beat = beatOf(step);
  const slot = theme.rhythm.indexOf(beat);
  return slot === theme.rhythm.length - 1 ? 2.8 : slot === 0 ? 1.9 : 1.35;
}

/** Retained pitch helper for compatibility with existing theme data. */
export function arpDegree(step: number, theme: CaveTheme, phase: Phase): number {
  const shape = theme.arpShape;
  const index = ((step % shape.length) + shape.length) % shape.length;
  return chordDegree(step, theme, phase) + 7 + shape[index];
}

/** The single-melody arrangement never schedules the former counter-line. */
export function arpPlays(_step: number, _phase: Phase): boolean {
  return false;
}

export interface DrumHit {
  readonly kick: boolean;
  readonly snare: boolean;
  readonly hat: boolean;
  /** Part of the snare roll that tips the loop over into the next one. */
  readonly fill: boolean;
}

export function drumsAt(step: number, intensity: number, theme: CaveTheme, _phase: Phase): DrumHit {
  const beat = beatOf(step);

  return {
    kick: theme.kicks.includes(beat),
    snare: theme.snares.includes(beat),
    hat: intensity >= 0.62 && (beat === 6 || beat === 14),
    fill: false,
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

/** Filter cutoff in Hz; gently brighter as intensity rises. */
export function filterCutoff(intensity: number, _phase: Phase): number {
  return 520 + clamp(intensity, 0, 1) * 1800;
}

/** Seconds to crossfade when moving between caves. */
export const CAVE_CROSSFADE = 0.35;

export { THEMES, themeForCave, type CaveTheme } from './caveThemes';
