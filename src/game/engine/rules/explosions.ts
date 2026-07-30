import { EXPLOSION_STAGES } from '../../../config';
import {
  Tile,
  isBlastProof,
  isButterfly,
  isExplosion,
  isFirefly,
  type TileId,
} from '../tiles';
import type { SimContext } from '../simTypes';

/** Guard against pathological chain reactions in very dense caves. */
const MAX_CHAIN_BLASTS = 512;

interface Blast {
  readonly x: number;
  readonly y: number;
  readonly intoDiamonds: boolean;
}

/**
 * Blow a 3x3 hole centred on (x, y).
 *
 * Steel, magic walls and the exit shrug it off. Butterflies caught in the
 * blast detonate in turn and leave diamonds behind, which is what makes
 * chain-detonating a butterfly nest the signature scoring play.
 */
export function detonate(ctx: SimContext, x: number, y: number, intoDiamonds: boolean): void {
  const { cave } = ctx;
  const queue: Blast[] = [{ x, y, intoDiamonds }];
  const done = new Set<number>();

  while (queue.length > 0 && done.size < MAX_CHAIN_BLASTS) {
    const blast = queue.shift() as Blast;
    const centreKey = blast.y * cave.width + blast.x;
    if (done.has(centreKey)) continue;
    done.add(centreKey);

    ctx.emit({ type: 'explode', x: blast.x, y: blast.y, intoDiamonds: blast.intoDiamonds });

    const product: TileId = blast.intoDiamonds ? Tile.ExplosionDiamond : Tile.ExplosionEmpty;

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const cx = blast.x + dx;
        const cy = blast.y + dy;
        if (!cave.inBounds(cx, cy)) continue;

        const tile = cave.get(cx, cy);
        if (isBlastProof(tile)) continue;

        if (tile === Tile.Player || tile === Tile.PlayerBirth) {
          reportPlayerDeath(ctx, cx, cy);
        } else if (isButterfly(tile)) {
          queue.push({ x: cx, y: cy, intoDiamonds: true });
        } else if (isFirefly(tile)) {
          queue.push({ x: cx, y: cy, intoDiamonds: false });
        }

        cave.set(cx, cy, product, EXPLOSION_STAGES);
        cave.markScanned(cx, cy);
      }
    }
  }
}

/** Detonate whatever creature sits at (x, y), choosing the right debris. */
export function detonateCreature(ctx: SimContext, x: number, y: number): void {
  detonate(ctx, x, y, isButterfly(ctx.cave.get(x, y)));
}

/**
 * Kill the player where they stand. The cave keeps simulating for a short
 * hold so the blast is visible before the life is deducted.
 */
export function killPlayer(ctx: SimContext, x: number, y: number): void {
  detonate(ctx, x, y, false);
}

/** Record the death without triggering another blast (called from within one). */
export function reportPlayerDeath(ctx: SimContext, x: number, y: number): void {
  const { runtime } = ctx;
  if (!runtime.playerAlive && runtime.deathHold > 0) return;
  runtime.playerAlive = false;
  ctx.emit({ type: 'playerDied', x, y });
}

/**
 * Age every explosion cell by one scan, resolving finished ones to empty
 * space or to the diamonds a butterfly left behind.
 */
export function advanceExplosions(ctx: SimContext): void {
  const { cave } = ctx;

  for (let y = 0; y < cave.height; y += 1) {
    for (let x = 0; x < cave.width; x += 1) {
      const tile = cave.get(x, y);
      if (!isExplosion(tile)) continue;
      if (cave.isScanned(x, y)) continue;

      const remaining = cave.getStage(x, y) - 1;
      if (remaining > 0) {
        cave.setStage(x, y, remaining);
        cave.markScanned(x, y);
        continue;
      }

      cave.set(x, y, tile === Tile.ExplosionDiamond ? Tile.Diamond : Tile.Empty);
      cave.markScanned(x, y);
    }
  }
}
