import { describe, expect, it } from 'vitest';

import { CAVE_HEIGHT, CAVE_WIDTH, TILE_SIZE, VIEWPORT_TILES_H, VIEWPORT_TILES_W } from '../../config';
import {
  EDGE_MASKS,
  EdgeBit,
  animFrame,
  approachCamera,
  cameraTarget,
  clamp,
  drift,
  edgeMask,
  glowTransform,
  formatScore,
  formatTime,
  interpolate,
  lampCone,
  lampFalloff,
  lerp,
  mixColor,
  packRgb,
  rgb,
  shade,
  sheetCell,
  smoothstep,
  tileCentre,
  tileToPixel,
  tileVariant,
  toCss,
  valueNoise,
  visibleTiles,
  wrap,
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

describe('edge masks', () => {
  // Terrain is shaded by which of its sides have been dug open, so a wall of
  // untouched dirt reads as one mass and only the faces a player has actually
  // exposed get a bevel.
  it('packs open sides into a bitmask', () => {
    expect(edgeMask(false, false, false, false)).toBe(0);
    expect(edgeMask(true, false, false, false)).toBe(EdgeBit.Up);
    expect(edgeMask(false, true, false, false)).toBe(EdgeBit.Right);
    expect(edgeMask(false, false, true, false)).toBe(EdgeBit.Down);
    expect(edgeMask(false, false, false, true)).toBe(EdgeBit.Left);
    expect(edgeMask(true, true, true, true)).toBe(EDGE_MASKS - 1);
  });

  it('gives every combination of open sides its own mask', () => {
    const seen = new Set<number>();
    for (const up of [false, true]) {
      for (const right of [false, true]) {
        for (const down of [false, true]) {
          for (const left of [false, true]) seen.add(edgeMask(up, right, down, left));
        }
      }
    }
    expect(seen.size).toBe(EDGE_MASKS);
    for (const mask of seen) expect(mask).toBeLessThan(EDGE_MASKS);
  });

  it('lays frames out left to right, then top to bottom', () => {
    expect(sheetCell(0, 8)).toEqual({ col: 0, row: 0 });
    expect(sheetCell(7, 8)).toEqual({ col: 7, row: 0 });
    expect(sheetCell(8, 8)).toEqual({ col: 0, row: 1 });
    expect(sheetCell(19, 8)).toEqual({ col: 3, row: 2 });
    // Degenerate inputs must still land inside the sheet.
    expect(sheetCell(3, 0)).toEqual({ col: 0, row: 3 });
    expect(sheetCell(-2, 4)).toEqual({ col: 0, row: 0 });
  });
});

describe('lampCone', () => {
  // The lamp is on the miner's helmet, so it leads them. Getting the offset
  // wrong either leaves the miner standing in their own shadow or pushes the
  // pool of light off them entirely.
  it('pushes the light the way the miner is facing', () => {
    const right = lampCone(100, 100, 1, 4, 32);
    const left = lampCone(100, 100, -1, 4, 32);
    expect(right.x).toBeGreaterThan(100);
    expect(left.x).toBeLessThan(100);
    expect(right.x - 100).toBeCloseTo(100 - left.x, 6);
  });

  it('keeps the miner well inside the lit pool', () => {
    const cone = lampCone(0, 0, 1, 4, 32);
    expect(Math.abs(cone.x)).toBeLessThan(cone.radiusX * 32);
    expect(Math.abs(cone.y)).toBeLessThan(cone.radiusY * 32);
  });

  it('stretches the cone along the direction of travel', () => {
    const cone = lampCone(0, 0, 1, 4, 32);
    expect(cone.radiusX).toBeGreaterThan(cone.radiusY);
    expect(cone.radiusY).toBe(4);
    // A zero stretch is a plain round lamp centred on the miner's head.
    const round = lampCone(50, 50, -1, 3, 32, 0);
    expect(round.x).toBe(50);
    expect(round.radiusX).toBe(round.radiusY);
  });

  it('treats a zero facing as looking right rather than collapsing', () => {
    expect(lampCone(0, 0, 0, 4, 32).x).toBeGreaterThan(0);
  });
});

describe('ambient drift', () => {
  it('wraps a mote back into the view instead of losing it', () => {
    expect(wrap(5, 4)).toBe(1);
    expect(wrap(-1, 4)).toBe(3);
    expect(wrap(3, 4)).toBe(3);
    expect(wrap(2, 0)).toBe(0);
    expect(wrap(-9, 4)).toBe(3);
  });

  it('drifts within its amplitude and never repeats on a short loop', () => {
    for (let t = 0; t < 20000; t += 250) {
      expect(Math.abs(drift(0.7, t, 6))).toBeLessThanOrEqual(6.000001);
    }
    expect(drift(0.7, 0, 6)).not.toBeCloseTo(drift(0.7, 6800, 6), 3);
    expect(drift(0, 0, 6)).toBe(0);
  });
});

describe('valueNoise', () => {
  const lattice = (index: number): number => ((index * 2654435761) % 1000) / 1000;
  const noise = valueNoise(6, 4, lattice);

  // Regression: the soil samples one cell up and to the left to work out its
  // slope, so the very first column asks the lattice for cell -1. When that
  // lookup was not wrapped it read past the start of the array, and the
  // undefined corner turned the pixel colour into NaN -- which painted as a
  // dark seam down the left edge of every dirt tile in the cave.
  it('is finite for negative and out-of-range coordinates', () => {
    for (const [x, y] of [[-1, -1], [-7, 3], [3, -9], [999, 999], [-0.5, -0.5]]) {
      expect(Number.isFinite(noise(x, y))).toBe(true);
    }
  });

  it('stays inside the range of its lattice', () => {
    for (let y = -8; y < 40; y += 1) {
      for (let x = -8; x < 40; x += 1) {
        const value = noise(x, y);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it('wraps, so a sheet of it tiles without a seam', () => {
    const period = 6 * 4;
    for (let i = 0; i < 12; i += 1) {
      expect(noise(i, 3)).toBeCloseTo(noise(i + period, 3), 10);
      expect(noise(3, i)).toBeCloseTo(noise(3, i + period), 10);
      expect(noise(i, i)).toBeCloseTo(noise(i - period, i - period), 10);
    }
  });

  it('interpolates between lattice corners rather than snapping', () => {
    const a = noise(0, 0);
    const b = noise(4, 0);
    const mid = noise(2, 0);
    expect(mid).toBeGreaterThanOrEqual(Math.min(a, b));
    expect(mid).toBeLessThanOrEqual(Math.max(a, b));
    // A lattice corner samples exactly, so the noise is continuous with it.
    expect(noise(4, 0)).toBeCloseTo(b, 10);
  });

  it('survives a degenerate lattice or spacing', () => {
    const flat = valueNoise(0, 0, () => 0.5);
    expect(flat(3, 7)).toBeCloseTo(0.5, 10);
    expect(Number.isFinite(flat(-4, -4))).toBe(true);
  });
});

describe('a viewport that is not a whole number of cells', () => {
  // The canvas matches the window's aspect ratio exactly, so the last column
  // and row on screen are usually partial. Everything here works in fractional
  // cells; rounding up would make the camera believe the view is wider than it
  // is and stop it short of the cave's right and bottom edges.
  const partial = { widthTiles: 20.4, heightTiles: 12.7 };
  const viewW = partial.widthTiles * TILE_SIZE;
  const viewH = partial.heightTiles * TILE_SIZE;

  it('lets the camera reach the far edge of the cave exactly', () => {
    const far = cameraTarget(CAVE_WIDTH - 1, CAVE_HEIGHT - 1, CAVE_WIDTH, CAVE_HEIGHT, 1e9, 1e9, partial);
    expect(far.x).toBeCloseTo(CAVE_WIDTH * TILE_SIZE - viewW, 6);
    expect(far.y).toBeCloseTo(CAVE_HEIGHT * TILE_SIZE - viewH, 6);
    // The last column of the cave is genuinely on screen at that scroll.
    expect(far.x + viewW).toBeCloseTo(CAVE_WIDTH * TILE_SIZE, 6);
  });

  it('still refuses to show anything before the first cell', () => {
    const near = cameraTarget(0, 0, CAVE_WIDTH, CAVE_HEIGHT, -1e9, -1e9, partial);
    expect(near.x).toBe(0);
    expect(near.y).toBe(0);
  });

  it('centres a cave smaller than the view on the fractional axis', () => {
    const small = cameraTarget(1, 1, 8, 4, 0, 0, partial);
    expect(small.x).toBeCloseTo((8 * TILE_SIZE - viewW) / 2, 6);
    expect(small.y).toBeCloseTo((4 * TILE_SIZE - viewH) / 2, 6);
  });

  it('draws the partly visible column and row at the far edge', () => {
    const scrollX = 3.5 * TILE_SIZE;
    const range = visibleTiles(scrollX, 0, CAVE_WIDTH, CAVE_HEIGHT, partial);
    // The right edge of the view falls inside this cell, so it must be drawn.
    const lastVisible = Math.floor((scrollX + viewW) / TILE_SIZE);
    expect(range.maxX).toBeGreaterThanOrEqual(lastVisible);
    expect(range.minX).toBeLessThanOrEqual(Math.floor(scrollX / TILE_SIZE));
  });
});
