import Phaser from 'phaser';

import { Depth, TILE_SIZE, type CavePalette } from '../../config';
import { layout } from '../../layout';
import type { Cave } from '../engine/Cave';
import { Tile } from '../engine/tiles';
import { TextureKey } from './TextureFactory';
import { clamp, glowTransform, lampCone, mixColor, smoothstep, visibleTiles } from './renderMath';

/** Radius of the miner's lamp, in cells, before the flicker is applied. */
const LAMP_RADIUS = 4.2;

/**
 * A second, much wider and much weaker punch centred on the miner.
 *
 * Without it a strong lamp leaves the rest of the cave as a flat black field,
 * and a boulder two cells outside the cone is invisible right up until it
 * lands on you. This keeps the whole room faintly readable while still making
 * the lamp the thing you see by.
 *
 * Its reach is measured against the shorter axis of the playfield rather than
 * being a fixed number of cells: the status bar and a landscape phone both eat
 * into how much cave is on screen, and a wash sized for a desktop would cover
 * a short viewport corner to corner and flatten the gloom back out again.
 */
const AMBIENT_RADIUS_MAX = 10;
const AMBIENT_RADIUS_MIN = 5;
const AMBIENT_VIEW_FRACTION = 0.8;
const AMBIENT_STRENGTH = 0.42;

/** Colour of the light the helmet lamp actually throws. */
const LAMP_WARM = 0xffd9a2;

/**
 * The helmet lamp.
 *
 * A full-viewport sheet of darkness is drawn over the cave each frame, then
 * punched through with soft glows: a cone around the miner that leads the way
 * they are facing, a wide faint wash so the room is never a black void, and
 * small ones on every diamond and live explosion in view. Over the top of the
 * sheet goes the light itself -- a warm additive pool that tints what the lamp
 * touches, which is what stops the effect reading as "a hole cut in a grey
 * rectangle". Caves get progressively darker through the campaign, so the lamp
 * matters more the deeper you go.
 */
export class LightingLayer {
  private readonly scene: Phaser.Scene;
  private readonly darkness: Phaser.GameObjects.RenderTexture;
  private readonly vignette: Phaser.GameObjects.Graphics;
  /** The warm pool the lamp throws, drawn over the darkness. */
  private readonly lamp: Phaser.GameObjects.Image;

  /** 0 = cave fully lit, 1 = only the lamp is visible. */
  private strength = 0.5;
  private tint = 0x040814;
  private enabled = true;

  /** Size of the darkness sheet, kept in step with the camera viewport. */
  private viewW: number;
  private viewH: number;
  /** Reach of the ambient wash, in cells, for the playfield as it is now. */
  private ambientRadius = AMBIENT_RADIUS_MAX;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.viewW = layout().width;
    this.viewH = layout().worldHeight;
    this.ambientRadius = ambientReach();

    this.darkness = scene.add
      .renderTexture(0, 0, cover(this.viewW), cover(this.viewH))
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(Depth.Lighting);

    // Phaser 4 buffers draw commands instead of executing them immediately, so
    // the sheet is rebuilt and flushed once per frame at the end of `draw()`.
    this.darkness.setRenderMode('render');

    this.lamp = scene.add
      .image(0, 0, TextureKey.glow)
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(LAMP_WARM)
      .setDepth(Depth.Lighting + 1)
      .setVisible(false);

    this.vignette = scene.add.graphics().setScrollFactor(0).setDepth(Depth.Vignette);
    this.drawVignette();
  }

  /** Match the lamp to the cave: deeper palettes are darker and cooler. */
  setPalette(palette: CavePalette, caveIndex: number, caveCount: number): void {
    const depth = caveCount <= 1 ? 0 : caveIndex / (caveCount - 1);
    // Strong enough that the lamp is genuinely the thing you see by. The wide
    // ambient punch is what keeps this honest: the sheet can be heavy because
    // the room around the miner is never actually black.
    this.strength = 0.68 + depth * 0.17;
    // Tinting toward the cave's own background rather than crushing to black
    // leaves the unlit rock legible as rock.
    this.tint = mixColor(palette.background, 0x000000, 0.38);
  }

  /**
   * Match the sheet to a new viewport after the window changed shape. The
   * texture is reallocated rather than scaled, so the lamp keeps its size in
   * cave cells instead of stretching with the window.
   */
  resize(): void {
    this.viewW = layout().width;
    this.viewH = layout().worldHeight;
    this.ambientRadius = ambientReach();
    // `resize` reallocates the underlying texture; `setSize` would only
    // stretch the existing one over the new area.
    this.darkness.resize(cover(this.viewW), cover(this.viewH));
    this.vignette.clear();
    this.drawVignette();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.darkness.setVisible(enabled);
    this.vignette.setVisible(enabled);
    this.lamp.setVisible(false);
  }

  /**
   * @param facing -1 or 1: which way the miner is looking, so the lamp leads
   * them rather than sitting on their boots.
   */
  draw(cave: Cave, playerScreenX: number, playerScreenY: number, ticks: number, facing = 1): void {
    if (!this.enabled) return;

    const camera = this.scene.cameras.main;
    this.darkness.clear();
    this.darkness.fill(this.tint, this.strength);

    const px = playerScreenX - camera.scrollX;
    const py = playerScreenY - camera.scrollY;

    // The lamp flickers very slightly so it reads as a real light source.
    const flicker = 1 + Math.sin(ticks * 0.9) * 0.04 + Math.sin(ticks * 2.7) * 0.02;
    const cone = lampCone(px, py, facing, LAMP_RADIUS * flicker, TILE_SIZE);

    // A wide, weak wash first: the room, not the lamp.
    this.punch(px, py, this.ambientRadius, AMBIENT_STRENGTH);
    this.punch(cone.x, cone.y, cone.radiusY, 1, cone.radiusX / cone.radiusY);

    const range = visibleTiles(camera.scrollX, camera.scrollY, cave.width, cave.height, {
      // The window decides how much cave is on screen, so a gem eighteen cells
      // to the right still has to light its own corner of a wide monitor. The
      // extents are exact rather than rounded up to whole cells; `visibleTiles`
      // adds its own margin, so a partly visible column is still covered.
      widthTiles: this.viewW / TILE_SIZE,
      heightTiles: this.viewH / TILE_SIZE,
    });
    for (let y = range.minY; y <= range.maxY; y += 1) {
      for (let x = range.minX; x <= range.maxX; x += 1) {
        const tile = cave.get(x, y);
        const radius = GLOW_RADIUS[tile];
        if (radius === undefined) continue;
        this.punch(
          x * TILE_SIZE + TILE_SIZE / 2 - camera.scrollX,
          y * TILE_SIZE + TILE_SIZE / 2 - camera.scrollY,
          radius,
        );
      }
    }

    // Execute the buffered clear/fill/erase commands for this frame.
    this.darkness.render();

    // The light itself, laid over the hole it just cut. Warm, weak, and the
    // same shape as the cone, so lit rock looks lit rather than merely
    // un-darkened.
    const { scale } = glowTransform(cone.radiusY, this.lamp.width, TILE_SIZE);
    this.lamp
      .setPosition(cone.x, cone.y)
      .setScale(scale * (cone.radiusX / cone.radiusY), scale)
      .setAlpha(0.13 * flicker * this.strength)
      .setVisible(true);
  }

  destroy(): void {
    this.darkness.destroy();
    this.lamp.destroy();
    this.vignette.destroy();
  }

  /**
   * Erase a soft circle from the darkness sheet, centred on (x, y).
   *
   * @param power 0..1 fraction of the darkness to lift. Anything below 1
   * leaves a veil behind, which is how the wide ambient wash reads as "dim"
   * rather than as a second, softer lamp.
   * @param stretch how much wider than tall the light is.
   */
  private punch(x: number, y: number, radiusTiles: number, power = 1, stretch = 1): void {
    const { scale, reach } = glowTransform(radiusTiles, this.lamp.width, TILE_SIZE);
    const reachX = reach * stretch;

    // Cull by the light's own reach: a big lamp whose centre is just off the
    // viewport still lights part of it.
    if (x < -reachX || y < -reach || x > this.viewW + reachX || y > this.viewH + reach) return;

    // `erase` has no scale parameter -- it always blits the texture at native
    // size -- so the lamp is stamped instead, which can scale and can centre
    // itself on the light rather than hanging off its top-left corner.
    this.darkness.stamp(TextureKey.glow, undefined, x, y, {
      scaleX: scale * stretch,
      scaleY: scale,
      alpha: clamp(power, 0, 1),
      originX: 0.5,
      originY: 0.5,
      blendMode: Phaser.BlendModes.ERASE,
    });
  }

  private drawVignette(): void {
    // Concentric rounded frames, each a touch more opaque than the last. Weak
    // per ring on purpose: fourteen of them stack into a soft corner falloff
    // rather than a drawn-on border.
    const steps = 16;
    for (let i = 0; i < steps; i += 1) {
      const t = i / steps;
      const inset = t * Math.min(this.viewW, this.viewH) * 0.55;
      const alpha = smoothstep(0.4, 1, 1 - t) * 0.085;
      this.vignette.lineStyle(Math.max(2, (1 - t) * 14), 0x01030a, alpha);
      this.vignette.strokeRect(inset, inset, this.viewW - inset * 2, this.viewH - inset * 2);
    }
  }
}

/**
 * Things that emit their own light, and the radius each one reaches in cells.
 * The glow on a diamond is what makes them findable in the dark lower caves.
 */
const GLOW_RADIUS: Readonly<Record<number, number>> = {
  [Tile.Diamond]: 1.3,
  [Tile.DiamondFalling]: 1.45,
  [Tile.ExitOpen]: 2.2,
  [Tile.ExplosionEmpty]: 2.0,
  [Tile.ExplosionDiamond]: 2.2,
  [Tile.Amoeba]: 0.85,
  [Tile.PlayerBirth]: 2.6,
};

/**
 * Round a viewport extent up to an even number of pixels.
 *
 * The canvas matches the window's aspect ratio, so the playfield is not a
 * whole number of cells and need not even be a whole number of pixels. Phaser
 * wants even-sized textures, and the darkness sheet has to cover the view
 * completely: a sheet a pixel short leaves a lit hairline down the edge of the
 * screen. Overhanging by a pixel costs nothing, because the sheet is pinned to
 * the camera and clipped by it.
 */
function cover(extent: number): number {
  return Math.ceil(Math.max(2, extent) / 2) * 2;
}

/**
 * How far the ambient wash should reach on the playfield as it stands.
 *
 * Measured against whichever axis has fewer cells on it, so the wash always
 * leaves the far corners of the view genuinely dark whatever shape the window
 * is and however much of it the status bar has taken.
 */
function ambientReach(): number {
  const { tilesW, tilesH } = layout();
  const shortAxis = Math.min(tilesW, tilesH);
  return clamp(shortAxis * AMBIENT_VIEW_FRACTION, AMBIENT_RADIUS_MIN, AMBIENT_RADIUS_MAX);
}

/** Clamp helper re-exported for scenes that dim the lamp during menus. */
export function lampStrength(value: number): number {
  return clamp(value, 0, 1);
}
