import Phaser from 'phaser';

import {
  CAVE_HEIGHT,
  CAVE_WIDTH,
  DEFAULT_PALETTE_ID,
  Depth,
  PALETTES,
  TILE_SIZE,
  type CavePalette,
} from '../../config';
import type { Cave, TileMove } from '../engine/Cave';
import { Tile, type TileId } from '../engine/tiles';
import { MagicWallStatus, type CaveRuntime } from '../engine/simTypes';
import type { CaveSpec } from '../levels/caveFormat';
import {
  DIAMOND_FRAMES,
  DIRT_VARIANTS,
  TextureKey,
  AMOEBA_FRAMES,
  BIRTH_FRAMES,
  BOOM_FRAMES,
  CREATURE_FRAMES,
  EXIT_FRAMES,
  MAGIC_FRAMES,
  PLAYER_IDLE_FRAMES,
  PLAYER_RUN_FRAMES,
  SLIME_FRAMES,
} from './TextureFactory';
import {
  animFrame,
  approachCamera,
  cameraTarget,
  interpolate,
  tileToPixel,
  tileVariant,
  visibleTiles,
} from './renderMath';

/**
 * Draws the cave.
 *
 * The simulation runs at 7-9 scans a second, which on its own looks
 * stroboscopic. Every scan the grid records the moves it made, and this class
 * replays them: a tile that arrived at a cell this scan is drawn part-way
 * between where it came from and where it landed, using the session's progress
 * toward the next scan. The result is 60fps motion over a chunky discrete
 * world.
 *
 * Sprites come from a pool sized to the visible window rather than the whole
 * cave, so scrolling costs nothing extra.
 */
export class WorldRenderer {
  private readonly scene: Phaser.Scene;
  private readonly layer: Phaser.GameObjects.Container;
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private backdrop: Phaser.GameObjects.TileSprite | null = null;

  private palette: CavePalette = PALETTES[DEFAULT_PALETTE_ID];
  private paletteId = DEFAULT_PALETTE_ID;

  /** Cells that received a moving tile this scan, keyed by destination. */
  private readonly arrivals = new Map<number, TileMove>();

  /** Which way the player last moved, so the run cycle faces the right way. */
  private facing = 1;
  private walkPhase = 0;
  private lastPlayerX = -1;

  /** Screen-space position of the player, for the lighting layer to follow. */
  playerScreenX = 0;
  playerScreenY = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.layer = scene.add.container(0, 0);
    this.layer.setDepth(Depth.Tiles);
  }

  /** Point the renderer at a new cave: swap palette and reset the camera. */
  setCave(spec: CaveSpec, cave: Cave): void {
    this.paletteId = PALETTES[spec.paletteId] ? spec.paletteId : DEFAULT_PALETTE_ID;
    this.palette = PALETTES[this.paletteId];

    this.backdrop?.destroy();
    this.backdrop = this.scene.add
      .tileSprite(0, 0, CAVE_WIDTH * TILE_SIZE, CAVE_HEIGHT * TILE_SIZE, TextureKey.backdrop(this.paletteId))
      .setOrigin(0, 0)
      .setDepth(Depth.Background);

    this.facing = 1;
    this.walkPhase = 0;
    this.lastPlayerX = -1;

    const camera = this.scene.cameras.main;
    camera.setBounds(0, 0, CAVE_WIDTH * TILE_SIZE, CAVE_HEIGHT * TILE_SIZE);
    const start = cameraTarget(
      cave.findFirst((t) => t === Tile.Player || t === Tile.PlayerBirth)?.x ?? 0,
      cave.findFirst((t) => t === Tile.Player || t === Tile.PlayerBirth)?.y ?? 0,
      cave.width,
      cave.height,
      -1e9,
      -1e9,
    );
    camera.setScroll(start.x, start.y);
  }

  get activePalette(): CavePalette {
    return this.palette;
  }

  /**
   * Redraw one frame.
   *
   * @param alpha progress toward the next simulation scan, 0..1
   */
  draw(cave: Cave, runtime: CaveRuntime, alpha: number, deltaMs: number): void {
    this.indexArrivals(cave);
    this.moveCamera(cave, runtime, alpha, deltaMs);

    const camera = this.scene.cameras.main;
    const range = visibleTiles(camera.scrollX, camera.scrollY, cave.width, cave.height);
    let used = 0;

    for (let y = range.minY; y <= range.maxY; y += 1) {
      for (let x = range.minX; x <= range.maxX; x += 1) {
        const tile = cave.get(x, y);
        if (tile === Tile.Empty) continue;

        const sprite = this.take(used);
        used += 1;

        const key = this.textureFor(tile, x, y, cave, runtime);
        if (sprite.texture.key !== key) sprite.setTexture(key);

        const arrival = this.arrivals.get(cave.index(x, y));
        if (arrival) {
          sprite.setPosition(
            interpolate(arrival.fromX, arrival.toX, alpha),
            interpolate(arrival.fromY, arrival.toY, alpha),
          );
        } else {
          sprite.setPosition(tileToPixel(x), tileToPixel(y));
        }

        this.style(sprite, tile, runtime);
        sprite.setVisible(true);

        if (tile === Tile.Player || tile === Tile.PlayerBirth) {
          this.playerScreenX = sprite.x + TILE_SIZE / 2;
          this.playerScreenY = sprite.y + TILE_SIZE / 2;
        }
      }
    }

    for (let i = used; i < this.pool.length; i += 1) this.pool[i].setVisible(false);
  }

  destroy(): void {
    for (const sprite of this.pool) sprite.destroy();
    this.pool.length = 0;
    this.backdrop?.destroy();
    this.backdrop = null;
    this.layer.destroy();
  }

  /* ---------------------------------------------------------------- */

  private indexArrivals(cave: Cave): void {
    this.arrivals.clear();
    for (const move of cave.moves) {
      this.arrivals.set(cave.index(move.toX, move.toY), move);
      if (move.tile === Tile.Player && move.toX !== move.fromX) {
        this.facing = move.toX > move.fromX ? 1 : -1;
      }
    }
  }

  private moveCamera(cave: Cave, runtime: CaveRuntime, alpha: number, deltaMs: number): void {
    const camera = this.scene.cameras.main;

    // Follow where the player is heading, not where they were, so the view
    // leads the movement instead of lagging a whole scan behind it.
    let px = runtime.playerX;
    let py = runtime.playerY;
    const arrival = this.arrivals.get(cave.index(runtime.playerX, runtime.playerY));
    if (arrival && arrival.tile === Tile.Player) {
      px = arrival.fromX + (arrival.toX - arrival.fromX) * alpha;
      py = arrival.fromY + (arrival.toY - arrival.fromY) * alpha;
    }

    const target = cameraTarget(px, py, cave.width, cave.height, camera.scrollX, camera.scrollY);
    camera.setScroll(
      approachCamera(camera.scrollX, target.x, deltaMs),
      approachCamera(camera.scrollY, target.y, deltaMs),
    );
  }

  private take(index: number): Phaser.GameObjects.Image {
    let sprite = this.pool[index];
    if (!sprite) {
      sprite = this.scene.add.image(0, 0, TextureKey.spark).setOrigin(0, 0).setDepth(Depth.Tiles);
      this.pool[index] = sprite;
    }
    return sprite;
  }

  /** Per-tile flourishes that are cheaper as sprite state than as textures. */
  private style(sprite: Phaser.GameObjects.Image, tile: TileId, runtime: CaveRuntime): void {
    sprite.setAlpha(1);
    sprite.setScale(1);
    sprite.setFlipX(false);
    sprite.setDepth(Depth.Tiles);

    switch (tile) {
      case Tile.Player:
      case Tile.PlayerBirth:
        sprite.setFlipX(this.facing < 0);
        sprite.setDepth(Depth.Entities);
        break;
      case Tile.FireflyUp:
      case Tile.FireflyRight:
      case Tile.FireflyDown:
      case Tile.FireflyLeft:
      case Tile.ButterflyUp:
      case Tile.ButterflyRight:
      case Tile.ButterflyDown:
      case Tile.ButterflyLeft:
        sprite.setDepth(Depth.Entities);
        break;
      case Tile.ExplosionEmpty:
      case Tile.ExplosionDiamond:
        sprite.setDepth(Depth.Particles);
        break;
      case Tile.BoulderFalling:
      case Tile.DiamondFalling:
        sprite.setDepth(Depth.Entities);
        break;
      case Tile.Amoeba:
        // Pulse a little faster once it has turned aggressive.
        sprite.setAlpha(runtime.amoebaCanGrow ? 1 : 0.85);
        break;
      default:
        break;
    }
  }

  private textureFor(tile: TileId, x: number, y: number, cave: Cave, runtime: CaveRuntime): string {
    const ticks = runtime.ticks;
    const offset = x * 3 + y * 5;

    switch (tile) {
      case Tile.Dirt:
        return TextureKey.dirt(this.paletteId, tileVariant(x, y, DIRT_VARIANTS));
      case Tile.Wall:
        return TextureKey.wall(this.paletteId);
      case Tile.Steel:
        return TextureKey.steel(this.paletteId);
      case Tile.Boulder:
      case Tile.BoulderFalling:
        return TextureKey.boulder(this.paletteId);
      case Tile.Diamond:
      case Tile.DiamondFalling:
        return TextureKey.diamond(animFrame(ticks, DIAMOND_FRAMES, offset));

      case Tile.MagicWall:
        if (runtime.magicWallStatus === MagicWallStatus.Active) {
          return TextureKey.magicWallActive(animFrame(ticks, MAGIC_FRAMES, offset));
        }
        return runtime.magicWallStatus === MagicWallStatus.Expired
          ? TextureKey.magicWallSpent(this.paletteId)
          : TextureKey.magicWallIdle(this.paletteId);

      case Tile.ExpandingWallH:
        return TextureKey.expandingWall(this.paletteId, 'h');
      case Tile.ExpandingWallV:
        return TextureKey.expandingWall(this.paletteId, 'v');
      case Tile.ExpandingWallAny:
        return TextureKey.expandingWall(this.paletteId, 'any');

      case Tile.Slime:
        return TextureKey.slime(animFrame(ticks, SLIME_FRAMES, offset));
      case Tile.Amoeba:
        return TextureKey.amoeba(animFrame(ticks, AMOEBA_FRAMES, offset));

      case Tile.FireflyUp:
      case Tile.FireflyRight:
      case Tile.FireflyDown:
      case Tile.FireflyLeft:
        return TextureKey.firefly(animFrame(ticks, CREATURE_FRAMES, offset));
      case Tile.ButterflyUp:
      case Tile.ButterflyRight:
      case Tile.ButterflyDown:
      case Tile.ButterflyLeft:
        return TextureKey.butterfly(animFrame(ticks, CREATURE_FRAMES, offset));

      case Tile.Player:
        return this.playerTexture(x, ticks);
      case Tile.PlayerBirth:
        return TextureKey.birth(
          Math.min(BIRTH_FRAMES - 1, Math.floor(cave.getStage(x, y) / 2) % BIRTH_FRAMES),
        );

      case Tile.ExitClosed:
        return TextureKey.exitClosed(this.paletteId);
      case Tile.ExitOpen:
        return TextureKey.exitOpen(animFrame(ticks, EXIT_FRAMES));

      case Tile.ExplosionEmpty:
      case Tile.ExplosionDiamond: {
        // `stage` counts down, so invert it to run the burst forwards.
        const stage = cave.getStage(x, y);
        return TextureKey.boom(Math.min(BOOM_FRAMES - 1, Math.max(0, BOOM_FRAMES - stage)));
      }

      default:
        return TextureKey.spark;
    }
  }

  /** Idle when standing still, a run cycle while actually moving. */
  private playerTexture(x: number, ticks: number): string {
    if (x !== this.lastPlayerX) {
      this.walkPhase += 1;
      this.lastPlayerX = x;
      return TextureKey.playerRun(this.walkPhase % PLAYER_RUN_FRAMES);
    }
    return TextureKey.playerIdle(animFrame(Math.floor(ticks / 2), PLAYER_IDLE_FRAMES));
  }
}
