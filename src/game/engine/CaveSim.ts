import { BIRTH_TICKS, DEATH_HOLD_TICKS } from '../../config';
import { Cave } from './Cave';
import { Rng } from './rng';
import { updateAmoeba } from './rules/amoeba';
import { updateCreatures } from './rules/creatures';
import { advanceExplosions } from './rules/explosions';
import { applyGravity } from './rules/gravity';
import { updateMagicWall } from './rules/magicWall';
import { updateExit, updatePlayer, updatePlayerBirth } from './rules/player';
import { updateExpandingWalls } from './rules/walls';
import {
  CaveOutcome,
  MagicWallStatus,
  type CaveRuntime,
  type CaveTuning,
  type PlayerInput,
  type SimContext,
  type SimEvent,
} from './simTypes';
import { Tile, isCreature } from './tiles';

/**
 * One cave, simulated.
 *
 * `tick` performs exactly one scan of the grid and returns everything that
 * happened, which the render and audio layers consume without ever reaching
 * into the grid themselves. No Phaser, no DOM — the whole simulation runs in
 * a plain Node test process.
 */
export class CaveSim implements SimContext {
  readonly cave: Cave;
  readonly rng: Rng;
  readonly tuning: CaveTuning;
  readonly runtime: CaveRuntime;

  private readonly pending: SimEvent[] = [];

  constructor(cave: Cave, tuning: CaveTuning, seed: number) {
    this.cave = cave;
    this.tuning = tuning;
    this.rng = new Rng(seed);

    const spawn = cave.findFirst((tile) => tile === Tile.Player);
    // The player hatches from an egg rather than simply appearing.
    if (spawn) cave.set(spawn.x, spawn.y, Tile.PlayerBirth);

    this.runtime = {
      ticks: 0,
      timeLeft: tuning.timeLimit,
      playerX: spawn?.x ?? 0,
      playerY: spawn?.y ?? 0,
      hasPlayer: spawn !== null,
      playerAlive: false,
      playerBorn: false,
      birthTicks: BIRTH_TICKS,
      diamondsCollected: 0,
      caveScore: 0,
      exitOpen: false,
      outcome: CaveOutcome.Running,
      deathHold: DEATH_HOLD_TICKS,
      magicWallStatus: MagicWallStatus.Dormant,
      magicWallTicksLeft: 0,
      amoebaSize: cave.countTile(Tile.Amoeba),
      amoebaCanGrow: true,
      amoebaResolved: cave.countTile(Tile.Amoeba) === 0,
    };
  }

  emit(event: SimEvent): void {
    this.pending.push(event);
  }

  /**
   * Advance the world by one scan.
   *
   * Order matters. The player acts before gravity so that stepping under a
   * boulder that is already falling is fatal, exactly as it should be, while
   * standing beneath a resting boulder stays safe.
   */
  tick(input: PlayerInput): readonly SimEvent[] {
    this.pending.length = 0;

    const { cave, runtime } = this;
    if (runtime.outcome !== CaveOutcome.Running) return this.pending;

    cave.beginScan();
    runtime.ticks += 1;

    advanceExplosions(this);
    updateMagicWall(this);

    updatePlayerBirth(this);
    updatePlayer(this, input);
    updateExit(this);

    applyGravity(this);
    updateCreatures(this);
    updateAmoeba(this);
    updateExpandingWalls(this);

    this.advanceClock();
    this.settleDeath();

    return this.pending;
  }

  private advanceClock(): void {
    const { runtime, tuning } = this;
    if (runtime.outcome !== CaveOutcome.Running) return;
    if (!runtime.hasPlayer || !runtime.playerBorn) return;

    runtime.timeLeft -= 1 / tuning.tickHz;
    if (runtime.timeLeft > 0) return;

    runtime.timeLeft = 0;
    if (runtime.playerAlive) {
      runtime.playerAlive = false;
      this.emit({ type: 'playerDied', x: runtime.playerX, y: runtime.playerY });
    }
    runtime.outcome = CaveOutcome.OutOfTime;
  }

  /** Let the blast play out for a beat before reporting the loss. */
  private settleDeath(): void {
    const { runtime } = this;
    if (runtime.outcome !== CaveOutcome.Running) return;
    if (!runtime.hasPlayer) return;
    if (runtime.playerAlive || !runtime.playerBorn) return;

    runtime.deathHold -= 1;
    if (runtime.deathHold <= 0) {
      runtime.outcome = CaveOutcome.Died;
    }
  }

  /** Whole seconds shown on the HUD. */
  get secondsLeft(): number {
    return Math.max(0, Math.ceil(this.runtime.timeLeft));
  }

  get diamondsNeeded(): number {
    return Math.max(0, this.tuning.diamondsRequired - this.runtime.diamondsCollected);
  }

  get isRunning(): boolean {
    return this.runtime.outcome === CaveOutcome.Running;
  }

  /**
   * Chebyshev distance from the player to the closest firefly or butterfly,
   * or `Infinity` if the cave has none. Drives the soundtrack's menace layer.
   */
  nearestThreatDistance(): number {
    const { cave, runtime } = this;
    if (!runtime.playerAlive) return Number.POSITIVE_INFINITY;

    let best = Number.POSITIVE_INFINITY;
    for (let y = 0; y < cave.height; y += 1) {
      for (let x = 0; x < cave.width; x += 1) {
        if (!isCreature(cave.get(x, y))) continue;
        const distance = Math.max(Math.abs(x - runtime.playerX), Math.abs(y - runtime.playerY));
        if (distance < best) best = distance;
      }
    }
    return best;
  }
}
