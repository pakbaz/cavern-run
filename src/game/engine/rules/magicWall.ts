import { MagicWallStatus, type SimContext } from '../simTypes';
import { Tile, asFalling, isBoulder, isDiamond, type TileId } from '../tiles';

/** Age the shared magic-wall charge by one scan. */
export function updateMagicWall(ctx: SimContext): void {
  const { runtime } = ctx;
  if (runtime.magicWallStatus !== MagicWallStatus.Active) return;

  runtime.magicWallTicksLeft -= 1;
  if (runtime.magicWallTicksLeft <= 0) {
    runtime.magicWallTicksLeft = 0;
    runtime.magicWallStatus = MagicWallStatus.Expired;
    ctx.emit({ type: 'magicWallStop' });
  }
}

/**
 * Handle a falling object at (x, y) whose next cell down is a magic wall.
 *
 * A dormant wall wakes up on first contact and stays charged for a fixed
 * number of scans. While charged it swaps boulders for diamonds (and diamonds
 * for boulders) and drops the result out of its underside; if there is no room
 * below, the object is simply consumed. Once the charge expires the wall is
 * inert forever and objects just land on it.
 *
 * @returns true when the wall consumed the object, false to let it land.
 */
export function tryMagicWallPass(ctx: SimContext, x: number, y: number): boolean {
  const { cave, runtime, tuning } = ctx;

  if (runtime.magicWallStatus === MagicWallStatus.Expired) return false;

  const falling = cave.get(x, y);
  const converted = convert(falling);
  if (converted === null) return false;

  if (runtime.magicWallStatus === MagicWallStatus.Dormant) {
    runtime.magicWallStatus = MagicWallStatus.Active;
    runtime.magicWallTicksLeft = tuning.magicWallTicks;
    ctx.emit({ type: 'magicWallStart', x, y: y + 1 });
  }

  const outY = y + 2;
  cave.set(x, y, Tile.Empty);

  if (cave.get(x, outY) === Tile.Empty) {
    cave.set(x, outY, converted);
    cave.markScanned(x, outY);
    ctx.emit({ type: 'magicWallConvert', x, y: outY, tile: converted });
  }

  return true;
}

/** Boulders become diamonds and diamonds become boulders, both still falling. */
function convert(tile: TileId): TileId | null {
  if (isBoulder(tile)) return asFalling(Tile.Diamond);
  if (isDiamond(tile)) return asFalling(Tile.Boulder);
  return null;
}
