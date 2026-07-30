import type { SimContext } from '../simTypes';
import { DIR_DX, DIR_DY, Tile, isSoft } from '../tiles';

/**
 * The amoeba.
 *
 * It creeps into dirt and empty space at random. Two things can stop it, and
 * both are the point of every amoeba cave:
 *
 *  - Wall it in completely and the whole colony crystallises into diamonds.
 *  - Let it outgrow its cap and it collapses into worthless boulders.
 *
 * It also starts slow and then turns aggressive once the slow-growth window
 * elapses, so there is always a clock on the decision.
 */
export function updateAmoeba(ctx: SimContext): void {
  const { cave, runtime, tuning, rng } = ctx;
  if (runtime.amoebaResolved) return;

  const cells: number[] = [];
  let canGrow = false;

  for (let y = 0; y < cave.height; y += 1) {
    for (let x = 0; x < cave.width; x += 1) {
      if (cave.get(x, y) !== Tile.Amoeba) continue;
      cells.push(y * cave.width + x);
      if (!canGrow && hasRoom(ctx, x, y)) canGrow = true;
    }
  }

  runtime.amoebaSize = cells.length;
  runtime.amoebaCanGrow = canGrow;

  if (cells.length === 0) {
    runtime.amoebaResolved = true;
    return;
  }

  if (!canGrow) {
    convertAll(ctx, Tile.Diamond);
    return;
  }

  if (cells.length >= tuning.amoebaMaxSize) {
    convertAll(ctx, Tile.Boulder);
    return;
  }

  const slowPhase = runtime.ticks < tuning.amoebaSlowGrowthTicks;
  const chance = slowPhase ? tuning.amoebaSlowGrowthChance : tuning.amoebaGrowthChance;

  // Growth targets come from a snapshot, so a cell created this scan cannot
  // itself grow until the next one.
  for (const index of cells) {
    if (!rng.chance(chance)) continue;

    const x = index % cave.width;
    const y = Math.floor(index / cave.width);
    const start = rng.nextInt(4);

    for (let step = 0; step < 4; step += 1) {
      const dir = (start + step) % 4;
      const nx = x + DIR_DX[dir];
      const ny = y + DIR_DY[dir];
      if (!isSoft(cave.get(nx, ny))) continue;

      cave.set(nx, ny, Tile.Amoeba);
      cave.markScanned(nx, ny);
      runtime.amoebaSize += 1;
      ctx.emit({ type: 'amoebaGrow', x: nx, y: ny });
      break;
    }
  }
}

function hasRoom(ctx: SimContext, x: number, y: number): boolean {
  const { cave } = ctx;
  for (let dir = 0; dir < 4; dir += 1) {
    if (isSoft(cave.get(x + DIR_DX[dir], y + DIR_DY[dir]))) return true;
  }
  return false;
}

function convertAll(ctx: SimContext, into: typeof Tile.Diamond | typeof Tile.Boulder): void {
  const { cave, runtime } = ctx;
  cave.replaceAll((tile) => tile === Tile.Amoeba, into);
  runtime.amoebaResolved = true;
  runtime.amoebaSize = 0;
  runtime.amoebaCanGrow = false;
  ctx.emit({ type: 'amoebaResolved', into });
}
