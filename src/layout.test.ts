import { describe, expect, it } from 'vitest';

import { CAVE_HEIGHT, CAVE_WIDTH, HUD_HEIGHT, TILE_SIZE } from './config';
import {
  computeLayout,
  MAX_TILES_H,
  MAX_TILES_W,
  MIN_TILES_H,
  MIN_TILES_W,
  refreshLayout,
  setLayout,
  DEFAULT_LAYOUT,
  layout,
} from './layout';

/**
 * The layout decides how much cave a player can see, which is a gameplay
 * question as much as a presentation one: too little and a boulder arrives
 * without warning, too much and nothing is hidden.
 */

/** On-screen size of one cell once the canvas is fitted to the window. */
function cellCss(w: number, h: number, dpr = 1): number {
  const l = computeLayout(w, h, dpr);
  const scale = Math.min(w / l.width, h / l.height);
  return TILE_SIZE * scale;
}

const DEVICES: ReadonlyArray<readonly [string, number, number, number]> = [
  ['iPhone SE portrait', 375, 667, 2],
  ['iPhone SE landscape', 667, 375, 2],
  ['iPhone 15 portrait', 393, 852, 3],
  ['iPhone 15 landscape', 852, 393, 3],
  ['Pixel 7 portrait', 412, 915, 2.6],
  ['iPad portrait', 820, 1180, 2],
  ['iPad landscape', 1180, 820, 2],
  ['laptop', 1440, 900, 2],
  ['desktop', 2560, 1440, 1],
  ['very wide', 3440, 1440, 1],
  ['small embed', 320, 240, 1],
];

describe('computeLayout', () => {
  it('keeps cells big enough to read on every device', () => {
    for (const [name, w, h, dpr] of DEVICES) {
      const size = cellCss(w, h, dpr);
      // A cell smaller than this is unreadable pixel art and, on touch,
      // smaller than a fingertip. Reported with the device so a failure says
      // which one regressed.
      expect(`${name}: ${size >= 20}`).toBe(`${name}: true`);
    }
  });

  it('never shows more cave than exists', () => {
    for (const [, w, h, dpr] of DEVICES) {
      const l = computeLayout(w, h, dpr);
      expect(l.tilesW).toBeLessThanOrEqual(CAVE_WIDTH);
      expect(l.tilesH).toBeLessThanOrEqual(CAVE_HEIGHT);
    }
  });

  it('stays within the playable bounds on every device', () => {
    for (const [name, w, h, dpr] of DEVICES) {
      const l = computeLayout(w, h, dpr);
      const within =
        l.tilesW >= MIN_TILES_W &&
        l.tilesW <= MAX_TILES_W &&
        l.tilesH >= MIN_TILES_H &&
        l.tilesH <= MAX_TILES_H;
      expect(`${name}: ${l.tilesW}x${l.tilesH} ok=${within}`).toBe(
        `${name}: ${l.tilesW}x${l.tilesH} ok=true`,
      );
    }
  });

  it('shows a wider slice of cave on a wider window', () => {
    const narrow = computeLayout(400, 800, 2);
    const wide = computeLayout(1400, 800, 2);

    expect(wide.tilesW).toBeGreaterThan(narrow.tilesW);
  });

  it('turns a phone on its side into a wider, shorter view', () => {
    const portrait = computeLayout(393, 852, 3);
    const landscape = computeLayout(852, 393, 3);

    expect(landscape.tilesW).toBeGreaterThan(portrait.tilesW);
    expect(landscape.tilesH).toBeLessThan(portrait.tilesH);
  });

  it('gives a portrait phone a taller view than it is wide', () => {
    const l = computeLayout(393, 852, 3);

    expect(l.tilesH).toBeGreaterThan(l.tilesW);
  });

  it('lets a dense screen show a little more', () => {
    // Same window, different pixel density: the art still resolves on the
    // denser screen, so cells may be a touch smaller and more of them fit.
    const standard = computeLayout(420, 900, 1);
    const dense = computeLayout(420, 900, 3);

    expect(dense.tilesW).toBeGreaterThanOrEqual(standard.tilesW);
  });

  it('caps a huge monitor rather than revealing the whole cave', () => {
    const l = computeLayout(3440, 1440, 1);

    expect(l.tilesW).toBe(MAX_TILES_W);
    expect(l.tilesH).toBe(MAX_TILES_H);
    expect(l.tilesW).toBeLessThan(CAVE_WIDTH);
  });

  it('stays playable in a tiny frame', () => {
    const l = computeLayout(320, 240, 1);

    expect(l.tilesW).toBeGreaterThanOrEqual(MIN_TILES_W);
    expect(l.tilesH).toBeGreaterThanOrEqual(MIN_TILES_H);
  });

  it('survives a degenerate window', () => {
    for (const [w, h] of [
      [0, 0],
      [-100, -100],
      [1, 1],
    ]) {
      const l = computeLayout(w, h, 1);
      expect(Number.isFinite(l.width)).toBe(true);
      expect(l.tilesW).toBe(MIN_TILES_W);
      expect(l.tilesH).toBe(MIN_TILES_H);
    }
  });

  it('derives the canvas size from the cell counts and the status bar', () => {
    const l = computeLayout(1440, 900, 2);

    expect(l.width).toBe(l.tilesW * TILE_SIZE);
    expect(l.worldHeight).toBe(l.tilesH * TILE_SIZE);
    expect(l.height).toBe(l.worldHeight + HUD_HEIGHT);
  });
});

describe('refreshLayout', () => {
  it('reports a change only when the cell counts move', () => {
    setLayout(DEFAULT_LAYOUT);

    expect(refreshLayout(1440, 900, 2)).toBe(true);
    // Same window again: nothing to rebuild.
    expect(refreshLayout(1440, 900, 2)).toBe(false);
    // A few pixels of browser chrome should not thrash the whole scene.
    expect(refreshLayout(1442, 899, 2)).toBe(false);
  });

  it('adopts the new layout', () => {
    setLayout(DEFAULT_LAYOUT);
    refreshLayout(393, 852, 3);

    expect(layout().tilesH).toBeGreaterThan(layout().tilesW);
    setLayout(DEFAULT_LAYOUT);
  });
});
