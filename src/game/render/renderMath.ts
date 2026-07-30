import { TILE_SIZE, VIEWPORT_TILES_H, VIEWPORT_TILES_W } from '../../config';

/**
 * Pure helpers shared by the renderer.
 *
 * Nothing in here touches Phaser, a canvas, or the DOM, so the camera and
 * interpolation maths that decide what the player actually sees can be tested
 * directly.
 */

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Smooth 0..1 ramp, used for glows and fades. */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 === edge0) return value < edge0 ? 0 : 1;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Top-left pixel of a cell, in world space. */
export function tileToPixel(tile: number): number {
  return tile * TILE_SIZE;
}

/** Centre pixel of a cell, in world space. */
export function tileCentre(tile: number): number {
  return tile * TILE_SIZE + TILE_SIZE / 2;
}

export interface Viewport {
  readonly widthTiles: number;
  readonly heightTiles: number;
}

export const DEFAULT_VIEWPORT: Viewport = {
  widthTiles: VIEWPORT_TILES_W,
  heightTiles: VIEWPORT_TILES_H,
};

/**
 * Fraction of the viewport the player can roam before the camera starts to
 * follow. A dead zone keeps the view still during small back-and-forth digging
 * instead of lurching after every step.
 */
export const CAMERA_DEAD_ZONE = 0.28;

/**
 * Where the camera wants to be, in world pixels, for a given player cell.
 *
 * The camera only moves once the player leaves the dead zone, and is then
 * clamped so the view never shows anything outside the cave. When the cave is
 * smaller than the viewport on an axis it is centred on that axis instead.
 */
export function cameraTarget(
  playerX: number,
  playerY: number,
  caveWidth: number,
  caveHeight: number,
  currentScrollX: number,
  currentScrollY: number,
  viewport: Viewport = DEFAULT_VIEWPORT,
): { x: number; y: number } {
  return {
    x: axisTarget(playerX, caveWidth, currentScrollX, viewport.widthTiles),
    y: axisTarget(playerY, caveHeight, currentScrollY, viewport.heightTiles),
  };
}

function axisTarget(
  playerTile: number,
  caveTiles: number,
  currentScroll: number,
  viewTiles: number,
): number {
  const viewPixels = viewTiles * TILE_SIZE;
  const cavePixels = caveTiles * TILE_SIZE;

  if (cavePixels <= viewPixels) return (cavePixels - viewPixels) / 2;

  const playerPixel = tileCentre(playerTile);
  const margin = viewPixels * CAMERA_DEAD_ZONE;

  const minEdge = currentScroll + margin;
  const maxEdge = currentScroll + viewPixels - margin;

  let scroll = currentScroll;
  if (playerPixel < minEdge) scroll = playerPixel - margin;
  else if (playerPixel > maxEdge) scroll = playerPixel - viewPixels + margin;

  return clamp(scroll, 0, cavePixels - viewPixels);
}

/** Ease the camera toward its target; frame-rate independent. */
export function approachCamera(current: number, target: number, deltaMs: number, rate = 0.012): number {
  const t = 1 - Math.exp(-rate * deltaMs);
  const next = lerp(current, target, t);
  return Math.abs(next - target) < 0.5 ? target : next;
}

export interface TileRange {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * Cells overlapping the view, with a one-cell margin so a sprite sliding in
 * from off-screen is already drawn when it appears.
 */
export function visibleTiles(
  scrollX: number,
  scrollY: number,
  caveWidth: number,
  caveHeight: number,
  viewport: Viewport = DEFAULT_VIEWPORT,
): TileRange {
  const minX = clamp(Math.floor(scrollX / TILE_SIZE) - 1, 0, caveWidth - 1);
  const minY = clamp(Math.floor(scrollY / TILE_SIZE) - 1, 0, caveHeight - 1);
  const maxX = clamp(Math.ceil((scrollX + viewport.widthTiles * TILE_SIZE) / TILE_SIZE) + 1, 0, caveWidth - 1);
  const maxY = clamp(Math.ceil((scrollY + viewport.heightTiles * TILE_SIZE) / TILE_SIZE) + 1, 0, caveHeight - 1);
  return { minX, minY, maxX, maxY };
}

/**
 * Where a moving tile should be drawn part-way through a simulation scan.
 * `alpha` is the session's progress toward the next scan.
 */
export function interpolate(
  fromTile: number,
  toTile: number,
  alpha: number,
): number {
  return lerp(tileToPixel(fromTile), tileToPixel(toTile), clamp(alpha, 0, 1));
}

/* ------------------------------------------------------------------ *
 * Colour
 * ------------------------------------------------------------------ */

export function rgb(color: number): { r: number; g: number; b: number } {
  return { r: (color >> 16) & 0xff, g: (color >> 8) & 0xff, b: color & 0xff };
}

export function packRgb(r: number, g: number, b: number): number {
  const cr = clamp(Math.round(r), 0, 255);
  const cg = clamp(Math.round(g), 0, 255);
  const cb = clamp(Math.round(b), 0, 255);
  return (cr << 16) | (cg << 8) | cb;
}

/** Blend two packed colours; `t` of 0 returns `a`, 1 returns `b`. */
export function mixColor(a: number, b: number, t: number): number {
  const ca = rgb(a);
  const cb = rgb(b);
  const k = clamp(t, 0, 1);
  return packRgb(lerp(ca.r, cb.r, k), lerp(ca.g, cb.g, k), lerp(ca.b, cb.b, k));
}

/** Lighten (positive) or darken (negative) a packed colour. */
export function shade(color: number, amount: number): number {
  return amount >= 0 ? mixColor(color, 0xffffff, amount) : mixColor(color, 0x000000, -amount);
}

export function toCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/* ------------------------------------------------------------------ *
 * Presentation-only derived values
 * ------------------------------------------------------------------ */

/**
 * Which frame of an n-frame loop to show. Driven by the simulation tick count
 * plus a per-cell offset so a field of identical tiles does not pulse in
 * lockstep.
 */
export function animFrame(ticks: number, frames: number, offset = 0): number {
  const n = Math.max(1, frames);
  return (((Math.floor(ticks) + offset) % n) + n) % n;
}

/** Stable pseudo-random variant index for a cell; keeps dirt from tiling. */
export function tileVariant(x: number, y: number, variants: number): number {
  const h = (x * 73856093) ^ (y * 19349663);
  return Math.abs(h) % Math.max(1, variants);
}

/**
 * Brightness of the helmet lamp at a given distance, in cells. Full strength
 * up close, feathered to nothing at the edge of the cone.
 */
export function lampFalloff(distance: number, radius: number): number {
  if (radius <= 0) return 0;
  return 1 - smoothstep(radius * 0.35, radius, distance);
}

/** Format the HUD clock as a zero-padded whole number of seconds. */
export function formatTime(seconds: number): string {
  return Math.max(0, Math.ceil(seconds)).toString().padStart(3, '0');
}

export function formatScore(score: number): string {
  return Math.max(0, Math.floor(score)).toString().padStart(6, '0');
}

/**
 * How much to scale the glow texture so a light of `radiusTiles` covers that
 * radius on screen, and how far its edge reaches from the centre in pixels.
 *
 * The glow art is a circle that fills its texture, so a light of radius R
 * cells has to be drawn 2R cells wide. Getting this wrong is invisible in a
 * still frame -- the lamp simply sits at the wrong size or, if the scale is
 * dropped entirely, the light drifts away from whatever it is meant to be
 * lighting.
 */
export function glowTransform(
  radiusTiles: number,
  textureSize: number,
  tileSize: number,
): { scale: number; reach: number } {
  const scale = (Math.max(0, radiusTiles) * 2 * tileSize) / textureSize;
  return { scale, reach: (textureSize * scale) / 2 };
}
