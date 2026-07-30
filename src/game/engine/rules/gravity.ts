import type { SimContext } from '../simTypes';
import {
  Tile,
  asFalling,
  asResting,
  isButterfly,
  isCrushable,
  isFallable,
  isFalling,
  isRounded,
} from '../tiles';
import { detonate } from './explosions';
import { tryMagicWallPass } from './magicWall';
import { trySlimePass } from './walls';

/**
 * Gravity: falling and rolling for boulders and diamonds.
 *
 * Rows are scanned bottom-to-top so that a stack of boulders falls as a
 * cohesive column — the cell below has already been vacated by the time the
 * boulder above is considered. `Cave.move` flags the destination as scanned,
 * which caps every object at exactly one cell of travel per scan and produces
 * the lock-step cascades the genre is built on.
 *
 * Per cell, in order of precedence:
 *   1. empty below            -> fall one cell
 *   2. magic wall below       -> convert (falling objects only)
 *   3. slime below            -> seep through
 *   4. falling onto a victim  -> detonate
 *   5. rounded surface below  -> roll left, else right
 *   6. otherwise              -> come to rest
 */
export function applyGravity(ctx: SimContext): void {
  const { cave } = ctx;

  for (let y = cave.height - 1; y >= 0; y -= 1) {
    for (let x = 0; x < cave.width; x += 1) {
      const tile = cave.get(x, y);
      if (!isFallable(tile)) continue;
      if (cave.isScanned(x, y)) continue;

      stepObject(ctx, x, y);
    }
  }
}

function stepObject(ctx: SimContext, x: number, y: number): void {
  const { cave } = ctx;
  const tile = cave.get(x, y);
  const below = cave.get(x, y + 1);
  const falling = isFalling(tile);

  if (below === Tile.Empty) {
    cave.move(x, y, x, y + 1, asFalling(tile));
    return;
  }

  if (below === Tile.MagicWall && falling) {
    if (tryMagicWallPass(ctx, x, y)) return;
    land(ctx, x, y);
    return;
  }

  if (below === Tile.Slime) {
    if (trySlimePass(ctx, x, y)) return;
    land(ctx, x, y);
    return;
  }

  if (falling && isCrushable(below)) {
    // A crushed butterfly still pays out: its debris is diamonds.
    detonate(ctx, x, y + 1, isButterfly(below));
    return;
  }

  if (isRounded(below) && tryRoll(ctx, x, y)) return;

  land(ctx, x, y);
}

/**
 * Roll off a rounded surface. Both the side cell and the cell diagonally
 * below it must be clear, and left is always tried before right.
 */
function tryRoll(ctx: SimContext, x: number, y: number): boolean {
  const { cave } = ctx;
  const tile = cave.get(x, y);

  for (const dx of [-1, 1]) {
    if (cave.get(x + dx, y) !== Tile.Empty) continue;
    if (cave.get(x + dx, y + 1) !== Tile.Empty) continue;
    cave.move(x, y, x + dx, y, asFalling(tile));
    return true;
  }

  return false;
}

/** Settle an object, announcing the impact if it had been in free fall. */
function land(ctx: SimContext, x: number, y: number): void {
  const { cave } = ctx;
  const tile = cave.get(x, y);
  if (!isFalling(tile)) return;

  const resting = asResting(tile);
  cave.set(x, y, resting);
  cave.markScanned(x, y);
  ctx.emit({ type: 'land', x, y, tile: resting });
}
