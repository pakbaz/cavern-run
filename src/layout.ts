import { CAVE_HEIGHT, CAVE_WIDTH, HUD_HEIGHT, TILE_SIZE, VIEWPORT_TILES_H, VIEWPORT_TILES_W } from './config';
import { clamp } from './game/render/renderMath';

/**
 * How much of the cave to show, and how big to make the canvas.
 *
 * The game is drawn at a fixed 32px per cell and then scaled to fit the
 * window, so the only real decision is how many cells to put on screen. Show
 * too few and a phone player cannot see a boulder coming; show too many and
 * the cells shrink until the pixel art is unreadable. The rule here is to pick
 * a comfortable on-screen cell size first and derive the cell counts from it,
 * which makes the answer fall out of the window's shape rather than needing
 * separate portrait and landscape cases.
 */

export interface Layout {
  /** Cells of cave visible across and down. */
  readonly tilesW: number;
  readonly tilesH: number;
  /** Canvas size in game pixels, including the status bar. */
  readonly width: number;
  readonly height: number;
  /** Canvas height below the status bar. */
  readonly worldHeight: number;
}

/**
 * Bounds on how much cave can be on screen at once.
 *
 * The floors keep the game playable on a small phone; the ceilings stop a
 * large monitor from simply showing the whole cave, which would give away
 * every hazard and flatten the tension of scrolling into the unknown.
 */
export const MIN_TILES_W = 11;
export const MAX_TILES_W = 28;
export const MIN_TILES_H = 9;
export const MAX_TILES_H = 20;

/**
 * Smallest and largest a cell may appear, in CSS pixels.
 *
 * The lower bound is what keeps the art readable and a cell roughly
 * finger-sized on touch. High-density screens can take a slightly smaller
 * cell, because the pixel art still resolves cleanly on them.
 */
const MIN_CELL_CSS = 26;
const MIN_CELL_CSS_HIDPI = 22;
const MAX_CELL_CSS = 56;

/** Cells the short edge of the window should span, before clamping. */
const CELLS_ON_SHORT_EDGE = 12;

/** The layout a desktop browser would have had before any of this existed. */
export const DEFAULT_LAYOUT: Layout = makeLayout(VIEWPORT_TILES_W, VIEWPORT_TILES_H);

function makeLayout(tilesW: number, tilesH: number): Layout {
  return {
    tilesW,
    tilesH,
    width: tilesW * TILE_SIZE,
    height: tilesH * TILE_SIZE + HUD_HEIGHT,
    worldHeight: tilesH * TILE_SIZE,
  };
}

/**
 * Choose a layout for a window of the given CSS size and pixel density.
 *
 * Pure, so the awkward cases -- a tall phone, a phone on its side, a very
 * wide desktop, a tiny embedded frame -- can be checked without a browser.
 */
export function computeLayout(windowW: number, windowH: number, dpr = 1): Layout {
  const safeW = Math.max(1, windowW);
  const safeH = Math.max(1, windowH);

  const minCell = dpr >= 2 ? MIN_CELL_CSS_HIDPI : MIN_CELL_CSS;
  // Size cells against the short edge, so a phone gets chunky cells whichever
  // way up it is held rather than only in landscape.
  const cell = clamp(Math.min(safeW, safeH) / CELLS_ON_SHORT_EDGE, minCell, MAX_CELL_CSS);

  // The status bar is about one cell tall and scales with everything else.
  const tilesW = clamp(Math.round(safeW / cell), MIN_TILES_W, Math.min(MAX_TILES_W, CAVE_WIDTH));
  const tilesH = clamp(
    Math.round((safeH - cell) / cell),
    MIN_TILES_H,
    Math.min(MAX_TILES_H, CAVE_HEIGHT),
  );

  return makeLayout(tilesW, tilesH);
}

let current: Layout = DEFAULT_LAYOUT;

/** The layout in force right now. */
export function layout(): Layout {
  return current;
}

/**
 * Recompute from the window and adopt the result.
 * @returns true when the number of visible cells actually changed, which is
 * the only case that requires anything to be rebuilt.
 */
export function refreshLayout(windowW: number, windowH: number, dpr = 1): boolean {
  const next = computeLayout(windowW, windowH, dpr);
  const changed = next.tilesW !== current.tilesW || next.tilesH !== current.tilesH;
  current = next;
  return changed;
}

/** Test seam: force a layout without going through the window. */
export function setLayout(next: Layout): void {
  current = next;
}

/** Event fired on the game's emitter when the visible cell counts change. */
export const LAYOUT_CHANGED = 'cavern-run-layout-changed';
