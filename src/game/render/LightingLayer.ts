import Phaser from 'phaser';

import { Depth, GAME_WIDTH, HUD_HEIGHT, GAME_HEIGHT, TILE_SIZE, type CavePalette } from '../../config';
import type { Cave } from '../engine/Cave';
import { Tile } from '../engine/tiles';
import { TextureKey } from './TextureFactory';
import { clamp, mixColor, smoothstep, visibleTiles } from './renderMath';

const VIEW_W = GAME_WIDTH;
const VIEW_H = GAME_HEIGHT - HUD_HEIGHT;

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

    this.vignette = scene.add.graphics().setScrollFactor(0).setDepth(Depth.Vignette);
    this.drawVignette();
  }

  /** Match the lamp to the cave: deeper palettes are darker and cooler. */
  setPalette(palette: CavePalette, caveIndex: number, caveCount: number): void {
    const depth = caveCount <= 1 ? 0 : caveIndex / (caveCount - 1);
    this.strength = 0.34 + depth * 0.42;
    this.tint = mixColor(palette.background, 0x000000, 0.45);
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
    this.punch(playerScreenX - camera.scrollX, playerScreenY - camera.scrollY, 7.2 * flicker);

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
  }

  destroy(): void {
    this.darkness.destroy();
    this.vignette.destroy();
  }

  /** Erase a soft circle from the darkness sheet. */
  private punch(x: number, y: number, radiusTiles: number): void {
    if (x < -100 || y < -100 || x > VIEW_W + 100 || y > VIEW_H + 100) return;
    const scale = (radiusTiles * TILE_SIZE) / 32;
    this.darkness.erase(TextureKey.glow, x - (32 * scale) / 2, y - (32 * scale) / 2);
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
 * Things that emit their own light, and how far it reaches in cells. The
 * glow on a diamond is what makes them findable in the dark lower caves.
 */
const GLOW_RADIUS: Readonly<Record<number, number>> = {
  [Tile.Diamond]: 1.7,
  [Tile.DiamondFalling]: 1.9,
  [Tile.ExitOpen]: 3.4,
  [Tile.ExplosionEmpty]: 3.2,
  [Tile.ExplosionDiamond]: 3.4,
  [Tile.Amoeba]: 1.1,
  [Tile.PlayerBirth]: 4.5,
};

/** Clamp helper re-exported for scenes that dim the lamp during menus. */
export function lampStrength(value: number): number {
  return clamp(value, 0, 1);
}
