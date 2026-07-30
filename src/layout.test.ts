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

/** Windows big enough that the game is expected to reach every edge. */
const DESKTOPS: ReadonlyArray<readonly [string, number, number, number]> = [
  ['1366x768', 1366, 768, 1],
  ['laptop', 1440, 900, 2],
  ['MacBook Pro 14', 1512, 982, 2],
  ['1080p', 1920, 1080, 1],
  ['1920x1200', 1920, 1200, 1],
  ['1440p', 2560, 1440, 1],
  ['4K', 3840, 2160, 1],
  ['ultrawide', 3440, 1440, 1],
  ['iPad landscape', 1180, 820, 2],
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

    expect(l.tilesW).toBeLessThanOrEqual(MAX_TILES_W);
    expect(l.tilesH).toBeLessThanOrEqual(MAX_TILES_H);
    expect(l.tilesW).toBeLessThan(CAVE_WIDTH);
    expect(l.tilesH).toBeLessThan(CAVE_HEIGHT);
  });

  it('spends a big screen on bigger cells, not on more cave', () => {
    // Twice the window in each direction. At a fixed zoom that would double
    // the columns and hand the player most of the cave; the extra room has to
    // go mostly into cell size instead.
    const laptop = computeLayout(1280, 720, 1);
    const huge = computeLayout(2560, 1440, 1);

    expect(huge.tilesW).toBeLessThan(laptop.tilesW * 1.35);
    expect(cellCss(2560, 1440)).toBeGreaterThan(cellCss(1280, 720) * 1.5);
  });

  it('fills a desktop window instead of letterboxing it', () => {
    // A canvas whose shape differs from the window's gets black bars once it
    // is fitted, which is what made the game look small on a monitor.
    for (const [name, w, h, dpr] of DESKTOPS) {
      const l = computeLayout(w, h, dpr);
      const scale = Math.min(w / l.width, h / l.height);
      const covered = ((l.width * scale) / w) * ((l.height * scale) / h);

      expect(`${name}: ${covered >= 0.95}`).toBe(`${name}: true`);
    }
  });

  it('leaves the phone layouts alone', () => {
    // Touch play was tuned against these exact figures; widening the desktop
    // view must not have moved them.
    expect(computeLayout(375, 667, 2)).toMatchObject({ tilesW: 12, tilesH: 20 });
    expect(computeLayout(393, 852, 3)).toMatchObject({ tilesW: 12, tilesH: 20 });
    expect(computeLayout(852, 393, 3)).toMatchObject({ tilesW: 26, tilesH: 11 });
    expect(computeLayout(412, 915, 2.6)).toMatchObject({ tilesW: 12, tilesH: 20 });
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
