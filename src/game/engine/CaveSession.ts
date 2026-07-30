import {
  EXTRA_LIFE_EVERY,
  MAX_LIVES,
  STARTING_LIVES,
  TIME_BONUS_PER_SECOND,
} from '../../config';
import { buildCave, type CaveSpec } from '../levels/caveFormat';
import { CaveSim } from './CaveSim';
import { hashSeed } from './rng';
import {
  CaveOutcome,
  NO_INPUT,
  type CaveOutcomeValue,
  type PlayerInput,
  type SimEvent,
} from './simTypes';

/** Result of folding a completed cave into the run. */
export interface CaveResult {
  readonly caveIndex: number;
  readonly diamonds: number;
  readonly caveScore: number;
  readonly secondsLeft: number;
  readonly timeBonus: number;
  readonly totalScore: number;
  readonly extraLives: number;
  readonly isFinalCave: boolean;
}

/** What one `update` did. */
export interface SessionUpdate {
  readonly ticks: number;
  readonly events: readonly SimEvent[];
  readonly outcome: CaveOutcomeValue;
}

/**
 * A single playthrough: the cave list, the running score, the lives, and the
 * fixed-timestep clock that drives the simulation.
 *
 * The simulation advances in discrete scans at the current cave's `tickHz`;
 * `tickAlpha` reports how far the clock is between scans so the renderer can
 * interpolate sprites and keep motion smooth at 60fps.
 */
export class CaveSession {
  readonly caves: readonly CaveSpec[];

  caveIndex: number;
  score: number;
  lives: number;

  private sim: CaveSim;
  private accumulator = 0;
  private nextExtraLifeAt: number;
  private readonly collectedEvents: SimEvent[] = [];

  constructor(caves: readonly CaveSpec[], startIndex = 0, lives = STARTING_LIVES, initialScore = 0) {
    if (caves.length === 0) throw new Error('A session needs at least one cave');
    this.caves = caves;
    this.caveIndex = clamp(startIndex, 0, caves.length - 1);
    this.lives = lives;
    this.score = Math.max(0, Math.floor(initialScore));
    this.nextExtraLifeAt = (Math.floor(this.score / EXTRA_LIFE_EVERY) + 1) * EXTRA_LIFE_EVERY;
    this.sim = this.createSim();
  }

  get spec(): CaveSpec {
    return this.caves[this.caveIndex];
  }

  get simulation(): CaveSim {
    return this.sim;
  }

  get outcome(): CaveOutcomeValue {
    return this.sim.runtime.outcome;
  }

  /** Milliseconds between scans for the current cave. */
  get tickMs(): number {
    return 1000 / this.spec.tickHz;
  }

  /** Progress toward the next scan, 0..1, for render interpolation. */
  get tickAlpha(): number {
    return Math.min(1, this.accumulator / this.tickMs);
  }

  get isFinalCave(): boolean {
    return this.caveIndex >= this.caves.length - 1;
  }

  /**
   * Feed real elapsed time into the fixed-step simulation.
   *
   * The accumulator is capped so that a long stall (an alt-tab, a GC pause)
   * cannot make the cave fast-forward through several scans at once and kill
   * the player before the frame is even drawn.
   */
  update(deltaMs: number, input: PlayerInput = NO_INPUT): SessionUpdate {
    this.collectedEvents.length = 0;
    let ticks = 0;

    if (this.sim.isRunning) {
      const step = this.tickMs;
      this.accumulator = Math.min(this.accumulator + deltaMs, step * 4);

      while (this.accumulator >= step && this.sim.isRunning) {
        this.accumulator -= step;
        for (const event of this.sim.tick(input)) this.collectedEvents.push(event);
        ticks += 1;
      }
    }

    return { ticks, events: this.collectedEvents, outcome: this.sim.runtime.outcome };
  }

  /**
   * Fold a completed cave into the run: bank the cave score, tally the time
   * bonus and hand out any extra lives earned along the way.
   */
  finishCave(): CaveResult {
    const { runtime } = this.sim;
    const secondsLeft = this.sim.secondsLeft;
    const timeBonus = secondsLeft * TIME_BONUS_PER_SECOND;

    const extraLives = this.addScore(runtime.caveScore + timeBonus);

    return {
      caveIndex: this.caveIndex,
      diamonds: runtime.diamondsCollected,
      caveScore: runtime.caveScore,
      secondsLeft,
      timeBonus,
      totalScore: this.score,
      extraLives,
      isFinalCave: this.isFinalCave,
    };
  }

  /** Move on to the next cave. Returns false when the run is already won. */
  advanceCave(): boolean {
    if (this.isFinalCave) return false;
    this.caveIndex += 1;
    this.restartCave();
    return true;
  }

  /**
   * Deduct a life and rebuild the cave.
   * @returns false when that was the last life and the run is over.
   */
  loseLife(): boolean {
    this.lives -= 1;
    if (this.lives <= 0) {
      this.lives = 0;
      return false;
    }
    this.restartCave();
    return true;
  }

  /** Rebuild the current cave from its spec, leaving score and lives alone. */
  restartCave(): void {
    this.sim = this.createSim();
    this.accumulator = 0;
  }

  /** Award points, granting an extra life at every threshold crossed. */
  addScore(points: number): number {
    if (points <= 0) return 0;
    this.score += points;

    let granted = 0;
    while (this.score >= this.nextExtraLifeAt) {
      this.nextExtraLifeAt += EXTRA_LIFE_EVERY;
      if (this.lives < MAX_LIVES) {
        this.lives += 1;
        granted += 1;
      }
    }
    return granted;
  }

  /** Points still to earn before the next extra life. */
  get pointsToExtraLife(): number {
    return Math.max(0, this.nextExtraLifeAt - this.score);
  }

  private createSim(): CaveSim {
    const spec = this.spec;
    return new CaveSim(buildCave(spec), spec, hashSeed(spec.id));
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export { CaveOutcome };
