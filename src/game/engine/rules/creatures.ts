import type { SimContext } from '../simTypes';
import {
  DIR_DX,
  DIR_DY,
  Tile,
  butterflyFacing,
  creatureDirection,
  fireflyFacing,
  isButterfly,
  isCreature,
  turnLeft,
  turnRight,
  type Direction,
  type TileId,
} from '../tiles';
import { detonate } from './explosions';

/**
 * Fireflies and butterflies.
 *
 * Both hug walls, in mirrored directions: a firefly keeps its left hand on
 * the wall, a butterfly its right. That single difference is what makes
 * fireflies patrol clockwise around an obstacle and butterflies
 * counter-clockwise, and it is the whole of their "AI".
 *
 * Either one detonates the instant it finds itself orthogonally adjacent to
 * the player or to the amoeba — the classic way a butterfly nest is cashed in
 * for a pile of diamonds.
 */
export function updateCreatures(ctx: SimContext): void {
  const { cave } = ctx;

  for (let y = 0; y < cave.height; y += 1) {
    for (let x = 0; x < cave.width; x += 1) {
      const tile = cave.get(x, y);
      if (!isCreature(tile)) continue;
      if (cave.isScanned(x, y)) continue;

      if (touchesTrigger(ctx, x, y)) {
        detonate(ctx, x, y, isButterfly(tile));
        continue;
      }

      patrol(ctx, x, y, tile);
    }
  }
}

/** True when the player or the amoeba is orthogonally adjacent. */
function touchesTrigger(ctx: SimContext, x: number, y: number): boolean {
  const { cave } = ctx;
  for (let dir = 0; dir < 4; dir += 1) {
    const neighbour = cave.get(x + DIR_DX[dir], y + DIR_DY[dir]);
    if (neighbour === Tile.Player || neighbour === Tile.PlayerBirth) return true;
    if (neighbour === Tile.Amoeba) return true;
  }
  return false;
}

function patrol(ctx: SimContext, x: number, y: number, tile: TileId): void {
  const { cave } = ctx;
  const butterfly = isButterfly(tile);
  const dir = creatureDirection(tile);

  // Butterflies prefer their right hand, fireflies their left.
  const preferred = butterfly ? turnRight(dir) : turnLeft(dir);
  const facing = butterfly ? butterflyFacing : fireflyFacing;

  if (isOpen(ctx, x + DIR_DX[preferred], y + DIR_DY[preferred])) {
    cave.move(x, y, x + DIR_DX[preferred], y + DIR_DY[preferred], facing(preferred));
    return;
  }

  if (isOpen(ctx, x + DIR_DX[dir], y + DIR_DY[dir])) {
    cave.move(x, y, x + DIR_DX[dir], y + DIR_DY[dir], facing(dir));
    return;
  }

  // Boxed in on both fronts: turn away on the spot and try again next scan.
  const away: Direction = butterfly ? turnLeft(dir) : turnRight(dir);
  cave.set(x, y, facing(away));
  cave.markScanned(x, y);
}

/** Creatures only ever travel through genuinely empty space. */
function isOpen(ctx: SimContext, x: number, y: number): boolean {
  return ctx.cave.get(x, y) === Tile.Empty;
}
