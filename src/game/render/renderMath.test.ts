import { describe, expect, it } from 'vitest';

import { CAVE_HEIGHT, CAVE_WIDTH, TILE_SIZE, VIEWPORT_TILES_H, VIEWPORT_TILES_W } from '../../config';
import {
  animFrame,
  approachCamera,
  cameraTarget,
  clamp,
  glowTransform,
  formatScore,
  formatTime,
  interpolate,
  lampFalloff,
  lerp,
  mixColor,
  packRgb,
  rgb,
  shade,
  smoothstep,
  tileCentre,
  tileToPixel,
  tileVariant,
  toCss,
  visibleTiles,
} from './renderMath';

const VIEW_W_PX = VIEWPORT_TILES_W * TILE_SIZE;
const VIEW_H_PX = VIEWPORT_TILES_H * TILE_SIZE;
const CAVE_W_PX = CAVE_WIDTH * TILE_SIZE;

describe('basic maths', () => {
  it('lerps and clamps', () => {
    expect(lerp(0, 10, 0.25)).toBe(2.5);
    expect(clamp(-4, 0, 3)).toBe(0);
    expect(clamp(9, 0, 3)).toBe(3);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it('smoothsteps between its edges', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 5);
    // Degenerate edges must not divide by zero.
    expect(smoothstep(1, 1, 0)).toBe(0);
    expect(smoothstep(1, 1, 2)).toBe(1);
  });

  it('converts cells to pixels', () => {
    expect(tileToPixel(3)).toBe(3 * TILE_SIZE);
    expect(tileCentre(3)).toBe(3 * TILE_SIZE + TILE_SIZE / 2);
  });

  it('interpolates a tile move and never overshoots', () => {
    expect(interpolate(2, 3, 0)).toBe(tileToPixel(2));
    expect(interpolate(2, 3, 1)).toBe(tileToPixel(3));
    expect(interpolate(2, 3, 0.5)).toBe(tileToPixel(2) + TILE_SIZE / 2);
    expect(interpolate(2, 3, 5)).toBe(tileToPixel(3));
    expect(interpolate(2, 3, -5)).toBe(tileToPixel(2));
  });
});

describe('the camera', () => {
  it('holds still while the player stays inside the dead zone', () => {
    const scrollX = 10 * TILE_SIZE;
    const centreTile = 10 + VIEWPORT_TILES_W / 2;
    const target = cameraTarget(centreTile, 6, CAVE_WIDTH, CAVE_HEIGHT, scrollX, 0);
    expect(target.x).toBe(scrollX);
  });

  it('follows once the player pushes past the dead zone', () => {
    const scrollX = 10 * TILE_SIZE;
    const before = cameraTarget(12, 6, CAVE_WIDTH, CAVE_HEIGHT, scrollX, 0).x;
    const after = cameraTarget(28, 6, CAVE_WIDTH, CAVE_HEIGHT, scrollX, 0).x;
    expect(after).toBeGreaterThan(before);
  });

  it('never shows anything outside the cave', () => {
    const left = cameraTarget(0, 0, CAVE_WIDTH, CAVE_HEIGHT, 0, 0);
    expect(left.x).toBe(0);
    expect(left.y).toBe(0);

    const right = cameraTarget(
      CAVE_WIDTH - 1,
      CAVE_HEIGHT - 1,
      CAVE_WIDTH,
      CAVE_HEIGHT,
      CAVE_W_PX,
      CAVE_HEIGHT * TILE_SIZE,
    );
    expect(right.x).toBe(CAVE_W_PX - VIEW_W_PX);
    expect(right.y).toBe(CAVE_HEIGHT * TILE_SIZE - VIEW_H_PX);
  });

  it('centres an axis when the cave is smaller than the view', () => {
    const target = cameraTarget(2, 2, 8, 4, 0, 0);
    expect(target.x).toBe((8 * TILE_SIZE - VIEW_W_PX) / 2);
    expect(target.y).toBe((4 * TILE_SIZE - VIEW_H_PX) / 2);
  });

  it('eases toward the target and snaps when close enough', () => {
    const stepped = approachCamera(0, 100, 16);
    expect(stepped).toBeGreaterThan(0);
    expect(stepped).toBeLessThan(100);

    expect(approachCamera(99.9, 100, 16)).toBe(100);
    // A longer frame closes more of the gap than a short one.
    expect(approachCamera(0, 100, 100)).toBeGreaterThan(approachCamera(0, 100, 16));
  });
});

describe('visibleTiles', () => {
  it('covers the view with a margin, clamped to the cave', () => {
    const range = visibleTiles(0, 0, CAVE_WIDTH, CAVE_HEIGHT);
    expect(range.minX).toBe(0);
    expect(range.minY).toBe(0);
    expect(range.maxX).toBeGreaterThanOrEqual(VIEWPORT_TILES_W);
    expect(range.maxY).toBeGreaterThanOrEqual(VIEWPORT_TILES_H);
    expect(range.maxX).toBeLessThanOrEqual(CAVE_WIDTH - 1);
    expect(range.maxY).toBeLessThanOrEqual(CAVE_HEIGHT - 1);
  });

  it('never reports a range outside the grid when scrolled to the end', () => {
    const range = visibleTiles(CAVE_W_PX, CAVE_HEIGHT * TILE_SIZE, CAVE_WIDTH, CAVE_HEIGHT);
    expect(range.minX).toBeGreaterThanOrEqual(0);
    expect(range.maxX).toBe(CAVE_WIDTH - 1);
    expect(range.maxY).toBe(CAVE_HEIGHT - 1);
  });
});

describe('colour', () => {
  it('round-trips through pack and unpack', () => {
    const { r, g, b } = rgb(0x4a3a2a);
    expect([r, g, b]).toEqual([0x4a, 0x3a, 0x2a]);
    expect(packRgb(r, g, b)).toBe(0x4a3a2a);
  });

  it('clamps out-of-range channels instead of wrapping', () => {
    expect(packRgb(999, -20, 300)).toBe(0xff00ff);
  });

  it('mixes toward the second colour', () => {
    expect(mixColor(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mixColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
  });

  it('shades lighter and darker', () => {
    expect(shade(0x808080, 1)).toBe(0xffffff);
    expect(shade(0x808080, -1)).toBe(0x000000);
    expect(shade(0x808080, 0)).toBe(0x808080);
  });

  it('formats CSS with a full six digits', () => {
    expect(toCss(0x00ff00)).toBe('#00ff00');
    expect(toCss(0x000001)).toBe('#000001');
  });
});

describe('presentation helpers', () => {
  it('cycles animation frames and stays in range for negative offsets', () => {
    expect(animFrame(0, 4)).toBe(0);
    expect(animFrame(5, 4)).toBe(1);
    expect(animFrame(0, 4, -1)).toBe(3);
    expect(animFrame(3, 1)).toBe(0);
    expect(animFrame(3, 0)).toBe(0);
  });

  it('picks a stable variant per cell', () => {
    expect(tileVariant(4, 9, 4)).toBe(tileVariant(4, 9, 4));
    expect(tileVariant(4, 9, 4)).toBeGreaterThanOrEqual(0);
    expect(tileVariant(4, 9, 4)).toBeLessThan(4);

    const seen = new Set<number>();
    for (let x = 0; x < 12; x += 1) for (let y = 0; y < 12; y += 1) seen.add(tileVariant(x, y, 4));
    expect(seen.size).toBe(4);
  });

  it('feathers the lamp to nothing at its edge', () => {
    expect(lampFalloff(0, 6)).toBe(1);
    expect(lampFalloff(6, 6)).toBe(0);
    expect(lampFalloff(12, 6)).toBe(0);
    expect(lampFalloff(4, 6)).toBeGreaterThan(0);
    expect(lampFalloff(4, 6)).toBeLessThan(1);
    expect(lampFalloff(1, 0)).toBe(0);
  });

  it('formats the HUD readouts', () => {
    expect(formatTime(0)).toBe('000');
    expect(formatTime(7.2)).toBe('008');
    expect(formatTime(-5)).toBe('000');
    expect(formatTime(150)).toBe('150');
    expect(formatScore(0)).toBe('000000');
    expect(formatScore(1234)).toBe('001234');
    expect(formatScore(-1)).toBe('000000');
  });
});

describe('glowTransform', () => {
  // The lamp is stamped onto the darkness sheet, and the stamp is what decides
  // both how big the light is and where its centre lands. When the scale was
  // dropped, every light kept its native size while still being offset as if
  // it had been scaled, so the miner's lamp floated up and to the left of him
  // and the diamond glows sat off their diamonds.
  it('draws a one-cell-radius light two cells wide', () => {
    expect(glowTransform(1, 32, 32).scale).toBe(2);
  });

  it('scales with the radius', () => {
    expect(glowTransform(4, 32, 32).scale).toBe(8);
    expect(glowTransform(0.5, 32, 32).scale).toBe(1);
  });

  it('accounts for a glow texture that is not one cell across', () => {
    // A 64px glow already covers two 32px cells, so it needs half the scale.
    expect(glowTransform(2, 64, 32).scale).toBe(2);
  });

  it('reports a reach of exactly the radius in pixels', () => {
    expect(glowTransform(3, 32, 32).reach).toBe(3 * 32);
    expect(glowTransform(9.5, 32, 32).reach).toBe(9.5 * 32);
  });

  it('never returns a negative scale', () => {
    expect(glowTransform(-4, 32, 32).scale).toBe(0);
    expect(glowTransform(-4, 32, 32).reach).toBe(0);
  });
});
