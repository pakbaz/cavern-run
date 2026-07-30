import Phaser from 'phaser';

import { GAME_WIDTH } from '../../config';

/**
 * Shared look for every menu and overlay.
 *
 * Cavern Run loads no font files -- the whole game is procedural -- so the
 * UI leans on a monospace stack. Fixed-width glyphs are also what make the
 * score columns and the bonus tally line up without measuring anything.
 */
export const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export const Ink = {
  bright: '#eaf3ff',
  body: '#a8c0dc',
  dim: '#6b8099',
  gold: '#ffd166',
  danger: '#ff6b6b',
  accent: '#6fb6ff',
} as const;

export function titleStyle(size = 40): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color: Ink.bright,
    stroke: '#04070f',
    strokeThickness: 6,
  };
}

export function bodyStyle(size = 14, color: string = Ink.body): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color,
    stroke: '#04070f',
    strokeThickness: 3,
  };
}

/** A dark rounded slab to sit UI on top of, so text never fights the art. */
export function panel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  alpha = 0.82,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x060a14, alpha);
  g.fillRoundedRect(x, y, width, height, 10);
  g.lineStyle(2, 0x2b3d57, 0.9);
  g.strokeRoundedRect(x, y, width, height, 10);
  return g;
}

/** Centre a text object horizontally in the canvas. */
export function centred(
  scene: Phaser.Scene,
  y: number,
  text: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.GameObjects.Text {
  return scene.add.text(GAME_WIDTH / 2, y, text, style).setOrigin(0.5);
}

/** Gentle attention pulse for "press any key" style prompts. */
export function pulse(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject): void {
  scene.tweens.add({
    targets: target,
    alpha: { from: 1, to: 0.35 },
    duration: 900,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
}

/** `1234` renders as `01234` so the HUD never changes width. */
export function pad(value: number, width: number): string {
  return Math.max(0, Math.floor(value)).toString().padStart(width, '0');
}
