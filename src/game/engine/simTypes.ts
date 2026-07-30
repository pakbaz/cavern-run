import type { Cave } from './Cave';
import type { Rng } from './rng';
import type { Direction, TileId } from './tiles';

/** Per-cave tuning knobs the rules consult. */
export interface CaveTuning {
  /** Diamonds needed before the exit opens. */
  readonly diamondsRequired: number;
  /** Score per diamond before the quota is met. */
  readonly diamondValue: number;
  /** Score per diamond once the quota is met. */
  readonly extraDiamondValue: number;
  /** Cave time limit, in seconds. */
  readonly timeLimit: number;
  /** Simulation scans per second. */
  readonly tickHz: number;

  /** Scans the amoeba spends creeping before it turns aggressive. */
  readonly amoebaSlowGrowthTicks: number;
  /** Per-cell growth probability during / after the slow phase. */
  readonly amoebaSlowGrowthChance: number;
  readonly amoebaGrowthChance: number;
  /** Cell count at which the amoeba collapses into boulders. */
  readonly amoebaMaxSize: number;

  /** Scans a magic wall stays charged once triggered. */
  readonly magicWallTicks: number;
  /** Probability a falling object seeps through slime each scan. */
  readonly slimePermeability: number;
  /** Probability a boulder push succeeds on a given scan. */
  readonly pushChance: number;
}

export const DEFAULT_TUNING: CaveTuning = {
  diamondsRequired: 10,
  diamondValue: 10,
  extraDiamondValue: 20,
  timeLimit: 150,
  tickHz: 7.5,
  amoebaSlowGrowthTicks: 200,
  amoebaSlowGrowthChance: 0.03,
  amoebaGrowthChance: 0.25,
  amoebaMaxSize: 200,
  magicWallTicks: 140,
  slimePermeability: 0.25,
  pushChance: 0.25,
};

/** Lifecycle of the shared magic-wall charge. */
export const MagicWallStatus = {
  Dormant: 'dormant',
  Active: 'active',
  Expired: 'expired',
} as const;

export type MagicWallStatusValue = (typeof MagicWallStatus)[keyof typeof MagicWallStatus];

/** Why the current cave ended. */
export const CaveOutcome = {
  Running: 'running',
  Complete: 'complete',
  Died: 'died',
  OutOfTime: 'outOfTime',
} as const;

export type CaveOutcomeValue = (typeof CaveOutcome)[keyof typeof CaveOutcome];

/** Mutable per-cave simulation state. */
export interface CaveRuntime {
  /** Scans elapsed since the cave started. */
  ticks: number;
  /** Seconds left on the clock. */
  timeLeft: number;

  playerX: number;
  playerY: number;
  /** False for cave fragments used in tests that contain no player. */
  hasPlayer: boolean;
  /** False while the birth animation plays or after death. */
  playerAlive: boolean;
  /** Set once the birth animation completes. */
  playerBorn: boolean;
  birthTicks: number;

  diamondsCollected: number;
  /** Score earned inside this cave (excludes the end-of-cave time bonus). */
  caveScore: number;
  exitOpen: boolean;
  outcome: CaveOutcomeValue;
  /** Scans remaining before a death is reported, so the blast can play out. */
  deathHold: number;

  magicWallStatus: MagicWallStatusValue;
  magicWallTicksLeft: number;

  amoebaSize: number;
  /** True if any amoeba cell had somewhere to grow during the last scan. */
  amoebaCanGrow: boolean;
  /** Set once the amoeba has converted and should stop being simulated. */
  amoebaResolved: boolean;
}

/** What the player is trying to do on this scan. */
export interface PlayerInput {
  readonly dir: Direction | null;
  /** Hold to take a tile without stepping into it. */
  readonly grab: boolean;
}

export const NO_INPUT: PlayerInput = { dir: null, grab: false };

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

export type SimEvent =
  | { type: 'dig'; x: number; y: number }
  | { type: 'push'; x: number; y: number; dir: Direction }
  | { type: 'land'; x: number; y: number; tile: TileId }
  | { type: 'diamond'; x: number; y: number; value: number; collected: number }
  | { type: 'explode'; x: number; y: number; intoDiamonds: boolean }
  | { type: 'magicWallStart'; x: number; y: number }
  | { type: 'magicWallConvert'; x: number; y: number; tile: TileId }
  | { type: 'magicWallStop' }
  | { type: 'amoebaGrow'; x: number; y: number }
  | { type: 'amoebaResolved'; into: TileId }
  | { type: 'slime'; x: number; y: number }
  | { type: 'expand'; x: number; y: number }
  | { type: 'exitOpen'; x: number; y: number }
  | { type: 'playerBorn'; x: number; y: number }
  | { type: 'playerDied'; x: number; y: number }
  | { type: 'caveComplete' };

export type SimEventType = SimEvent['type'];

/**
 * The surface the rule modules operate against. `CaveSim` implements it;
 * declaring it separately keeps the rules free of circular imports and
 * trivially mockable in tests.
 */
export interface SimContext {
  readonly cave: Cave;
  readonly rng: Rng;
  readonly tuning: CaveTuning;
  readonly runtime: CaveRuntime;
  emit(event: SimEvent): void;
}
