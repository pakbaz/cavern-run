import Phaser from 'phaser';

import { LAYOUT_CHANGED, layout } from '../../layout';

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
    fontSize: `${Math.round(size * menuScale())}px`,
    color: Ink.bright,
    stroke: '#04070f',
    strokeThickness: 6,
  };
}

export function bodyStyle(size = 14, color: string = Ink.body): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontSize: `${Math.round(size * menuScale())}px`,
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
  return scene.add.text(layout().width / 2, y, text, style).setOrigin(0.5);
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

/**
 * Run `handler` whenever the window changes shape enough to change how much
 * cave is visible, and stop listening when the scene shuts down.
 *
 * Scenes are re-entered rather than destroyed, so a subscription that outlives
 * the visit would fire against dead game objects on the next rotation.
 */
export function onLayoutChanged(scene: Phaser.Scene, handler: () => void): void {
  const game = scene.game;
  game.events.on(LAYOUT_CHANGED, handler);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => game.events.off(LAYOUT_CHANGED, handler));
  scene.events.once(Phaser.Scenes.Events.DESTROY, () => game.events.off(LAYOUT_CHANGED, handler));
}

/**
 * A menu or card that simply rebuilds itself at the new size.
 *
 * These screens hold no state worth preserving across a rotation -- the run
 * itself lives in the registry -- so replaying `create()` is both the simplest
 * and the most reliable way to re-lay them out.
 */
export function relayoutOnResize(scene: Phaser.Scene): void {
  onLayoutChanged(scene, () => scene.scene.restart());
}

/**
 * The canvas the menus and cards were laid out against.
 *
 * Their positions are hand-placed rather than flowed, which reads well and is
 * easy to adjust, but assumes a canvas of this size. The width is the widest
 * card plus its margin rather than the whole old canvas, so a narrow portrait
 * screen is judged on whether the card fits, not on the empty space beside it.
 */
const DESIGN_WIDTH = 400;
const DESIGN_HEIGHT = 416;

/**
 * How much to shrink the menus so they fit the canvas.
 *
 * Never above 1: on a roomy screen the design is used as drawn. A landscape
 * phone is shorter than the design and a portrait one narrower, and in both
 * cases a card laid out at full size would run off the edge.
 */
export function menuScale(): number {
  const { width, height } = layout();
  return Math.min(1, width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
}

/**
 * Map a hand-placed vertical position onto the current canvas, scaling and
 * centring the block. Elements deliberately pinned to the bottom edge should
 * be positioned from `layout().height` and left out of this.
 */
export function designY(y: number): number {
  return layout().height / 2 + (y - DESIGN_HEIGHT / 2) * menuScale();
}

/** Map a horizontal offset from the centre of the design onto the canvas. */
export function designX(offsetFromCentre: number): number {
  return layout().width / 2 + offsetFromCentre * menuScale();
}

/**
 * A centred slab in design units, which is the shape every card in the game
 * happens to be.
 */
export function card(
  scene: Phaser.Scene,
  y: number,
  width: number,
  height: number,
): Phaser.GameObjects.Graphics {
  const scale = menuScale();
  return panel(scene, designX(-width / 2), designY(y), width * scale, height * scale);
}
