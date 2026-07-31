import Phaser from 'phaser';

import {
  BIRTH_TICKS,
  CAVE_HEIGHT,
  CAVE_WIDTH,
  DEFAULT_PALETTE_ID,
  Depth,
  EXPLOSION_STAGES,
  PALETTES,
  TILE_SIZE,
  type CavePalette,
} from '../../config';
import { layout } from '../../layout';
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
  clamp,
  interpolate,
  tileCentre,
  tileVariant,
  visibleTiles,
} from './renderMath';

/** The visible cave size right now, which changes when the window does. */
function viewport(): { widthTiles: number; heightTiles: number } {
  const { tilesW, tilesH } = layout();
  return { widthTiles: tilesW, heightTiles: tilesH };
}

/**
 * How fast each parallax sheet tracks the camera. Zero would pin a layer to
 * the screen, one would nail it to the cave; the gap between the two figures
 * is the illusion of distance.
 */
const PARALLAX_FAR = 0.22;
const PARALLAX_NEAR = 0.48;

/** Contact-shadow strength per tile. Anything absent casts no shadow. */
const SHADOW_ALPHA: Readonly<Record<number, number>> = {
  [Tile.Boulder]: 0.85,
  [Tile.BoulderFalling]: 0.5,
  [Tile.Diamond]: 0.5,
  [Tile.DiamondFalling]: 0.32,
  [Tile.Player]: 0.6,
  [Tile.FireflyUp]: 0.35,
  [Tile.FireflyRight]: 0.35,
  [Tile.FireflyDown]: 0.35,
  [Tile.FireflyLeft]: 0.35,
  [Tile.ButterflyUp]: 0.35,
  [Tile.ButterflyRight]: 0.35,
  [Tile.ButterflyDown]: 0.35,
  [Tile.ButterflyLeft]: 0.35,
};

/** Self-lit tiles, and the colour and radius (in cells) of the bloom they cast. */
const BLOOM: Readonly<Record<number, { tint: number; radius: number; alpha: number }>> = {
  [Tile.Diamond]: { tint: 0x9df0ff, radius: 0.95, alpha: 0.5 },
  [Tile.DiamondFalling]: { tint: 0xc8faff, radius: 1.1, alpha: 0.6 },
  [Tile.ExitOpen]: { tint: 0x9dffd8, radius: 1.5, alpha: 0.75 },
  [Tile.PlayerBirth]: { tint: 0xfff6c2, radius: 1.4, alpha: 0.8 },
  [Tile.ExplosionEmpty]: { tint: 0xffc86a, radius: 1.3, alpha: 0.7 },
  [Tile.ExplosionDiamond]: { tint: 0xffe9a0, radius: 1.4, alpha: 0.75 },
};

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
 * Three pools of sprites are drawn per frame -- contact shadows under the
 * tiles, the tiles themselves, and additive blooms over the self-lit ones --
 * each sized to the visible window rather than the whole cave, so scrolling
 * costs nothing extra however big the cave gets.
 */
export class WorldRenderer {
  private readonly scene: Phaser.Scene;
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private readonly shadows: Phaser.GameObjects.Image[] = [];
  private readonly blooms: Phaser.GameObjects.Image[] = [];

  private backdrop: Phaser.GameObjects.TileSprite | null = null;
  private strataFar: Phaser.GameObjects.TileSprite | null = null;
  private strataNear: Phaser.GameObjects.TileSprite | null = null;

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
  }

  /** Point the renderer at a new cave: swap palette, rebuild sky, reset the camera. */
  setCave(spec: CaveSpec, cave: Cave): void {
    this.paletteId = PALETTES[spec.paletteId] ? spec.paletteId : DEFAULT_PALETTE_ID;
    this.palette = PALETTES[this.paletteId];

    this.buildSky();

    this.facing = 1;
    this.walkPhase = 0;
    this.lastPlayerX = -1;

    const spawn = cave.findFirst((t) => t === Tile.Player || t === Tile.PlayerBirth);
    const camera = this.scene.cameras.main;
    camera.setBounds(0, 0, CAVE_WIDTH * TILE_SIZE, CAVE_HEIGHT * TILE_SIZE);
    const start = cameraTarget(
      spawn?.x ?? 0,
      spawn?.y ?? 0,
      cave.width,
      cave.height,
      -1e9,
      -1e9,
      viewport(),
    );
    camera.setScroll(start.x, start.y);
  }

  get activePalette(): CavePalette {
    return this.palette;
  }

  /** Resize the screen-locked parallax sheets after the window changed shape. */
  resize(): void {
    if (this.strataFar) this.buildSky();
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
    this.drawSky(camera);

    const range = visibleTiles(camera.scrollX, camera.scrollY, cave.width, cave.height, viewport());
    let used = 0;
    let shadowsUsed = 0;
    let bloomsUsed = 0;

    for (let y = range.minY; y <= range.maxY; y += 1) {
      for (let x = range.minX; x <= range.maxX; x += 1) {
        const tile = cave.get(x, y);
        if (tile === Tile.Empty) continue;

        const sprite = this.take(this.pool, used, TextureKey.spark, Depth.Tiles);
        used += 1;

        const key = this.textureFor(tile, x, y, cave, runtime);
        if (sprite.texture.key !== key) sprite.setTexture(key);

        const arrival = this.arrivals.get(cave.index(x, y));
        let drawX: number;
        let drawY: number;
        if (arrival) {
          drawX = interpolate(arrival.fromX, arrival.toX, alpha) + TILE_SIZE / 2;
          drawY = interpolate(arrival.fromY, arrival.toY, alpha) + TILE_SIZE / 2;
        } else {
          drawX = tileCentre(x);
          drawY = tileCentre(y);
        }
        sprite.setPosition(drawX, drawY);

        this.style(sprite, tile, runtime, x, arrival, alpha);
        sprite.setVisible(true);

        if (tile === Tile.Player || tile === Tile.PlayerBirth) {
          this.playerScreenX = drawX;
          this.playerScreenY = drawY;
        }

        const shadow = SHADOW_ALPHA[tile];
        if (shadow !== undefined) {
          const image = this.take(this.shadows, shadowsUsed, TextureKey.shadow, Depth.Shadow);
          shadowsUsed += 1;
          // Offset down and right, away from the key light every sprite shares.
          image.setPosition(drawX + TILE_SIZE * 0.06, drawY + TILE_SIZE * 0.1);
          image.setAlpha(shadow);
          image.setScale(1);
          image.setVisible(true);
        }

        const bloom = BLOOM[tile];
        if (bloom !== undefined) {
          const image = this.take(this.blooms, bloomsUsed, TextureKey.glow, Depth.Entities);
          bloomsUsed += 1;
          // The glow art fills its texture, so a bloom of radius R cells has
          // to be drawn 2R cells across.
          const pulse = 1 + Math.sin(runtime.ticks * 0.9 + x * 1.7 + y) * 0.08;
          image.setPosition(drawX, drawY);
          image.setTint(bloom.tint);
          image.setBlendMode(Phaser.BlendModes.ADD);
          image.setAlpha(bloom.alpha);
          image.setDisplaySize(
            bloom.radius * 2 * TILE_SIZE * pulse,
            bloom.radius * 2 * TILE_SIZE * pulse,
          );
          image.setVisible(true);
        }
      }
    }

    hideFrom(this.pool, used);
    hideFrom(this.shadows, shadowsUsed);
    hideFrom(this.blooms, bloomsUsed);
  }

  destroy(): void {
    for (const list of [this.pool, this.shadows, this.blooms]) {
      for (const sprite of list) sprite.destroy();
      list.length = 0;
    }
    this.backdrop?.destroy();
    this.strataFar?.destroy();
    this.strataNear?.destroy();
    this.backdrop = null;
    this.strataFar = null;
    this.strataNear = null;
  }

  /* ---------------------------------------------------------------- */

  /**
   * Build the three layers behind the cave: an opaque sheet of folded strata
   * far away, silhouetted stalactites nearer, and a world-locked grain over
   * both that ties the parallax to the cave and knocks it back so it never
   * competes with a boulder for attention.
   */
  private buildSky(): void {
    this.backdrop?.destroy();
    this.strataFar?.destroy();
    this.strataNear?.destroy();

    const { width, worldHeight } = layout();
    const make = (key: string, depth: number, alpha: number) =>
      this.scene.add
        .tileSprite(0, 0, width, worldHeight, key)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setAlpha(alpha)
        .setDepth(depth);

    this.strataFar = make(TextureKey.strataFar(this.paletteId), Depth.BackdropFar, 1);
    this.strataNear = make(TextureKey.strataNear(this.paletteId), Depth.BackdropNear, 0.7);

    this.backdrop = this.scene.add
      .tileSprite(
        0,
        0,
        CAVE_WIDTH * TILE_SIZE,
        CAVE_HEIGHT * TILE_SIZE,
        TextureKey.backdrop(this.paletteId),
      )
      .setOrigin(0, 0)
      .setAlpha(0.55)
      .setDepth(Depth.Background);
  }

  /** Slide the parallax sheets a fraction of the camera's travel. */
  private drawSky(camera: Phaser.Cameras.Scene2D.Camera): void {
    // The sheets are screen-locked, so they are scrolled by moving the texture
    // under them rather than by moving the object.
    if (this.strataFar) {
      this.strataFar.tilePositionX = camera.scrollX * PARALLAX_FAR;
      this.strataFar.tilePositionY = camera.scrollY * PARALLAX_FAR;
    }
    if (this.strataNear) {
      this.strataNear.tilePositionX = camera.scrollX * PARALLAX_NEAR;
      this.strataNear.tilePositionY = camera.scrollY * PARALLAX_NEAR * 0.7;
    }
  }

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

    const target = cameraTarget(
      px,
      py,
      cave.width,
      cave.height,
      camera.scrollX,
      camera.scrollY,
      viewport(),
    );
    camera.setScroll(
      approachCamera(camera.scrollX, target.x, deltaMs),
      approachCamera(camera.scrollY, target.y, deltaMs),
    );
  }

  /**
   * Fetch a sprite from a pool, growing it on demand. Every sprite is centred
   * on its cell so rotation, flipping and squash all pivot where they should.
   */
  private take(
    pool: Phaser.GameObjects.Image[],
    index: number,
    key: string,
    depth: number,
  ): Phaser.GameObjects.Image {
    let sprite = pool[index];
    if (!sprite) {
      sprite = this.scene.add.image(0, 0, key).setOrigin(0.5, 0.5).setDepth(depth);
      pool[index] = sprite;
    }
    return sprite;
  }

  /** Per-tile flourishes that are cheaper as sprite state than as textures. */
  private style(
    sprite: Phaser.GameObjects.Image,
    tile: TileId,
    runtime: CaveRuntime,
    x: number,
    arrival: TileMove | undefined,
    alpha: number,
  ): void {
    sprite.setAlpha(1);
    sprite.setScale(1);
    sprite.setFlipX(false);
    sprite.setRotation(0);
    sprite.setDepth(Depth.Tiles);
    sprite.setBlendMode(Phaser.BlendModes.NORMAL);

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
        sprite.setBlendMode(Phaser.BlendModes.ADD);
        break;

      case Tile.Boulder:
      case Tile.BoulderFalling:
        sprite.setDepth(tile === Tile.BoulderFalling ? Depth.Entities : Depth.Tiles);
        sprite.setRotation(this.boulderSpin(x, arrival, alpha));
        break;

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

  /**
   * How far a boulder has rolled, in radians.
   *
   * Rotation is derived from the boulder's column rather than tracked per
   * rock: a quarter turn per cell means a resting boulder and a rolling one
   * agree at every cell boundary, so a rock that stops mid-roll settles
   * instead of snapping back upright. It also means two boulders side by side
   * never sit at the same angle, which breaks up a wall of them.
   */
  private boulderSpin(x: number, arrival: TileMove | undefined, alpha: number): number {
    const quarter = Math.PI / 2;
    if (!arrival || arrival.fromX === arrival.toX) return x * quarter;
    return (arrival.fromX + (arrival.toX - arrival.fromX) * clamp(alpha, 0, 1)) * quarter;
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
        // `birthTicks` counts down, so invert it to hatch forwards.
        return TextureKey.birth(
          stageFrame(BIRTH_TICKS - runtime.birthTicks, BIRTH_TICKS, BIRTH_FRAMES),
        );

      case Tile.ExitClosed:
        return TextureKey.exitClosed(this.paletteId);
      case Tile.ExitOpen:
        return TextureKey.exitOpen(animFrame(ticks, EXIT_FRAMES));

      case Tile.ExplosionEmpty:
      case Tile.ExplosionDiamond:
        // `stage` counts down, so invert it to run the burst forwards.
        return TextureKey.boom(
          stageFrame(EXPLOSION_STAGES - cave.getStage(x, y), EXPLOSION_STAGES - 1, BOOM_FRAMES),
        );

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

/**
 * Map "how far through a countdown are we" onto an animation frame, so the
 * number of frames an effect is drawn with is free to change without the
 * simulation's tick budget having to match it.
 */
function stageFrame(elapsed: number, span: number, frames: number): number {
  if (span <= 0) return 0;
  const t = clamp(elapsed / span, 0, 1);
  return clamp(Math.round(t * (frames - 1)), 0, frames - 1);
}

function hideFrom(pool: readonly Phaser.GameObjects.Image[], from: number): void {
  for (let i = from; i < pool.length; i += 1) pool[i].setVisible(false);
}
