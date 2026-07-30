import { CaveOutcome, type PlayerInput, type SimContext } from '../simTypes';
import {
  DIR_DX,
  DIR_DY,
  Tile,
  isDeadly,
  isDiamond,
} from '../tiles';
import { killPlayer } from './explosions';

/**
 * Advance the birth animation. The player hatches from a pulsing egg so the
 * camera has a beat to settle and the opening chord has time to land.
 */
export function updatePlayerBirth(ctx: SimContext): void {
  const { cave, runtime } = ctx;
  if (!runtime.hasPlayer || runtime.playerBorn) return;

  runtime.birthTicks -= 1;
  if (runtime.birthTicks > 0) return;

  const egg = cave.findFirst((tile) => tile === Tile.PlayerBirth);
  if (!egg) {
    // The egg was destroyed before it hatched.
    runtime.playerBorn = true;
    runtime.playerAlive = false;
    return;
  }

  cave.set(egg.x, egg.y, Tile.Player);
  cave.markScanned(egg.x, egg.y);
  runtime.playerX = egg.x;
  runtime.playerY = egg.y;
  runtime.playerBorn = true;
  runtime.playerAlive = true;
  ctx.emit({ type: 'playerBorn', x: egg.x, y: egg.y });
}

/**
 * Resolve the player's action for this scan: dig, collect, push, step or die.
 *
 * Holding the grab modifier takes the target tile without stepping into it,
 * which is how you tunnel out from under a boulder without committing.
 */
export function updatePlayer(ctx: SimContext, input: PlayerInput): void {
  const { cave, runtime } = ctx;
  if (!runtime.playerBorn || !runtime.playerAlive) return;

  const px = runtime.playerX;
  const py = runtime.playerY;

  if (cave.get(px, py) !== Tile.Player) {
    // Something removed the player between scans.
    runtime.playerAlive = false;
    return;
  }

  cave.markScanned(px, py);
  if (input.dir === null) return;

  const dx = DIR_DX[input.dir];
  const dy = DIR_DY[input.dir];
  const tx = px + dx;
  const ty = py + dy;
  const target = cave.get(tx, ty);

  if (isDeadly(target)) {
    killPlayer(ctx, px, py);
    return;
  }

  if (target === Tile.Dirt) {
    cave.set(tx, ty, Tile.Empty);
    ctx.emit({ type: 'dig', x: tx, y: ty });
    if (!input.grab) step(ctx, px, py, tx, ty);
    return;
  }

  if (isDiamond(target)) {
    collect(ctx, tx, ty);
    cave.set(tx, ty, Tile.Empty);
    if (!input.grab) step(ctx, px, py, tx, ty);
    return;
  }

  if (target === Tile.Empty) {
    if (!input.grab) step(ctx, px, py, tx, ty);
    return;
  }

  if (target === Tile.ExitOpen) {
    step(ctx, px, py, tx, ty);
    runtime.outcome = CaveOutcome.Complete;
    ctx.emit({ type: 'caveComplete' });
    return;
  }

  // Boulders can only be shouldered sideways, never lifted or stamped down,
  // and never while grabbing.
  if (target === Tile.Boulder && dy === 0 && !input.grab) {
    tryPush(ctx, px, py, tx, ty, dx, input.dir);
  }
}

/** Open the exit the moment the quota is met. */
export function updateExit(ctx: SimContext): void {
  const { cave, runtime, tuning } = ctx;
  if (runtime.exitOpen) return;
  if (runtime.diamondsCollected < tuning.diamondsRequired) return;

  runtime.exitOpen = true;
  const exit = cave.findFirst((tile) => tile === Tile.ExitClosed);
  if (!exit) return;

  cave.set(exit.x, exit.y, Tile.ExitOpen);
  ctx.emit({ type: 'exitOpen', x: exit.x, y: exit.y });
}

function collect(ctx: SimContext, x: number, y: number): void {
  const { runtime, tuning } = ctx;
  const quotaMet = runtime.diamondsCollected >= tuning.diamondsRequired;
  const value = quotaMet ? tuning.extraDiamondValue : tuning.diamondValue;

  runtime.diamondsCollected += 1;
  runtime.caveScore += value;
  ctx.emit({ type: 'diamond', x, y, value, collected: runtime.diamondsCollected });
}

function step(ctx: SimContext, px: number, py: number, tx: number, ty: number): void {
  const { cave, runtime } = ctx;
  cave.move(px, py, tx, ty, Tile.Player);
  runtime.playerX = tx;
  runtime.playerY = ty;
}

function tryPush(
  ctx: SimContext,
  px: number,
  py: number,
  tx: number,
  ty: number,
  dx: number,
  dir: NonNullable<PlayerInput['dir']>,
): void {
  const { cave, rng, tuning } = ctx;

  const beyondX = tx + dx;
  if (cave.get(beyondX, ty) !== Tile.Empty) return;
  // Boulders resist: a push takes a few scans of steady pressure.
  if (!rng.chance(tuning.pushChance)) return;

  cave.set(beyondX, ty, Tile.Boulder);
  cave.markScanned(beyondX, ty);
  cave.logMove(tx, ty, beyondX, ty, Tile.Boulder);
  ctx.emit({ type: 'push', x: beyondX, y: ty, dir });

  cave.set(tx, ty, Tile.Empty);
  step(ctx, px, py, tx, ty);
}
