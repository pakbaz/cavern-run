import Phaser from 'phaser';

import { Depth, GAME_WIDTH, HUD_HEIGHT, GAME_HEIGHT, TILE_SIZE, type CavePalette } from '../../config';
import type { Cave } from '../engine/Cave';
import { Tile } from '../engine/tiles';
import { TextureKey } from './TextureFactory';
import { clamp, glowTransform, mixColor, smoothstep, visibleTiles } from './renderMath';

const VIEW_W = GAME_WIDTH;
const VIEW_H = GAME_HEIGHT - HUD_HEIGHT;

/** Side length of the generated glow texture, in pixels. */
const GLOW_TEXTURE_SIZE = 32;

/**
 * The helmet lamp.
 *
 * A full-viewport sheet of darkness is drawn over the cave each frame, then
 * punched through with soft glows: a big one around the miner, small ones on
 * every diamond and live explosion in view. Caves get progressively darker
 * through the campaign, so the lamp matters more the deeper you go.
 */
export class LightingLayer {
  private readonly scene: Phaser.Scene;
  private readonly darkness: Phaser.GameObjects.RenderTexture;
  private readonly vignette: Phaser.GameObjects.Graphics;

  /** 0 = cave fully lit, 1 = only the lamp is visible. */
  private strength = 0.5;
  private tint = 0x040814;
  private enabled = true;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.darkness = scene.add
      .renderTexture(0, 0, VIEW_W, VIEW_H)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(Depth.Lighting);

    // Phaser 4 buffers draw commands instead of executing them immediately, so
    // the sheet is rebuilt and flushed once per frame at the end of `draw()`.
    this.darkness.setRenderMode('render');

    this.vignette = scene.add.graphics().setScrollFactor(0).setDepth(Depth.Vignette);
    this.drawVignette();
  }

  /** Match the lamp to the cave: deeper palettes are darker and cooler. */
  setPalette(palette: CavePalette, caveIndex: number, caveCount: number): void {
    const depth = caveCount <= 1 ? 0 : caveIndex / (caveCount - 1);
    // Strong enough that the lamp is genuinely the thing you see by, without
    // ever hiding a boulder about to land on you.
    this.strength = 0.58 + depth * 0.28;
    this.tint = mixColor(palette.background, 0x000000, 0.55);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.darkness.setVisible(enabled);
    this.vignette.setVisible(enabled);
  }

  draw(cave: Cave, playerScreenX: number, playerScreenY: number, ticks: number): void {
    if (!this.enabled) return;

    const camera = this.scene.cameras.main;
    this.darkness.clear();
    this.darkness.fill(this.tint, this.strength);

    // The lamp flickers very slightly so it reads as a real light source.
    const flicker = 1 + Math.sin(ticks * 0.9) * 0.03 + Math.sin(ticks * 2.7) * 0.015;
    this.punch(playerScreenX - camera.scrollX, playerScreenY - camera.scrollY, 4.4 * flicker);

    const range = visibleTiles(camera.scrollX, camera.scrollY, cave.width, cave.height);
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
  }

  destroy(): void {
    this.darkness.destroy();
    this.vignette.destroy();
  }

  /** Erase a soft circle from the darkness sheet, centred on (x, y). */
  private punch(x: number, y: number, radiusTiles: number): void {
    const { scale, reach } = glowTransform(radiusTiles, GLOW_TEXTURE_SIZE, TILE_SIZE);

    // Cull by the light's own reach: a big lamp whose centre is just off the
    // viewport still lights part of it.
    if (x < -reach || y < -reach || x > VIEW_W + reach || y > VIEW_H + reach) return;

    // `erase` has no scale parameter -- it always blits the texture at native
    // size -- so the lamp is stamped instead, which can scale and can centre
    // itself on the light rather than hanging off its top-left corner.
    this.darkness.stamp(TextureKey.glow, undefined, x, y, {
      scale,
      originX: 0.5,
      originY: 0.5,
      blendMode: Phaser.BlendModes.ERASE,
    });
  }

  private drawVignette(): void {
    // Concentric rounded frames, each a touch more opaque than the last.
    const steps = 14;
    for (let i = 0; i < steps; i += 1) {
      const t = i / steps;
      const inset = t * Math.min(VIEW_W, VIEW_H) * 0.5;
      const alpha = smoothstep(0.45, 1, 1 - t) * 0.055;
      this.vignette.lineStyle(Math.max(2, (1 - t) * 12), 0x000000, alpha);
      this.vignette.strokeRect(inset, inset, VIEW_W - inset * 2, VIEW_H - inset * 2);
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

/** Clamp helper re-exported for scenes that dim the lamp during menus. */
export function lampStrength(value: number): number {
  return clamp(value, 0, 1);
}
