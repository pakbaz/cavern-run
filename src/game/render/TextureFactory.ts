import Phaser from 'phaser';

import { PALETTES, TILE_SIZE, type CavePalette } from '../../config';
import { EDGE_MASKS, EdgeBit, mixColor, shade, sheetCell, toCss, valueNoise } from './renderMath';

/**
 * Every pixel of Cavern Run's artwork is generated at boot.
 *
 * Sprites are authored at 16x16 logical pixels and blown up to `TILE_SIZE`, so
 * the result is honest chunky pixel art rather than a smooth vector drawing.
 * Palette-dependent surfaces (dirt, brick, steel, boulders, the backdrop) are
 * baked once per palette instead of being tinted at draw time, which keeps the
 * highlights and bevels readable no matter how dark the cave is.
 *
 * The lighting model is consistent across every sprite in the game, because
 * that is what makes a screenful of separately-drawn tiles look like one
 * scene: a key light up and to the left, a cool bounce from the lower right,
 * ambient occlusion where a shape meets its own base, and a dark contact edge
 * on the bottom and right of anything solid.
 */

/** Logical resolution every sprite is authored at. */
export const ART_SIZE = 16;
/** Logical resolution of the tiling parallax strata behind the cave. */
export const STRATA_SIZE = 64;
const SCALE = TILE_SIZE / ART_SIZE;

/** Direction of the key light, as a unit-ish vector in screen space. */
const KEY_LIGHT = { x: -0.56, y: -0.62, z: 0.55 };
/** Direction of the cool bounce that keeps shadow sides from going flat. */
const FILL_LIGHT = { x: 0.62, y: 0.48, z: 0.62 };

export const TextureKey = {
  backdrop: (palette: string) => `cr.bg.${palette}`,
  strataFar: (palette: string) => `cr.strata.far.${palette}`,
  strataNear: (palette: string) => `cr.strata.near.${palette}`,
  dirt: (palette: string, variant: number) => `cr.dirt.${palette}.${variant}`,
  wall: (palette: string) => `cr.wall.${palette}`,
  steel: (palette: string) => `cr.steel.${palette}`,
  boulder: (palette: string) => `cr.boulder.${palette}`,
  magicWallIdle: (palette: string) => `cr.magic.${palette}`,
  magicWallActive: (frame: number) => `cr.magicOn.${frame}`,
  magicWallSpent: (palette: string) => `cr.magicOff.${palette}`,
  expandingWall: (palette: string, axis: string) => `cr.expand.${palette}.${axis}`,
  exitClosed: (palette: string) => `cr.exit.${palette}`,
  exitOpen: (frame: number) => `cr.exitOpen.${frame}`,

  diamond: (frame: number) => `cr.diamond.${frame}`,
  slime: (frame: number) => `cr.slime.${frame}`,
  amoeba: (frame: number) => `cr.amoeba.${frame}`,
  firefly: (frame: number) => `cr.firefly.${frame}`,
  butterfly: (frame: number) => `cr.butterfly.${frame}`,
  playerIdle: (frame: number) => `cr.player.idle.${frame}`,
  playerRun: (frame: number) => `cr.player.run.${frame}`,
  birth: (frame: number) => `cr.birth.${frame}`,
  boom: (frame: number) => `cr.boom.${frame}`,

  spark: 'cr.spark',
  dust: 'cr.dust',
  glow: 'cr.glow',
  shard: 'cr.shard',
  smoke: 'cr.smoke',
  mote: 'cr.mote',
  ring: 'cr.ring',
  shadow: 'cr.shadow',
  vignette: 'cr.vignette',

  /**
   * One sheet holding every carved-edge overlay, so a screenful of lit rock
   * faces draws in a single batch. Frames are addressed by `edgeFrame` and
   * `cavityFrame` below.
   */
  edges: 'cr.edges',
} as const;

/** How many chipped variants of each carved edge are baked. */
export const EDGE_TERRAIN_VARIANTS = 2;

function terrainFrameName(mask: number, variant: number): string {
  return `t${variant}_${mask}`;
}

/** Frame of the edge sheet that bevels rock with `mask` sides dug open. */
export function edgeFrame(mask: number, variant = 0): string {
  const safeMask = ((Math.trunc(mask) % EDGE_MASKS) + EDGE_MASKS) % EDGE_MASKS;
  const safeVariant =
    ((Math.trunc(variant) % EDGE_TERRAIN_VARIANTS) + EDGE_TERRAIN_VARIANTS) % EDGE_TERRAIN_VARIANTS;
  return terrainFrameName(safeMask, safeVariant);
}

/** Frame of the edge sheet that sinks an empty cell in behind `mask` walls. */
export function cavityFrame(mask: number): string {
  const safeMask = ((Math.trunc(mask) % EDGE_MASKS) + EDGE_MASKS) % EDGE_MASKS;
  return `c${safeMask}`;
}

export const DIAMOND_FRAMES = 8;
export const SLIME_FRAMES = 6;
export const AMOEBA_FRAMES = 6;
export const CREATURE_FRAMES = 6;
export const PLAYER_IDLE_FRAMES = 6;
export const PLAYER_RUN_FRAMES = 6;
export const BIRTH_FRAMES = 5;
export const BOOM_FRAMES = 7;
export const MAGIC_FRAMES = 6;
export const EXIT_FRAMES = 6;
export const DIRT_VARIANTS = 8;

/* ------------------------------------------------------------------ *
 * Painting
 * ------------------------------------------------------------------ */

/** Small deterministic PRNG so the generated art is identical every run. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A single sprite's canvas, addressed in logical pixels. */
class Painter {
  readonly canvas: HTMLCanvasElement;
  readonly size: number;
  private readonly ctx: CanvasRenderingContext2D;
  /** Which logical pixels are solid enough to count toward the silhouette. */
  private readonly solid: Uint8Array;

  constructor(size = ART_SIZE) {
    this.size = size;
    this.canvas = document.createElement('canvas');
    this.canvas.width = size * SCALE;
    this.canvas.height = size * SCALE;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Cavern Run needs a 2D canvas context to generate its artwork');
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
    this.solid = new Uint8Array(size * size);
  }

  px(x: number, y: number, color: number, alpha = 1): void {
    if (alpha <= 0 || x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = toCss(color);
    this.ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
    this.ctx.globalAlpha = 1;
    if (alpha >= 0.4) this.solid[Math.floor(y) * this.size + Math.floor(x)] = 1;
  }

  /**
   * A dark contour on the transparent pixels touching the sprite.
   *
   * Every creature and the miner get one. A cave is a busy, low-contrast
   * place, and a one-pixel contour is the difference between reading a shape
   * at a glance and having to work out what just moved.
   *
   * Only transparent pixels are painted, so the artwork underneath is never
   * eaten into: the silhouette grows outward instead.
   */
  contour(color = 0x05070d, alpha = 0.85, corners = true): void {
    const hits: Array<[number, number]> = [];
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) {
        if (this.solid[y * this.size + x]) continue;
        const touching =
          this.filled(x, y - 1) || this.filled(x, y + 1) || this.filled(x - 1, y) || this.filled(x + 1, y)
          || (corners
            && (this.filled(x - 1, y - 1) || this.filled(x + 1, y - 1)
              || this.filled(x - 1, y + 1) || this.filled(x + 1, y + 1)));
        if (touching) hits.push([x, y]);
      }
    }
    // Collected first, then painted: growing the silhouette while walking it
    // would let the contour spread across the whole sprite.
    for (const [x, y] of hits) this.px(x, y, color, alpha);
  }

  private filled(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return false;
    return this.solid[y * this.size + x] === 1;
  }

  fill(color: number, alpha = 1): void {
    this.rect(0, 0, this.size, this.size, color, alpha);
  }

  rect(x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
    for (let j = y; j < y + h; j += 1) for (let i = x; i < x + w; i += 1) this.px(i, j, color, alpha);
  }

  outline(x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
    for (let i = x; i < x + w; i += 1) {
      this.px(i, y, color, alpha);
      this.px(i, y + h - 1, color, alpha);
    }
    for (let j = y; j < y + h; j += 1) {
      this.px(x, j, color, alpha);
      this.px(x + w - 1, j, color, alpha);
    }
  }

  /** Filled disc, pixel-snapped so the edge stays chunky. */
  disc(cx: number, cy: number, r: number, color: number, alpha = 1): void {
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) this.px(x, y, color, alpha);
      }
    }
  }

  /** Filled ellipse; the workhorse behind shadows and creature bodies. */
  ellipse(cx: number, cy: number, rx: number, ry: number, color: number, alpha = 1): void {
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, color, alpha);
      }
    }
  }

  /** Solid rhombus, used for gems and creature cores. */
  rhombus(cx: number, cy: number, r: number, color: number, alpha = 1): void {
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) {
        if (Math.abs(x + 0.5 - cx) + Math.abs(y + 0.5 - cy) <= r) this.px(x, y, color, alpha);
      }
    }
  }

  /** Bresenham-ish line, for facet edges and cracks. */
  line(x0: number, y0: number, x1: number, y1: number, color: number, alpha = 1): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    if (steps === 0) {
      this.px(Math.round(x0), Math.round(y0), color, alpha);
      return;
    }
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      this.px(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), color, alpha);
    }
  }

  /** Paint a string-art sprite. `.` and ` ` are transparent. */
  stamp(rows: readonly string[], palette: Readonly<Record<string, number>>, dy = 0): void {
    for (let y = 0; y < rows.length; y += 1) {
      const row = rows[y];
      for (let x = 0; x < row.length; x += 1) {
        const color = palette[row[x]];
        if (color !== undefined) this.px(x, y + dy, color);
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Carved edges
 * ------------------------------------------------------------------ */

/**
 * The overlays that turn a grid of tiles into a dug-out cave.
 *
 * Rock is drawn as a mass: two neighbouring dirt tiles share no seam at all.
 * Only the faces a player has actually opened get treated, and they are
 * treated by which way they point under the game's one key light -- a bright
 * lip along the top, a softer one down the left, a dark contact edge on the
 * right, and the deepest shadow under an overhang.
 *
 * The matching cavity overlay sinks the empty cell itself into the rock, so a
 * fresh tunnel reads as a hole with depth rather than as a black square.
 */

/** Light that lands on an exposed face, per side of the tile. */
const FACE_LIGHT = 0xffeccd;
const FACE_SHADOW = 0x02040a;

/** Falloff of an edge treatment into the body of the tile. */
function faceRamp(depth: number, reach: number, peak: number): number {
  if (depth >= reach) return 0;
  const t = 1 - depth / reach;
  return peak * t * t;
}

function paintTerrainEdge(p: Painter, mask: number, variant: number): void {
  const rand = seeded(0x3d6e + mask * 131 + variant * 977);
  const last = p.size - 1;

  const up = (mask & EdgeBit.Up) !== 0;
  const right = (mask & EdgeBit.Right) !== 0;
  const down = (mask & EdgeBit.Down) !== 0;
  const left = (mask & EdgeBit.Left) !== 0;

  if (up) {
    // The lit lip of a floor, chipped along its length so a long shelf does
    // not read as a ruled line.
    for (let x = 0; x < p.size; x += 1) {
      const chip = rand() > 0.78 ? 1 : 0;
      for (let d = 0; d < 4; d += 1) {
        p.px(x, d + chip, FACE_LIGHT, faceRamp(d, 4, 0.5));
      }
      if (chip) p.px(x, 0, FACE_SHADOW, 0.35);
    }
  }

  if (left) {
    for (let y = 0; y < p.size; y += 1) {
      for (let d = 0; d < 3; d += 1) p.px(d, y, FACE_LIGHT, faceRamp(d, 3, 0.26));
    }
  }

  if (right) {
    for (let y = 0; y < p.size; y += 1) {
      for (let d = 0; d < 4; d += 1) p.px(last - d, y, FACE_SHADOW, faceRamp(d, 4, 0.42));
    }
  }

  if (down) {
    // An overhang: the darkest edge in the game, and the reason a boulder
    // hanging over a tunnel reads as a threat.
    for (let x = 0; x < p.size; x += 1) {
      const chip = rand() > 0.82 ? 1 : 0;
      for (let d = 0; d < 5; d += 1) p.px(x, last - d - chip, FACE_SHADOW, faceRamp(d, 5, 0.55));
    }
  }

  // Convex corners get knocked off, which is what stops a dug-out block from
  // reading as a perfect square.
  const bevel = (cx: number, cy: number, sx: number, sy: number, lit: boolean) => {
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3 - i; j += 1) {
        p.px(cx + sx * i, cy + sy * j, lit ? FACE_LIGHT : FACE_SHADOW, 0.3 - (i + j) * 0.07);
      }
    }
  };
  if (up && left) bevel(0, 0, 1, 1, true);
  if (up && right) bevel(last, 0, -1, 1, false);
  if (down && left) bevel(0, last, 1, -1, false);
  if (down && right) bevel(last, last, -1, -1, false);
}

function paintCavity(p: Painter, mask: number): void {
  const last = p.size - 1;
  const up = (mask & EdgeBit.Up) !== 0;
  const right = (mask & EdgeBit.Right) !== 0;
  const down = (mask & EdgeBit.Down) !== 0;
  const left = (mask & EdgeBit.Left) !== 0;

  // Ambient occlusion pressed in from every wall around the hole. The ceiling
  // is darkest, the floor lightest: light that reaches the tunnel at all is
  // coming down into it.
  if (up) for (let x = 0; x < p.size; x += 1) {
    for (let d = 0; d < 7; d += 1) p.px(x, d, FACE_SHADOW, faceRamp(d, 7, 0.62));
  }
  if (left) for (let y = 0; y < p.size; y += 1) {
    for (let d = 0; d < 5; d += 1) p.px(d, y, FACE_SHADOW, faceRamp(d, 5, 0.34));
  }
  if (right) for (let y = 0; y < p.size; y += 1) {
    for (let d = 0; d < 5; d += 1) p.px(last - d, y, FACE_SHADOW, faceRamp(d, 5, 0.38));
  }
  if (down) for (let x = 0; x < p.size; x += 1) {
    for (let d = 0; d < 4; d += 1) p.px(x, last - d, FACE_SHADOW, faceRamp(d, 4, 0.2));
  }
}

/**
 * Bake every edge overlay into one sheet.
 *
 * Terrain masks occupy the first rows, cavity masks the rest. Sharing a
 * texture means the hundreds of overlays on screen cost a single draw batch.
 */
function registerEdgeSheet(scene: Phaser.Scene): void {
  if (scene.textures.exists(TextureKey.edges)) return;

  const columns = 8;
  const rows = (EDGE_MASKS / columns) * (1 + EDGE_TERRAIN_VARIANTS);
  const cell = ART_SIZE * SCALE;
  const sheet = document.createElement('canvas');
  sheet.width = columns * cell;
  sheet.height = rows * cell;
  const ctx = sheet.getContext('2d');
  if (!ctx) throw new Error('Cavern Run needs a 2D canvas context to generate its artwork');
  ctx.imageSmoothingEnabled = false;

  const frames: Array<{ name: string; col: number; row: number }> = [];
  let slot = 0;
  const place = (name: string, paint: (p: Painter) => void) => {
    const { col, row } = sheetCell(slot, columns);
    const painter = new Painter();
    paint(painter);
    ctx.drawImage(painter.canvas, col * cell, row * cell);
    frames.push({ name, col, row });
    slot += 1;
  };

  for (let variant = 0; variant < EDGE_TERRAIN_VARIANTS; variant += 1) {
    for (let mask = 0; mask < EDGE_MASKS; mask += 1) {
      place(terrainFrameName(mask, variant), (p) => paintTerrainEdge(p, mask, variant));
    }
  }
  for (let mask = 0; mask < EDGE_MASKS; mask += 1) {
    place(cavityFrame(mask), (p) => paintCavity(p, mask));
  }

  const texture = scene.textures.addCanvas(TextureKey.edges, sheet);
  if (!texture) return;
  for (const frame of frames) {
    texture.add(frame.name, 0, frame.col * cell, frame.row * cell, cell, cell);
  }
}

/* ------------------------------------------------------------------ *
 * Backdrop and parallax strata
 * ------------------------------------------------------------------ */

/**
 * The rock face behind the cave: what you are looking at down a tunnel you
 * just dug.
 *
 * This one 32px sheet repeats across the whole cave, so everything in it is
 * either noise or low-contrast detail. A recognisable feature here would tile
 * into wallpaper the moment two cells of tunnel sat side by side.
 */
function paintBackdrop(p: Painter, palette: CavePalette): void {
  const rand = seeded(0xbeef);
  const deep = mixColor(palette.background, 0x000000, 0.25);
  const damp = mixColor(palette.background, palette.fog, 0.45);

  for (let y = 0; y < p.size; y += 1) {
    for (let x = 0; x < p.size; x += 1) {
      // Diagonal bedding planes: the rock behind was laid down in layers, and
      // a tunnel cuts across them.
      const bed = Math.sin((x * 0.6 + y * 1.35) * 0.55) * 0.5 + 0.5;
      let color = mixColor(deep, damp, bed * 0.35);
      const n = rand();
      if (n > 0.955) color = shade(color, 0.22);
      else if (n < 0.05) color = shade(color, -0.3);
      p.px(x, y, color);
    }
  }

  // Chisel scars, left by whoever was down here first.
  for (let i = 0; i < 5; i += 1) {
    const x = Math.floor(rand() * p.size);
    const y = Math.floor(rand() * p.size);
    const len = 2 + Math.floor(rand() * 3);
    for (let j = 0; j < len; j += 1) {
      p.px((x + j) % p.size, (y + j) % p.size, shade(deep, -0.45), 0.6);
      p.px((x + j) % p.size, (y + j + 1) % p.size, mixColor(damp, palette.accent, 0.12), 0.22);
    }
  }

  // A handful of mineral glints, so the dark still has something in it.
  for (let i = 0; i < 3; i += 1) {
    p.px(
      Math.floor(rand() * p.size),
      Math.floor(rand() * p.size),
      mixColor(palette.fog, palette.accent, 0.5),
      0.3,
    );
  }
}

/**
 * The far parallax layer: broad folded rock bands with mineral veins running
 * through them.
 *
 * Everything here is built from sines whose periods divide the texture width,
 * so the sheet tiles seamlessly however far the camera scrolls -- a band that
 * did not meet itself at the seam would strobe across the screen every time
 * the player walked a screen's width.
 */
function paintStrataFar(p: Painter, palette: CavePalette): void {
  const size = p.size;
  const tau = Math.PI * 2;
  const lit = shade(palette.fog, 0.55);
  // Angular frequency of n whole cycles across the sheet: every term built
  // from this wraps exactly, in both axes.
  const k = (n: number) => (tau * n) / size;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const fold =
        Math.sin(u * tau + Math.sin(k(1) * y) * 0.9) * 0.7 +
        Math.sin(u * tau * 2 - Math.sin(k(2) * y) * 0.6) * 0.3;
      const band = Math.sin(k(2) * y + fold * 2.2) * 0.5 + 0.5;
      // Aerial perspective, as a wave rather than a ramp so the sheet still
      // meets itself top to bottom.
      const depth = 0.78 + Math.sin(k(1) * y + 1.2) * 0.22;
      p.px(x, y, mixColor(palette.background, lit, (0.26 + band * 0.74) * depth));
    }
  }

  // Mineral veins. Each is a periodic wobble so it rejoins itself at the seam.
  // Kept faint: the sheet repeats several times across a wide screen, and a
  // bright line would read as a scribble tiled across the wall.
  const rand = seeded(0x5713a);
  for (let v = 0; v < 5; v += 1) {
    const baseY = 6 + rand() * (size - 12);
    const amp = 3 + rand() * 6;
    const freq = 1 + Math.floor(rand() * 3);
    const phase = rand() * tau;
    const bright = 0.16 + rand() * 0.2;
    for (let x = 0; x < size; x += 1) {
      const y = Math.round(baseY + Math.sin((x / size) * tau * freq + phase) * amp);
      p.px(x, y, mixColor(palette.fog, palette.accent, bright), 0.34);
      p.px(x, y + 1, mixColor(palette.background, palette.accent, bright * 0.4), 0.2);
    }
  }
}

/**
 * The near parallax layer: dark rock outcrops drawn onto transparency, so they
 * composite over the far sheet and drift faster than it. Deliberately soft and
 * blobby rather than a silhouette — a hard edge tiling across the screen reads
 * as a repeating pattern, while a soft mass just reads as more cave.
 *
 * The field is built from sines whose periods divide the sheet, so it wraps in
 * both axes without a seam.
 */
function paintStrataNear(p: Painter, palette: CavePalette): void {
  const size = p.size;
  const tau = Math.PI * 2;
  const body = mixColor(palette.background, palette.fog, 0.5);
  const lip = mixColor(body, palette.accent, 0.14);

  const field = (x: number, y: number) => {
    const u = (x / size) * tau;
    const v = (y / size) * tau;
    return (
      Math.sin(u + Math.sin(v * 2) * 0.8) * 0.45 +
      Math.sin(v * 2 + Math.sin(u * 3) * 0.6) * 0.35 +
      Math.sin(u * 3 + v) * 0.2
    );
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const here = field(x, y);
      if (here <= 0.1) continue;
      // Alpha ramps with depth into the mass, so the boundary dissolves.
      const solid = Math.min(1, (here - 0.1) / 0.6);
      const above = field(x, y - 1);
      const edge = above <= 0.1;
      p.px(x, y, edge ? lip : body, (edge ? 0.4 : 0.24) + solid * 0.4);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Surfaces
 * ------------------------------------------------------------------ */

/**
 * Soil.
 *
 * The hard part of dirt is that there is a great deal of it on screen at once,
 * every cell of it is the same 32 pixels repeated, and it has to stay quiet
 * enough that a boulder, a gem or a miner standing on it is the thing your eye
 * goes to. An earlier version was per-pixel noise over a flat brown, which
 * from a distance read as television static and, worse, tiled into a visible
 * lattice of identical flecks.
 *
 * So this is built as a material instead: broad clods of packed earth picked
 * out by where they catch the light, a scatter of small stones with real tops
 * and undersides, and only the occasional mineral glint. The contrast within
 * a tile is deliberately narrow -- the interest comes from the shapes, not
 * from the range -- and the renderer flips and tints each cell so no two
 * neighbours are the same sheet.
 */
function paintDirt(p: Painter, palette: CavePalette, variant: number): void {
  const rand = seeded(0x1000 + variant * 977);

  // Value noise: a coarse lattice of random values, smoothly interpolated, so
  // the soil breaks into clods a few pixels across rather than into confetti.
  const grid = 4;
  const cells = Math.ceil(p.size / grid) + 2;
  const corners: number[] = [];
  for (let i = 0; i < cells * cells; i += 1) corners.push(rand());
  const clod = valueNoise(cells, grid, (index) => corners[index]);

  const body = mixColor(palette.dirt, palette.dirtDark, 0.42);
  const lit = mixColor(palette.dirtLight, palette.dirt, 0.5);

  for (let y = 0; y < p.size; y += 1) {
    for (let x = 0; x < p.size; x += 1) {
      const here = clod(x, y);
      // Shade each clod by its own slope: where the surface falls away from
      // the key light it darkens, which is what gives packed earth its tooth.
      // The slope is kept gentle -- pushed hard it stops reading as soil and
      // starts reading as wood grain.
      const slope = clod(x - 1, y - 1) - here;
      let color = mixColor(body, lit, Math.max(0, Math.min(1, here * 0.6 + slope * 1.05)));
      if (slope < -0.16) color = mixColor(color, palette.dirtDark, 0.4);
      // A whisper of grain over the top: enough tooth to look like earth at
      // arm's length, far too little to read as noise.
      const speck = rand();
      if (speck > 0.9) color = shade(color, 0.05);
      else if (speck < 0.1) color = shade(color, -0.06);
      p.px(x, y, color);
    }
  }

  // Stones caught in the soil: a lit cap over a dark body with a contact
  // shadow, which is what tells the eye it is a solid thing in the earth
  // rather than a smudge on it. Two per tile at most -- any more and a wall of
  // dirt reads as gravel, and gravel competes with the boulders that matter.
  const stone = mixColor(palette.dirt, palette.rock, 0.28);
  for (let i = 0; i < 2; i += 1) {
    const x = 2 + Math.floor(rand() * (p.size - 5));
    const y = 2 + Math.floor(rand() * (p.size - 6));
    const w = rand() > 0.6 ? 3 : 2;
    p.rect(x, y, w, 2, shade(stone, -0.3));
    for (let i2 = 0; i2 < w; i2 += 1) p.px(x + i2, y, mixColor(stone, 0xffffff, 0.16));
    p.px(x, y, mixColor(stone, 0xffffff, 0.26));
    for (let i2 = 0; i2 < w; i2 += 1) p.px(x + i2, y + 2, shade(palette.dirtDark, -0.4), 0.55);
  }

  // One mineral glint per tile at most: the hint that there is something worth
  // digging for down here, without turning the wall into a starfield.
  if (variant % 2 === 0) {
    const x = 2 + Math.floor(rand() * (p.size - 4));
    const y = 2 + Math.floor(rand() * (p.size - 4));
    p.px(x, y, mixColor(palette.dirtLight, palette.accent, 0.6), 0.75);
    p.px(x + 1, y + 1, mixColor(palette.dirtDark, palette.accent, 0.35), 0.35);
  }

  // A hairline crack, wandering. Undug soil is one continuous mass -- the tile
  // borders live in the carved-edge overlays -- so this is what keeps a wall
  // of it from reading as one flat sheet of colour.
  let cx = Math.floor(rand() * p.size);
  let cy = Math.floor(rand() * p.size);
  for (let step = 0; step < 7; step += 1) {
    p.px(cx, cy, shade(palette.dirtDark, -0.3), 0.45);
    p.px(cx, cy + 1, mixColor(palette.dirtLight, palette.dirt, 0.5), 0.14);
    cx = (cx + (rand() > 0.4 ? 1 : 0)) % p.size;
    cy = (cy + (rand() > 0.65 ? 1 : 0)) % p.size;
  }
}

/**
 * Masonry. Two courses of chunky bricks with a genuine bevel: a bright top and
 * left, a dark bottom and right, and a recessed mortar channel between them.
 */
function paintBrick(p: Painter, palette: CavePalette): void {
  const mortar = shade(palette.wallDark, -0.25);
  const rand = seeded(0x8114c2);
  p.fill(mortar);

  const courses = [
    { y: 0, offset: 0 },
    { y: 8, offset: 4 },
  ];

  for (const { y, offset } of courses) {
    for (let x = -8; x < p.size; x += 8) {
      const bx = x + offset;
      const w = 7;
      const h = 7;

      // Body, with a vertical gradient so the brick is lit from above.
      for (let j = 0; j < h; j += 1) {
        const t = j / (h - 1);
        const row = mixColor(shade(palette.wall, 0.12), shade(palette.wall, -0.2), t);
        for (let i = 0; i < w; i += 1) {
          const weather = rand();
          p.px(
            bx + i,
            y + j,
            weather > 0.9 ? shade(row, 0.12) : weather < 0.1 ? shade(row, -0.14) : row,
          );
        }
      }

      // Bevel.
      for (let i = 0; i < w; i += 1) {
        p.px(bx + i, y, palette.wallLight);
        p.px(bx + i, y + h - 1, shade(palette.wallDark, -0.15));
      }
      for (let j = 0; j < h; j += 1) {
        p.px(bx, y + j, mixColor(palette.wallLight, palette.wall, 0.35));
        p.px(bx + w - 1, y + j, palette.wallDark);
      }
      p.px(bx, y, mixColor(palette.wallLight, 0xffffff, 0.3));
      p.px(bx + w - 1, y + h - 1, shade(palette.wallDark, -0.4));
    }
  }
}

/**
 * Indestructible plate. A heavy outer frame, a recessed inner face, four
 * rivets, and a seam in the cave's accent colour so steel never gets confused
 * with a boulder at a glance.
 */
function paintSteel(p: Painter, palette: CavePalette): void {
  const rand = seeded(0x51ee1);

  for (let y = 0; y < p.size; y += 1) {
    for (let x = 0; x < p.size; x += 1) {
      const t = y / (p.size - 1);
      const base = mixColor(shade(palette.steel, 0.1), shade(palette.steel, -0.16), t);
      const brush = rand();
      p.px(x, y, brush > 0.88 ? shade(base, 0.1) : brush < 0.12 ? shade(base, -0.1) : base);
    }
  }

  // Outer frame: two pixels of bevel on every side.
  for (let i = 0; i < p.size; i += 1) {
    p.px(i, 0, palette.steelLight);
    p.px(0, i, palette.steelLight);
    p.px(i, 1, palette.steelLight, 0.4);
    p.px(1, i, palette.steelLight, 0.4);
    p.px(i, p.size - 1, shade(palette.steelDark, -0.3));
    p.px(p.size - 1, i, shade(palette.steelDark, -0.3));
    p.px(i, p.size - 2, palette.steelDark, 0.55);
    p.px(p.size - 2, i, palette.steelDark, 0.55);
  }

  // Recessed inner face.
  p.outline(3, 3, 10, 10, palette.steelDark, 0.75);
  for (let i = 4; i < 12; i += 1) {
    p.px(i, 4, palette.steelLight, 0.3);
    p.px(4, i, palette.steelLight, 0.22);
  }

  // Rivets.
  for (const [rx, ry] of [
    [2, 2],
    [12, 2],
    [2, 12],
    [12, 12],
  ]) {
    p.rect(rx, ry, 2, 2, shade(palette.steelDark, -0.2));
    p.px(rx, ry, mixColor(palette.steelLight, 0xffffff, 0.4));
  }

  // Accent seam across the middle of the plate.
  for (let x = 5; x < 11; x += 1) p.px(x, 8, mixColor(palette.steelDark, palette.accent, 0.35), 0.7);
}

/**
 * A boulder.
 *
 * Shaded as a real sphere: a broad key highlight up and to the left, a cool
 * bounce along the lower right so the shadow side is not dead, a dark rim all
 * the way round, and an occlusion crescent at the base. Mineral flecks in the
 * cave's accent colour tie it to the palette without tinting the whole rock.
 */
function paintBoulder(p: Painter, palette: CavePalette): void {
  // Boulders are cooler and lighter than the soil around them, because the
  // single most common mistake a player can make is not noticing a rock
  // sitting in the dirt above them. The cooling is deliberately slight: each
  // cave's stone is one of the things that tells its palette apart, and a
  // heavier hand turns every boulder in the game the same blue-grey.
  const base = mixColor(palette.rock, 0x8fa2c4, 0.06);
  const light = shade(base, 0.44);
  const dark = shade(base, -0.6);
  const rim = shade(base, -0.78);
  const bounce = mixColor(shade(base, -0.15), palette.accent, 0.3);
  const rand = seeded(0xb0d1);

  const cx = 8;
  const cy = 8.2;
  const r = 7.4;

  // The silhouette is a lumpy stone rather than a marble: three low harmonics
  // knock the circle out of true, which is the difference between a boulder
  // and a ball bearing.
  const radiusAt = (angle: number): number =>
    r * (1 + Math.sin(angle * 3 + 0.7) * 0.055 + Math.sin(angle * 5 - 1.9) * 0.04);

  // Ten flat planes, not a sphere.
  //
  // Five wedges around the rock, split into an inner crown and an outer skirt
  // and offset from each other so the joins do not all radiate from the
  // centre like a pie chart. Each plane is lit once, by the direction it
  // faces, and painted flat -- so the boundaries between planes become the
  // chisel edges, and the rock reads as something broken off a wall rather
  // than something inflated.
  const SECTORS = 5;
  const facetNormal = (angle: number, outer: boolean): { key: number; fill: number } => {
    const turn = (angle + Math.PI) / (Math.PI * 2);
    const sector = Math.floor(turn * SECTORS + (outer ? 0 : 0.5));
    const centre = ((sector + 0.5) / SECTORS) * Math.PI * 2 - Math.PI;
    // The skirt tilts away from the viewer; the crown is close to face-on.
    const tilt = outer ? 0.86 : 0.42;
    const nx = Math.cos(centre) * tilt;
    const ny = Math.sin(centre) * tilt;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    return {
      key: Math.max(0, nx * KEY_LIGHT.x + ny * KEY_LIGHT.y + nz * KEY_LIGHT.z),
      fill: Math.max(0, nx * FILL_LIGHT.x + ny * FILL_LIGHT.y + nz * FILL_LIGHT.z),
    };
  };

  for (let y = 0; y < p.size; y += 1) {
    for (let x = 0; x < p.size; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const edge = radiusAt(angle);
      if (d > edge) continue;

      const outer = d > edge * 0.5;
      const { key, fill } = facetNormal(angle, outer);
      let color = mixColor(dark, light, Math.pow(key, 0.85));
      color = mixColor(color, bounce, Math.pow(fill, 2.2) * 0.45);

      // Occlusion crescent where the rock meets whatever it rests on.
      if (dy > r * 0.3) color = mixColor(color, rim, ((dy - r * 0.3) / (r * 0.7)) * 0.55);
      // A hard dark rim, one pixel wide, all the way round.
      if (d > edge - 1.15) color = mixColor(color, rim, 0.85);
      // A dark seam where the crown meets the skirt.
      else if (Math.abs(d - edge * 0.5) < 0.6) color = shade(color, -0.16);

      // Grain in the mid-tones only: noise in a highlight is what made the
      // last version of this rock look out of focus.
      if (rand() > 0.94) color = shade(color, -0.07);
      p.px(x, y, color);
    }
  }

  // Cracks: two strokes following the curve, each with a lit lower lip so it
  // reads as a split in the surface rather than a scratch on it.
  p.line(5, 10, 8, 12, shade(dark, -0.45), 0.85);
  p.line(8, 12, 11, 11, shade(dark, -0.45), 0.7);
  p.line(5, 11, 8, 13, shade(light, -0.2), 0.35);
  p.line(10, 4, 12, 7, shade(dark, -0.4), 0.6);
  p.line(11, 4, 13, 7, shade(light, -0.25), 0.22);

  // Mineral flecks, tying the rock to the cave it came out of.
  for (let i = 0; i < 3; i += 1) {
    const a = rand() * Math.PI * 2;
    const d = rand() * (r - 2.5);
    p.px(
      Math.round(cx + Math.cos(a) * d - 0.5),
      Math.round(cy + Math.sin(a) * d - 0.5),
      mixColor(light, palette.accent, 0.5),
      0.55,
    );
  }

  // Specular: a hard core with a tight skirt. Polished stone, and the thing
  // that tells you at a glance which way the cave is lit.
  p.rect(5, 4, 2, 2, mixColor(light, 0xffffff, 0.5));
  p.px(4, 5, mixColor(light, 0xffffff, 0.3), 0.85);
  p.px(7, 4, mixColor(light, 0xffffff, 0.3), 0.75);
  p.px(5, 6, mixColor(light, 0xffffff, 0.2), 0.55);
  p.px(7, 3, mixColor(light, 0xffffff, 0.16), 0.45);

  // A contour on the transparent side of the edge, so the stone still has a
  // silhouette when it is sitting on soil of a similar value.
  p.contour(0x05070c, 0.55, false);
}

/* ------------------------------------------------------------------ *
 * Collectibles and hazards
 * ------------------------------------------------------------------ */

const GEM_DEEP = 0x0a3f6e;
const GEM_MID = 0x1f9ad6;
const GEM_LIGHT = 0x9df0ff;
const GEM_WHITE = 0xf2ffff;

/**
 * A brilliant-cut diamond.
 *
 * The silhouette is the classic gem outline: a flat table across the top, a
 * crown that flares out to the girdle a third of the way down, and a pavilion
 * tapering to a point. Facets are shaded by which way they face rather than by
 * distance from the centre, so the stone catches the light like cut glass, and
 * a highlight plus a four-point star sweep round it across eight frames.
 */
function paintDiamond(p: Painter, frame: number): void {
  const cx = 8;
  const girdle = 7.2;
  const tableTop = 3;
  const girdleY = 7;
  const tip = 15;

  const halfWidthAt = (y: number): number => {
    if (y < tableTop) return 0;
    if (y <= girdleY) return 2.6 + ((y - tableTop) / (girdleY - tableTop)) * (girdle - 2.6);
    return girdle * (1 - (y - girdleY) / (tip - girdleY));
  };

  for (let y = 0; y < p.size; y += 1) {
    const half = halfWidthAt(y + 0.5);
    if (half <= 0) continue;
    for (let x = 0; x < p.size; x += 1) {
      const dx = x + 0.5 - cx;
      if (Math.abs(dx) > half) continue;

      const crown = y < girdleY;
      // Facet index across the stone; the alternation is what makes the
      // surface break the light into wedges instead of one smooth gradient.
      const wedge = Math.abs(Math.round(dx / 2.1)) % 2;
      const across = 1 - Math.abs(dx) / Math.max(0.8, half);

      let level = crown ? 0.58 + across * 0.3 : 0.2 + across * 0.42;
      if (wedge === 1) level -= 0.16;
      if (dx < 0) level += 0.1;
      if (y < tableTop + 1) level += 0.25;
      if (Math.abs(dx) > half - 1.1) level -= 0.22;

      p.px(x, y, mixColor(GEM_DEEP, GEM_MID, Math.max(0, Math.min(1, level))));
    }
  }

  // Table facet, then the crown edges radiating down from its corners.
  for (let x = cx - 3; x < cx + 3; x += 1) p.px(x, tableTop, mixColor(GEM_LIGHT, GEM_WHITE, 0.55));
  for (let x = cx - 3; x < cx + 3; x += 1) p.px(x, tableTop + 1, GEM_LIGHT, 0.7);
  p.line(cx - 3, tableTop, cx - 7, girdleY, mixColor(GEM_MID, GEM_LIGHT, 0.55), 0.85);
  p.line(cx + 2, tableTop, cx + 6, girdleY, mixColor(GEM_MID, GEM_LIGHT, 0.4), 0.75);
  p.line(cx - 1, tableTop, cx - 1, girdleY, mixColor(GEM_MID, GEM_LIGHT, 0.3), 0.5);
  p.line(cx, tableTop, cx, girdleY, mixColor(GEM_MID, GEM_LIGHT, 0.3), 0.5);

  // Girdle: the bright band where crown meets pavilion.
  for (let x = 0; x < p.size; x += 1) {
    if (Math.abs(x + 0.5 - cx) <= girdle) p.px(x, girdleY, mixColor(GEM_MID, GEM_WHITE, 0.5), 0.9);
  }

  // Pavilion facets converging on the point.
  p.line(cx - 6, girdleY + 1, cx - 1, tip - 1, mixColor(GEM_DEEP, GEM_LIGHT, 0.45), 0.6);
  p.line(cx + 5, girdleY + 1, cx, tip - 1, mixColor(GEM_DEEP, GEM_LIGHT, 0.3), 0.45);
  p.px(cx - 1, tip - 1, GEM_LIGHT, 0.8);

  // A highlight that sweeps around the stone, one step per frame, with a
  // four-point star flare on the two brightest frames.
  const sweep = [
    [5, 4],
    [9, 4],
    [11, 7],
    [9, 10],
    [7, 12],
    [5, 10],
    [3, 7],
    [4, 5],
  ][frame % DIAMOND_FRAMES];
  const [sx, sy] = sweep;
  p.px(sx, sy, GEM_WHITE);
  p.px(sx + 1, sy, GEM_LIGHT, 0.85);
  p.px(sx, sy + 1, GEM_LIGHT, 0.7);
  p.px(sx - 1, sy, GEM_LIGHT, 0.5);

  if (frame % 4 === 0) {
    for (let i = 1; i <= 3; i += 1) {
      const a = 0.75 - i * 0.2;
      p.px(sx + i, sy, GEM_WHITE, a);
      p.px(sx - i, sy, GEM_WHITE, a);
      p.px(sx, sy + i, GEM_WHITE, a);
      p.px(sx, sy - i, GEM_WHITE, a);
    }
  }

  // A dark setting around the stone. Gems are the thing you are here for, and
  // a contour is what makes one read as a cut object sitting in a hole rather
  // than as a blue smudge on the dirt.
  p.contour(0x061426, 0.8, false);
}

/**
 * Slime: a sheet of cold, glassy ooze that heavy things sink through.
 *
 * Deliberately aqua rather than green. The amoeba is the green thing in this
 * game, and a player who confuses the wall that lets boulders through with the
 * blob that suffocates them is going to lose a life over it.
 */
function paintSlime(p: Painter, frame: number): void {
  const rand = seeded(0x51117e + frame * 31);
  const deep = 0x062a38;
  const base = 0x0f5a70;
  const bright = 0x4fd6e8;
  const wave = (x: number, y: number) =>
    Math.sin((x + frame * 1.4) * 0.62) * 0.5 + Math.cos((y - frame * 1.1) * 0.55) * 0.5;

  for (let y = 0; y < p.size; y += 1) {
    for (let x = 0; x < p.size; x += 1) {
      const n = wave(x, y);
      // Vertical banding: the sheet is running, not sitting.
      const run = Math.sin((y * 1.7 - frame * 2.2) * 0.4) * 0.12;
      p.px(x, y, mixColor(base, bright, 0.18 + n * 0.14 + run));
    }
  }

  // Bubbles rising through the goo.
  for (let i = 0; i < 7; i += 1) {
    const bx = 1 + Math.floor(rand() * (p.size - 3));
    const by = 1 + Math.floor(rand() * (p.size - 3));
    p.ellipse(bx + 1, by + 1, 1.7, 1.4, mixColor(bright, 0xffffff, 0.3), 0.6);
    p.px(bx, by, 0xd8ffff, 0.8);
    p.px(bx + 1, by + 2, deep, 0.35);
  }

  // A meniscus at the top and drips hanging off the bottom, so a slime ceiling
  // reads as something a boulder would sink through.
  for (let x = 0; x < p.size; x += 1) {
    p.px(x, 0, deep, 0.8);
    p.px(x, 1, mixColor(bright, 0xffffff, 0.55), 0.45);
  }
  for (let i = 0; i < 4; i += 1) {
    const dx = (i * 4 + frame) % p.size;
    const len = 2 + ((frame + i) % 4);
    for (let j = 0; j < len; j += 1) {
      p.px(dx, p.size - 1 - j, mixColor(deep, bright, 0.35 - j * 0.06), 0.8);
      p.px(dx + 1, p.size - 1 - j, deep, 0.4);
    }
  }
}

/**
 * The amoeba: a mass of cells with visible walls, pulsing on a six-frame loop.
 * The cell walls are what make it read as alive rather than as green static.
 */
function paintAmoeba(p: Painter, frame: number): void {
  const rand = seeded(0xa30e3a + frame * 613);
  const shell = 0x1d4a10;
  const body = 0x3d8f1f;
  const bright = 0x8ee83f;
  const nucleus = 0xe8ffd0;
  const pulse = Math.sin((frame / AMOEBA_FRAMES) * Math.PI * 2) * 0.5 + 0.5;

  p.fill(shell);

  // Cell centres drift on a slow orbit; every pixel takes the colour of the
  // nearest one, which gives Voronoi-ish blobs for the cost of a nested loop.
  const cells: Array<[number, number, number]> = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + frame * 0.26;
    const rad = 3.4 + rand() * 2.2;
    cells.push([8 + Math.cos(a) * rad, 8 + Math.sin(a) * rad, 3.4 + rand() * 1.6 + pulse * 0.6]);
  }

  for (let y = 0; y < p.size; y += 1) {
    for (let x = 0; x < p.size; x += 1) {
      let best = Infinity;
      let second = Infinity;
      let owner = 0;
      for (let i = 0; i < cells.length; i += 1) {
        const [cx, cy, r] = cells[i];
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r;
        if (d < best) {
          second = best;
          best = d;
          owner = i;
        } else if (d < second) second = d;
      }
      if (best > 0.6) continue;

      const wall = second - best < 0.9;
      const lift = Math.max(0, -best) / 3.5;
      p.px(
        x,
        y,
        wall ? shell : mixColor(body, bright, lift * 0.85 + (owner % 2) * 0.08 + pulse * 0.1),
      );
    }
  }

  // Nuclei.
  for (let i = 0; i < cells.length; i += 2) {
    const [cx, cy] = cells[i];
    p.px(Math.round(cx), Math.round(cy), nucleus, 0.9);
    p.px(Math.round(cx) + 1, Math.round(cy), bright, 0.7);
  }

  // A membrane around the whole colony, so its edge stays legible as it
  // creeps into a tunnel.
  p.contour(0x0a2508, 0.75);
}

/* ------------------------------------------------------------------ *
 * Creatures
 * ------------------------------------------------------------------ */

/**
 * A firefly: an ember-shelled thing with a molten core, four cutting blades
 * whirling round it, and two eyes that never blink.
 *
 * Hot, angular and unmistakably not a butterfly -- the two used to share a
 * silhouette, which made a cave full of both a guessing game at speed.
 */
function paintFirefly(p: Painter, frame: number): void {
  const halo = 0x5a1204;
  const shell = 0x3d0c05;
  const blade = 0xff7a2a;
  const bladeTip = 0xffd76a;
  const core = 0xf2481f;
  const hot = 0xfff0b0;
  const angle = (frame / CREATURE_FRAMES) * (Math.PI / 2);

  p.disc(8, 8, 7.2, halo, 0.3);
  p.disc(8, 8, 5.6, shade(halo, 0.1), 0.36);

  for (let i = 0; i < 4; i += 1) {
    const a = angle + (i * Math.PI) / 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    // Blades taper: wide at the hub, one pixel at the tip.
    for (let t = 1.5; t <= 7; t += 0.4) {
      const fade = 1 - (t - 1.5) / 5.5;
      const x = Math.round(8 + dx * t - 0.5);
      const y = Math.round(8 + dy * t - 0.5);
      p.px(x, y, mixColor(blade, bladeTip, 1 - fade), 0.6 + fade * 0.4);
      if (t < 5) p.px(x + Math.round(-dy), y + Math.round(dx), blade, 0.35 + fade * 0.35);
      if (t < 3.5) p.px(x + Math.round(dy), y + Math.round(-dx), shade(blade, -0.2), 0.3 + fade * 0.3);
    }
  }

  // A hard shell over a molten core, cracked open along two seams. The shell
  // is what stops the creature reading as a bright asterisk.
  p.disc(8, 8, 4.1, shell);
  p.disc(8, 8, 3.4, shade(shell, 0.12));
  for (let i = -3; i <= 3; i += 1) {
    p.px(8 + i, 8 + Math.round(i * 0.4), mixColor(core, hot, 0.4), 0.85);
    p.px(8 + Math.round(i * 0.35), 8 + i, core, 0.6);
  }
  p.disc(8, 8, 1.8, core);
  p.disc(8, 8, 1, hot);

  // Eyes, set into the shell.
  p.px(6, 6, hot);
  p.px(10, 6, hot);
  p.px(6, 7, 0x2a0800);
  p.px(10, 7, 0x2a0800);

  p.contour(0x1a0500, 0.5);
}

/**
 * A butterfly: four pale wings beating over a dark body, worth six diamonds
 * when something heavy lands on it -- and drawn to look it, with a gem-blue
 * sheen along every leading edge.
 *
 * The wings are two rounded pairs rather than one straight taper, which is
 * what tells it apart from a firefly at a glance and across a dark cave.
 */
function paintButterfly(p: Painter, frame: number): void {
  const flap = [1, 0.88, 0.66, 0.48, 0.66, 0.88][frame % CREATURE_FRAMES];
  const wing = 0xe6eeff;
  const wingDeep = 0x7d9be0;
  const edge = 0x36488a;
  const sheen = 0x9df0ff;
  const body = 0x1c2340;

  p.disc(8, 8, 7, 0x1a2440, 0.2);

  for (const side of [-1, 1] as const) {
    // Forewing: broad, swept up and back from the shoulders.
    const foreX = 8 + side * (3.6 * flap + 0.4);
    p.ellipse(foreX, 6.2, 3.5 * flap + 0.6, 3.1, mixColor(wing, wingDeep, 0.18));
    p.ellipse(foreX + side * 0.4, 5.6, 2.4 * flap + 0.4, 2.1, wing);
    // Hindwing: smaller, rounder, tucked under.
    const hindX = 8 + side * (2.9 * flap + 0.4);
    p.ellipse(hindX, 10.8, 2.7 * flap + 0.5, 2.4, mixColor(wing, wingDeep, 0.45));
    p.ellipse(hindX, 10.4, 1.7 * flap + 0.3, 1.5, mixColor(wing, wingDeep, 0.2));

    // Veins and the gem-blue leading edge.
    for (let i = 0; i < 4; i += 1) {
      const t = i / 3;
      p.px(Math.round(8 + side * (1.5 + t * 4 * flap)), Math.round(4.2 + t * 1.4), sheen, 0.55);
      p.px(Math.round(8 + side * (1.4 + t * 3 * flap)), Math.round(9.4 + t * 1.6), mixColor(wingDeep, edge, 0.5), 0.5);
    }
    // Eye spots: the warning colour on a creature that is worth a lot dead.
    p.px(Math.round(foreX + side * 0.8), 6, mixColor(sheen, 0xffffff, 0.4), 0.9);
    p.px(Math.round(hindX), 11, mixColor(edge, sheen, 0.4), 0.8);
  }

  // Body: a segmented abdomen with a head and antennae.
  for (let y = 3; y <= 12; y += 1) {
    const seg = y % 2 === 0;
    p.px(7, y, seg ? shade(body, 0.22) : body);
    p.px(8, y, seg ? body : shade(body, -0.2));
  }
  p.px(7, 3, mixColor(body, sheen, 0.4));
  p.px(8, 3, mixColor(body, sheen, 0.25));
  p.px(6, 2, edge, 0.85);
  p.px(9, 2, edge, 0.85);
  p.px(5, 1, sheen, 0.6);
  p.px(10, 1, sheen, 0.6);

  // Pale wings over pale rock need a contour, or a butterfly disappears into
  // the wall of a sulphur cave at exactly the moment it matters.
  p.contour(0x10162c, 0.7);
}

/* ------------------------------------------------------------------ *
 * The player
 * ------------------------------------------------------------------ */

const SKIN = 0xe8b48a;
const SKIN_DARK = 0xb9805c;
const HELMET = 0xf2c227;
const HELMET_LIGHT = 0xffe98a;
const HELMET_DARK = 0xa87a10;
const LAMP = 0xfff6c2;
const SUIT = 0x2f6fd0;
const SUIT_LIGHT = 0x5a9bf0;
const SUIT_DARK = 0x1b4489;
const BOOT = 0x22222b;
const BOOT_LIGHT = 0x4a4a58;
const BELT = 0x8a5a2a;
const BELT_LIGHT = 0xd8a252;
const EYE = 0x1a1a22;

const PLAYER_PALETTE: Readonly<Record<string, number>> = {
  h: HELMET_DARK,
  H: HELMET,
  G: HELMET_LIGHT,
  L: LAMP,
  s: SKIN,
  S: SKIN_DARK,
  E: EYE,
  m: SKIN_DARK,
  b: SUIT_DARK,
  B: SUIT,
  C: SUIT_LIGHT,
  t: BELT,
  T: BELT_LIGHT,
  k: BOOT,
  K: BOOT_LIGHT,
};

/** Head and torso: identical in every pose. */
const PLAYER_BODY: readonly string[] = [
  '....hhhhhhhh....',
  '...hHGGGGGGHh...',
  '.LLHHHHHHHHHHh..',
  '.LLhhhhhhhhhhh..',
  '....ssssssss....',
  '...sEEssssEEs...',
  '...ssssmmsss....',
  '....SssssssS....',
  '...bBCCCCCCBb...',
  '..bBBCCCCBBBBb..',
  '..sBBBBBBBBBBs..',
  '..STtttttttttb..',
  '..SbBBBBBBBBbS..',
  '...bBBBBBBBBb...',
];

/** Row of `PLAYER_BODY` the eyes live on. */
const PLAYER_EYE_ROW = 5;

/** Blinking swaps the eye row for plain skin. */
const PLAYER_EYES_SHUT = '...ssssssssss...';

/** Leg poses, drawn beneath the body. Six of them make a run cycle. */
const PLAYER_LEGS: readonly (readonly string[])[] = [
  ['....BBB..BBB....', '...kKk...kKk....'],
  ['...BBB....BBB...', '..kKk......kKk..'],
  ['..BBB......BBB..', '.kKk........kKk.'],
  ['...BBB....BBB...', '..kKk......kKk..'],
  ['....BBB..BBB....', '..kKk.....kKk...'],
  ['....BBBBBBBB....', '...kKkk..kkKk...'],
];

/** How far the pick head swings forward, per frame of the run cycle. */
const PICK_SWING: readonly number[] = [0, 1, 2, 2, 1, 0];

/**
 * @param bob vertical offset of the torso only, in logical pixels. The boots
 * stay planted, so a breathing idle compresses the miner rather than sliding
 * the whole sprite down the cell.
 * @param lean horizontal offset of the head and shoulders. A running miner
 * leads with the helmet; standing still, they stand up straight.
 * @param swing index into the pick's swing arc, or -1 to shoulder it.
 */
function paintPlayer(p: Painter, legPose: number, blink: boolean, bob = 0, lean = 0, swing = -1): void {
  const body = blink
    ? PLAYER_BODY.map((row, i) => (i === PLAYER_EYE_ROW ? PLAYER_EYES_SHUT : row))
    : PLAYER_BODY;

  // The pick goes down first so the miner's hands read as being in front of
  // the shaft rather than behind it.
  paintPick(p, swing, bob);

  // Head and shoulders lean; hips and boots stay where they were planted.
  const upper = body.slice(0, 8).map((row) => shiftRow(row, lean));
  p.stamp(upper, PLAYER_PALETTE, bob);
  p.stamp(body.slice(8), PLAYER_PALETTE, bob + 8);
  p.stamp(PLAYER_LEGS[legPose % PLAYER_LEGS.length], PLAYER_PALETTE, PLAYER_BODY.length);

  // A contour, so the miner reads against soil, brick and steel alike. Drawn
  // before the lamp bloom, which is meant to spill past the silhouette.
  p.contour(0x080a12, 0.8);

  // Lamp bloom, so the miner is always the brightest thing on screen.
  const lampY = 2 + bob;
  p.px(1 + lean, lampY, LAMP, 0.7);
  p.px(1 + lean, lampY + 1, LAMP, 0.5);
  p.px(0 + lean, lampY, LAMP, 0.34);
  p.px(2 + lean, lampY - 1, LAMP, 0.34);
  p.px(1 + lean, lampY + 2, LAMP, 0.22);
  p.px(0, lampY + 1, mixColor(LAMP, 0xff9b4a, 0.4), 0.18);

  // Contact shadow under the boots.
  p.px(5, 15, 0x000000, 0.25);
  p.px(10, 15, 0x000000, 0.25);
}

/** The miner's pick: shouldered when idle, swung through the run cycle. */
function paintPick(p: Painter, swing: number, bob: number): void {
  const haft = 0x6b4426;
  const haftLight = 0x9a6b3c;
  const head = 0xb9c3d4;
  const headLight = 0xe6eefc;

  if (swing < 0) {
    // Shouldered: the shaft rides on the shoulder with the head clear of the
    // helmet, so it reads as a tool being carried rather than as a smudge
    // behind the miner.
    p.line(12, 14 + bob, 14, 6 + bob, haft);
    p.line(13, 14 + bob, 15, 6 + bob, shade(haft, -0.35), 0.8);
    p.px(14, 7 + bob, haftLight, 0.7);
    for (let i = 0; i < 4; i += 1) p.px(12 + i, 5 + bob, head);
    p.px(15, 4 + bob, headLight);
    p.px(12, 6 + bob, shade(head, -0.45), 0.9);
    p.px(13, 6 + bob, shade(head, -0.3), 0.6);
    return;
  }

  const reach = PICK_SWING[swing % PICK_SWING.length];
  const tipY = 6 + bob + reach * 2;
  p.line(11, 11 + bob, 13 + reach, tipY, haft);
  p.line(11, 12 + bob, 13 + reach, tipY + 1, shade(haft, -0.3), 0.7);
  p.line(12 + reach, tipY - 1, 15, tipY + 1, head);
  p.px(15, tipY + 1, headLight);
  p.px(12 + reach, tipY, shade(head, -0.35), 0.85);
}

/** Shift a stamp row sideways, dropping whatever falls off the edge. */
function shiftRow(row: string, offset: number): string {
  if (offset === 0) return row;
  const pad = '.'.repeat(Math.abs(offset));
  return offset > 0 ? (pad + row).slice(0, row.length) : (row + pad).slice(-row.length);
}

/**
 * The birth animation: the cave cracks open and spits the miner out. Five
 * frames from a tight spark to a burst that fills the cell.
 */
function paintBirth(p: Painter, frame: number): void {
  const pulse = frame / (BIRTH_FRAMES - 1);
  const r = 2.5 + pulse * 4.5;

  p.disc(8, 8, r + 2, mixColor(SUIT_DARK, GEM_LIGHT, pulse), 0.2 + pulse * 0.3);
  p.disc(8, 8, r + 0.8, mixColor(SUIT, GEM_LIGHT, pulse * 0.8), 0.6);
  p.disc(8, 8, r, mixColor(0xffffff, LAMP, 1 - pulse), 0.75 + pulse * 0.25);
  p.disc(8, 8, Math.max(0.8, r - 2.2), 0xffffff);

  // Cracks widening as the shell is about to break.
  const spokes = 5 + frame * 2;
  for (let i = 0; i < spokes; i += 1) {
    const a = (i / spokes) * Math.PI * 2 + frame * 0.35;
    for (let t = r + 0.5; t <= r + 2.5; t += 0.8) {
      p.px(
        Math.round(8 + Math.cos(a) * t - 0.5),
        Math.round(8 + Math.sin(a) * t - 0.5),
        LAMP,
        0.8 - (t - r) * 0.2,
      );
    }
  }
}

/* ------------------------------------------------------------------ *
 * Structures and effects
 * ------------------------------------------------------------------ */

function paintMagicWall(p: Painter, palette: CavePalette, mode: 'idle' | 'spent', frame = 0): void {
  paintSteel(p, palette);
  const seam = mode === 'spent' ? 0x4a4a52 : mixColor(0x7a5fd0, palette.ambient, 0.3);
  const glow = mode === 'spent' ? 0x6a6a72 : 0xd8c2ff;

  for (let x = 0; x < p.size; x += 1) {
    const wave = Math.sin((x + frame * 2) * 0.8) * 0.5 + 0.5;
    p.px(x, 7, mixColor(seam, glow, wave * 0.7));
    p.px(x, 8, seam);
    p.px(x, 6, glow, mode === 'spent' ? 0.15 : 0.3 + wave * 0.3);
    p.px(x, 9, shade(seam, -0.4), 0.7);
  }
}

/** The wall while it is running: a curtain of light with sparks falling through. */
function paintMagicWallActive(p: Painter, frame: number): void {
  const base = 0x2c1f4a;
  p.fill(base);
  for (let y = 0; y < p.size; y += 1) {
    for (let x = 0; x < p.size; x += 1) {
      const wave = Math.sin((x * 0.8 + y * 0.5 + frame * 1.7) * 0.9) * 0.5 + 0.5;
      const vertical = Math.sin((y - frame * 2.4) * 0.55) * 0.5 + 0.5;
      p.px(x, y, mixColor(base, 0xb98cff, wave * 0.6 + vertical * 0.3));
    }
  }
  for (let x = 0; x < p.size; x += 1) {
    p.px(x, 0, 0xffffff, 0.4);
    p.px(x, 1, 0xd8c2ff, 0.25);
    p.px(x, p.size - 1, 0x120a20, 0.65);
    const spark = (x * 5 + frame * 3) % 16;
    p.px(x, spark, 0xffffff, 0.55);
    p.px(x, (spark + 1) % 16, 0xd8c2ff, 0.3);
  }
}

function paintExpandingWall(p: Painter, palette: CavePalette, axis: 'h' | 'v' | 'any'): void {
  paintBrick(p, palette);
  const marker = mixColor(palette.accent, 0xffffff, 0.35);
  const shadowMark = shade(marker, -0.6);

  const drawArrow = (horizontal: boolean) => {
    const put = (x: number, y: number) => {
      p.px(x, y + 1, shadowMark, 0.5);
      p.px(x, y, marker);
    };
    if (horizontal) {
      for (let i = 0; i < 3; i += 1) {
        put(2 + i, 7);
        put(13 - i, 7);
      }
      put(1, 7);
      put(2, 6);
      put(2, 8);
      put(14, 7);
      put(13, 6);
      put(13, 8);
    } else {
      for (let i = 0; i < 3; i += 1) {
        put(7, 2 + i);
        put(7, 13 - i);
      }
      put(7, 1);
      put(6, 2);
      put(8, 2);
      put(7, 14);
      put(6, 13);
      put(8, 13);
    }
  };

  if (axis === 'h' || axis === 'any') drawArrow(true);
  if (axis === 'v' || axis === 'any') drawArrow(false);
}

/** The exit while it is still sealed: a barred gate set into the plate. */
function paintExitClosed(p: Painter, palette: CavePalette): void {
  paintSteel(p, palette);

  const recess = shade(palette.steelDark, -0.55);
  p.rect(3, 2, 10, 13, recess);
  p.outline(3, 2, 10, 13, shade(palette.steelDark, -0.2));

  // Bars.
  for (let x = 4; x < 12; x += 2) {
    for (let y = 3; y < 14; y += 1) {
      p.px(x, y, palette.steelDark);
      p.px(x + 1, y, shade(palette.steelDark, -0.35));
    }
    p.px(x, 3, palette.steel, 0.7);
  }

  // Lintel, threshold and a lock plate.
  for (let x = 3; x < 13; x += 1) {
    p.px(x, 2, palette.steelLight, 0.8);
    p.px(x, 14, shade(palette.steelDark, -0.5));
  }
  p.rect(7, 8, 3, 3, shade(palette.steel, -0.15));
  p.px(8, 9, recess);
  p.px(7, 8, palette.steelLight, 0.8);
}

/** The exit once the quota is met: an arch of light you can hear from a room away. */
function paintExitOpen(p: Painter, frame: number): void {
  const pulse = frame / EXIT_FRAMES;
  const deep = 0x04140f;
  p.fill(deep);

  for (let y = 0; y < p.size; y += 1) {
    for (let x = 0; x < p.size; x += 1) {
      const dx = x + 0.5 - 8;
      const dy = y + 0.5 - 8.5;
      const d = Math.sqrt(dx * dx + dy * dy * 0.72);
      if (d >= 7.6) continue;
      const ring = Math.sin(d * 1.6 - pulse * Math.PI * 2) * 0.5 + 0.5;
      const core = 1 - d / 7.6;
      p.px(x, y, mixColor(0x0d6b4a, 0x9dffd8, ring * 0.6 + core * 0.55));
    }
  }

  // The door frame: solid enough that the exit stays legible when the arch is
  // at the dim end of its pulse.
  p.outline(0, 0, p.size, p.size, 0x1d9b6a);
  p.outline(1, 1, p.size - 2, p.size - 2, 0x0d6b4a, 0.6);
  for (let x = 3; x < 13; x += 1) p.px(x, 1, 0x9dffd8, 0.5);

  p.disc(8, 8.5, 2 + pulse * 1.6, 0xffffff, 0.9);
  p.disc(8, 8.5, 3.4 + pulse * 1.6, 0xd8fff0, 0.35);
}

/**
 * An explosion, over seven frames: a white flash, a fireball, then smoke that
 * expands and thins. Debris streaks ride outward on the shockwave.
 */
function paintBoom(p: Painter, frame: number): void {
  const t = frame / (BOOM_FRAMES - 1);
  const r = 2.2 + t * 8.4;
  const rand = seeded(0xb0057 + frame * 71);

  for (let y = 0; y < p.size; y += 1) {
    for (let x = 0; x < p.size; x += 1) {
      const dx = x + 0.5 - 8;
      const dy = y + 0.5 - 8;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > r) continue;

      const heat = 1 - d / r;
      let color: number;
      if (t < 0.18) color = mixColor(0xffd76a, 0xffffff, Math.pow(heat, 0.4));
      else color = mixColor(0x7a1f05, 0xffe9a0, Math.pow(heat, 0.6));
      if (t > 0.5) color = mixColor(color, 0x2a2026, (t - 0.5) / 0.5);

      // A bright shell at the leading edge of the blast.
      if (t > 0.15 && t < 0.8 && d > r - 1.6) color = mixColor(color, 0xffe9a0, 0.5);

      p.px(x, y, color, Math.min(1, (1 - t * 0.7) * (0.45 + heat)));
    }
  }

  // Debris streaks.
  const streaks = 12;
  for (let i = 0; i < streaks; i += 1) {
    const a = rand() * Math.PI * 2;
    const d = r * (0.55 + rand() * 0.7);
    const x = Math.round(8 + Math.cos(a) * d - 0.5);
    const y = Math.round(8 + Math.sin(a) * d - 0.5);
    p.px(x, y, mixColor(0xffe9a0, 0xff6a1f, rand()), Math.max(0, 1 - t * 0.8));
    p.px(
      Math.round(x - Math.cos(a)),
      Math.round(y - Math.sin(a)),
      mixColor(0xff8a3a, 0x6a3a20, rand()),
      Math.max(0, 0.6 - t * 0.5),
    );
  }
}

function paintParticle(p: Painter, color: number, radius: number, soft: boolean): void {
  for (let y = 0; y < p.size; y += 1) {
    for (let x = 0; x < p.size; x += 1) {
      const dx = x + 0.5 - p.size / 2;
      const dy = y + 0.5 - p.size / 2;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > radius) continue;
      p.px(x, y, color, soft ? Math.pow(1 - d / radius, 1.6) : 1);
    }
  }
}

/** A hollow ring, for the shockwave a blast pushes out ahead of itself. */
function paintRing(p: Painter, color: number): void {
  const centre = p.size / 2;
  const outer = centre - 0.5;
  for (let y = 0; y < p.size; y += 1) {
    for (let x = 0; x < p.size; x += 1) {
      const d = Math.hypot(x + 0.5 - centre, y + 0.5 - centre);
      if (d > outer || d < outer - 3.5) continue;
      p.px(x, y, color, 1 - Math.abs(d - (outer - 1.75)) / 2.2);
    }
  }
}

/**
 * The contact shadow every solid object drops on the tile beneath it. A soft
 * ellipse hugging the bottom of the cell; without it, boulders and gems look
 * pasted onto the dirt rather than resting on it.
 */
function paintShadow(p: Painter): void {
  for (let y = 0; y < p.size; y += 1) {
    for (let x = 0; x < p.size; x += 1) {
      const dx = (x + 0.5 - p.size / 2) / (p.size * 0.44);
      const dy = (y + 0.5 - p.size * 0.72) / (p.size * 0.2);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1) continue;
      p.px(x, y, 0x000000, Math.pow(1 - d, 1.5) * 0.75);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Registration
 * ------------------------------------------------------------------ */

function register(scene: Phaser.Scene, key: string, paint: (p: Painter) => void, size = ART_SIZE): void {
  if (scene.textures.exists(key)) return;
  const painter = new Painter(size);
  paint(painter);
  scene.textures.addCanvas(key, painter.canvas);
}

/**
 * Bake every texture the game needs. Safe to call more than once: keys that
 * already exist are left alone.
 */
export function generateTextures(scene: Phaser.Scene): void {
  registerEdgeSheet(scene);

  for (const palette of Object.values(PALETTES)) {
    register(scene, TextureKey.backdrop(palette.id), (p) => paintBackdrop(p, palette));
    register(scene, TextureKey.strataFar(palette.id), (p) => paintStrataFar(p, palette), STRATA_SIZE);
    register(scene, TextureKey.strataNear(palette.id), (p) => paintStrataNear(p, palette), STRATA_SIZE);
    for (let v = 0; v < DIRT_VARIANTS; v += 1) {
      register(scene, TextureKey.dirt(palette.id, v), (p) => paintDirt(p, palette, v));
    }
    register(scene, TextureKey.wall(palette.id), (p) => paintBrick(p, palette));
    register(scene, TextureKey.steel(palette.id), (p) => paintSteel(p, palette));
    register(scene, TextureKey.boulder(palette.id), (p) => paintBoulder(p, palette));
    register(scene, TextureKey.magicWallIdle(palette.id), (p) => paintMagicWall(p, palette, 'idle'));
    register(scene, TextureKey.magicWallSpent(palette.id), (p) => paintMagicWall(p, palette, 'spent'));
    register(scene, TextureKey.exitClosed(palette.id), (p) => paintExitClosed(p, palette));
    for (const axis of ['h', 'v', 'any'] as const) {
      register(scene, TextureKey.expandingWall(palette.id, axis), (p) =>
        paintExpandingWall(p, palette, axis),
      );
    }
  }

  for (let f = 0; f < DIAMOND_FRAMES; f += 1) {
    register(scene, TextureKey.diamond(f), (p) => paintDiamond(p, f));
  }
  for (let f = 0; f < SLIME_FRAMES; f += 1) register(scene, TextureKey.slime(f), (p) => paintSlime(p, f));
  for (let f = 0; f < AMOEBA_FRAMES; f += 1) {
    register(scene, TextureKey.amoeba(f), (p) => paintAmoeba(p, f));
  }
  for (let f = 0; f < CREATURE_FRAMES; f += 1) {
    register(scene, TextureKey.firefly(f), (p) => paintFirefly(p, f));
    register(scene, TextureKey.butterfly(f), (p) => paintButterfly(p, f));
  }
  for (let f = 0; f < PLAYER_IDLE_FRAMES; f += 1) {
    // A slow breath, a blink two thirds of the way through the loop, and the
    // pick resting on a shoulder.
    register(scene, TextureKey.playerIdle(f), (p) =>
      paintPlayer(p, 0, f === PLAYER_IDLE_FRAMES - 2, f >= 2 && f <= 4 ? 1 : 0, 0, -1),
    );
  }
  for (let f = 0; f < PLAYER_RUN_FRAMES; f += 1) {
    // Running leads with the helmet and swings the pick through its arc.
    register(scene, TextureKey.playerRun(f), (p) =>
      paintPlayer(p, f, false, f % 3 === 1 ? 1 : 0, f === 1 || f === 2 ? 1 : 0, f),
    );
  }
  for (let f = 0; f < BIRTH_FRAMES; f += 1) register(scene, TextureKey.birth(f), (p) => paintBirth(p, f));
  for (let f = 0; f < BOOM_FRAMES; f += 1) register(scene, TextureKey.boom(f), (p) => paintBoom(p, f));
  for (let f = 0; f < MAGIC_FRAMES; f += 1) {
    register(scene, TextureKey.magicWallActive(f), (p) => paintMagicWallActive(p, f));
  }
  for (let f = 0; f < EXIT_FRAMES; f += 1) {
    register(scene, TextureKey.exitOpen(f), (p) => paintExitOpen(p, f));
  }

  register(scene, TextureKey.spark, (p) => paintParticle(p, 0xffffff, 2.2, false), 8);
  register(scene, TextureKey.dust, (p) => paintParticle(p, 0xd8c9a8, 3, true), 8);
  register(scene, TextureKey.mote, (p) => paintParticle(p, 0xffffff, 3.4, true), 8);
  register(scene, TextureKey.shard, (p) => paintParticle(p, 0x9df0ff, 2, false), 8);
  register(scene, TextureKey.smoke, (p) => paintParticle(p, 0x8a8a96, 7.5, true), 16);
  register(scene, TextureKey.glow, (p) => paintParticle(p, 0xffffff, 15, true), 32);
  register(scene, TextureKey.ring, (p) => paintRing(p, 0xffffff), 32);
  register(scene, TextureKey.shadow, (p) => paintShadow(p));
}
