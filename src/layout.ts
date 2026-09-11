import { CAVE_HEIGHT, CAVE_WIDTH, HUD_HEIGHT, TILE_SIZE, VIEWPORT_TILES_H, VIEWPORT_TILES_W } from './config';
import { lerp, smoothstep } from './game/render/renderMath';

export interface Layout {
  /** Ceiling cell counts include partially visible tiles at the edges. */
  readonly tilesW: number;
  readonly tilesH: number;
  readonly width: number;
  readonly height: number;
  /** Every pixel below the compact status bar belongs to the cave. */
  readonly worldHeight: number;
}

export const MAX_TILES_W = 28;
export const MAX_TILES_H = 20;

function makeLayout(width: number, height: number): Layout {
  const worldHeight = height - HUD_HEIGHT;
  return {
    tilesW: Math.ceil(width / TILE_SIZE),
    tilesH: Math.ceil(worldHeight / TILE_SIZE),
    width,
    height,
    worldHeight,
  };
}

export const DEFAULT_LAYOUT: Layout = makeLayout(
  VIEWPORT_TILES_W * TILE_SIZE,
  VIEWPORT_TILES_H * TILE_SIZE + HUD_HEIGHT,
);

/**
 * Fit the actual window rather than rounding the viewport to whole tiles.
 * Zoom is bounded in both axes, so portrait phones fill the screen without
 * exposing empty space beyond the cave or shrinking cells into tiny targets.
 */
export function computeLayout(windowW: number, windowH: number, dpr = 1): Layout {
  const safeW = Math.max(1, Number.isFinite(windowW) ? windowW : 1);
  const safeH = Math.max(1, Number.isFinite(windowH) ? windowH : 1);
  const shortEdge = Math.min(safeW, safeH);
  const preferredCells = lerp(12, 15, smoothstep(620, 1000, shortEdge));
  const cell = Math.max(
    shortEdge / preferredCells,
    safeW / Math.min(MAX_TILES_W, CAVE_WIDTH),
    safeH / (Math.min(MAX_TILES_H, CAVE_HEIGHT) + HUD_HEIGHT / TILE_SIZE),
    dpr >= 2 ? 22 : 26,
  );

  return makeLayout(
    Math.max(TILE_SIZE, Math.round(safeW / cell * TILE_SIZE)),
    Math.max(HUD_HEIGHT + TILE_SIZE, Math.round(safeH / cell * TILE_SIZE)),
  );
}

let current: Layout = DEFAULT_LAYOUT;

export function layout(): Layout {
  return current;
}

/** Refit on rotation, browser chrome changes, or entering native fullscreen. */
export function refreshLayout(windowW: number, windowH: number, dpr = 1): boolean {
  const next = computeLayout(windowW, windowH, dpr);
  const changed = next.width !== current.width || next.height !== current.height;
  current = next;
  return changed;
}

export function setLayout(next: Layout): void {
  current = next;
}

export const LAYOUT_CHANGED = 'cavern-run-layout-changed';
