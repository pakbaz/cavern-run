import type { SimContext } from '../simTypes';
import { Tile, asFalling, isFallable, type TileId } from '../tiles';

/**
 * Expanding walls creep one cell per scan into adjacent empty space:
 * horizontally, vertically, or in all four directions depending on the
 * variant. They are the cheapest way to make a cave close in around you.
 */
export function updateExpandingWalls(ctx: SimContext): void {
  const { cave } = ctx;

  for (let y = 0; y < cave.height; y += 1) {
    for (let x = 0; x < cave.width; x += 1) {
      const tile = cave.get(x, y);
      if (
        tile !== Tile.ExpandingWallH &&
        tile !== Tile.ExpandingWallV &&
        tile !== Tile.ExpandingWallAny
      ) {
        continue;
      }
      if (cave.isScanned(x, y)) continue;

      const horizontal = tile === Tile.ExpandingWallH || tile === Tile.ExpandingWallAny;
      const vertical = tile === Tile.ExpandingWallV || tile === Tile.ExpandingWallAny;

      if (horizontal) {
        grow(ctx, x - 1, y, tile);
        grow(ctx, x + 1, y, tile);
      }
      if (vertical) {
        grow(ctx, x, y - 1, tile);
        grow(ctx, x, y + 1, tile);
      }
    }
  }
}

function grow(ctx: SimContext, x: number, y: number, tile: TileId): void {
  const { cave } = ctx;
  if (cave.get(x, y) !== Tile.Empty) return;
  cave.set(x, y, tile);
  cave.markScanned(x, y);
  ctx.emit({ type: 'expand', x, y });
}

/**
 * Handle an object resting on or falling into slime.
 *
 * Slime is porous: boulders and diamonds seep through it at a per-cave
 * probability and reappear underneath, while the player cannot pass at all.
 *
 * @returns true when the object passed through, false to let it sit there.
 */
export function trySlimePass(ctx: SimContext, x: number, y: number): boolean {
  const { cave, rng, tuning } = ctx;

  const tile = cave.get(x, y);
  if (!isFallable(tile)) return false;

  const outY = y + 2;
  if (cave.get(x, outY) !== Tile.Empty) return false;
  if (!rng.chance(tuning.slimePermeability)) return false;

  cave.set(x, y, Tile.Empty);
  cave.set(x, outY, asFalling(tile));
  cave.markScanned(x, outY);
  ctx.emit({ type: 'slime', x, y: outY });
  return true;
}
