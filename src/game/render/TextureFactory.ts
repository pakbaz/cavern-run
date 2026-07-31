import Phaser from 'phaser';

import { PALETTES, TILE_SIZE, type CavePalette } from '../../config';
import { mixColor, shade, toCss } from './renderMath';

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
  ring: 'cr.ring',
  shadow: 'cr.shadow',
  vignette: 'cr.vignette',
} as const;

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
export const DIRT_VARIANTS = 6;

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

/**
 * Shading term for a point on a sphere of radius `r` offset from its centre by
 * (dx, dy). Returns the key contribution and the bounce separately so a caller
 * can tint them differently, which is the whole trick behind rock that looks
 * like it is sitting in a cave rather than floating on a page.
 */
function sphereLight(dx: number, dy: number, r: number): { key: number; fill: number } {
  const nx = dx / r;
  const ny = dy / r;
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return {
    key: Math.max(0, nx * KEY_LIGHT.x + ny * KEY_LIGHT.y + nz * KEY_LIGHT.z),
    fill: Math.max(0, nx * FILL_LIGHT.x + ny * FILL_LIGHT.y + nz * FILL_LIGHT.z),
  };
}

/** A single sprite's canvas, addressed in logical pixels. */
class Painter {
  readonly canvas: HTMLCanvasElement;
  readonly size: number;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(size = ART_SIZE) {
    this.size = size;
    this.canvas = document.createElement('canvas');
    this.canvas.width = size * SCALE;
    this.canvas.height = size * SCALE;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Cavern Run needs a 2D canvas context to generate its artwork');
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
  }

  px(x: number, y: number, color: number, alpha = 1): void {
    if (alpha <= 0 || x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = toCss(color);
    this.ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
    this.ctx.globalAlpha = 1;
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
 * Backdrop and parallax strata
 * ------------------------------------------------------------------ */

function paintBackdrop(p: Painter, palette: CavePalette): void {
  const rand = seeded(0xbeef);
  p.fill(palette.background);
  // Faint strata so the void behind the cave is not a flat colour. Kept very
  // subtle now that two parallax layers sit behind it.
  for (let y = 0; y < p.size; y += 1) {
    for (let x = 0; x < p.size; x += 1) {
      const n = rand();
      if (n > 0.965) p.px(x, y, shade(palette.background, 0.14));
      else if (n < 0.04) p.px(x, y, shade(palette.background, -0.35));
    }
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

function paintDirt(p: Painter, palette: CavePalette, variant: number): void {
  const rand = seeded(0x1000 + variant * 977);

  // Layered soil: bands of slightly different tone, so a wall of dirt has a
  // grain to it instead of reading as one flat colour repeated. Low frequency
  // and low amplitude — soil is a mass, not a stack of stripes.
  for (let y = 0; y < p.size; y += 1) {
    const band = Math.sin((y + variant * 5) * 0.38) * 0.5 + 0.5;
    const row = mixColor(palette.dirt, band > 0.5 ? palette.dirtLight : palette.dirtDark, 0.1);
    for (let x = 0; x < p.size; x += 1) {
      const grain = rand();
      p.px(x, y, grain > 0.86 ? shade(row, 0.1) : grain < 0.12 ? shade(row, -0.12) : row);
    }
  }

  // Pebbles: a lit cap, a body, and a shadow underneath. Three pixels each is
  // enough to read as a stone once there are a dozen of them.
  for (let i = 0; i < 6; i += 1) {
    const x = 1 + Math.floor(rand() * (p.size - 3));
    const y = 2 + Math.floor(rand() * (p.size - 5));
    p.rect(x, y, 2, 2, palette.dirtDark);
    p.px(x, y, mixColor(palette.dirtLight, 0xffffff, 0.25));
    p.px(x + 1, y + 2, shade(palette.dirtDark, -0.35), 0.6);
  }

  // Mineral flecks in the cave's accent colour: the hint that there is
  // something worth digging for in here.
  for (let i = 0; i < 3; i += 1) {
    const x = 2 + Math.floor(rand() * (p.size - 4));
    const y = 2 + Math.floor(rand() * (p.size - 4));
    p.px(x, y, mixColor(palette.dirtLight, palette.accent, 0.55), 0.8);
  }

  // Just enough edge shaping to keep a dug face legible. Deliberately faint,
  // and jittered per variant, so a screen full of soil does not turn into a
  // hard lattice of tile borders.
  const top = 0.1 + (variant % 3) * 0.05;
  const bottom = 0.12 + ((variant + 1) % 3) * 0.05;
  for (let x = 0; x < p.size; x += 1) {
    p.px(x, 0, mixColor(palette.dirtLight, 0xffffff, 0.2), top);
    p.px(x, p.size - 1, shade(palette.dirtDark, -0.3), bottom);
  }
  for (let y = 0; y < p.size; y += 1) {
    p.px(0, y, palette.dirtLight, 0.08);
    p.px(p.size - 1, y, palette.dirtDark, 0.14);
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
  const base = palette.rock;
  const light = shade(base, 0.5);
  const dark = shade(base, -0.52);
  const rim = shade(base, -0.7);
  const bounce = mixColor(shade(base, -0.2), palette.accent, 0.22);
  const rand = seeded(0xb0d1);

  const cx = 8;
  const cy = 8.2;
  const r = 7.3;

  for (let y = 0; y < p.size; y += 1) {
    for (let x = 0; x < p.size; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > r) continue;

      const { key, fill } = sphereLight(dx, dy, r);
      let color = mixColor(dark, light, Math.pow(key, 0.72));
      color = mixColor(color, bounce, Math.pow(fill, 2.4) * 0.55);

      // Occlusion crescent where the rock meets whatever it rests on.
      if (dy > r * 0.35) color = mixColor(color, rim, ((dy - r * 0.35) / (r * 0.65)) * 0.5);
      // Dark contact edge.
      if (d > r - 1.1) color = mixColor(color, rim, 0.7);

      if (rand() > 0.88) color = shade(color, rand() > 0.5 ? 0.09 : -0.11);
      p.px(x, y, color);
    }
  }

  // Cracks: two short strokes following the curve, plus their lit lower lip.
  p.line(5, 10, 8, 12, shade(dark, -0.3), 0.7);
  p.line(8, 12, 11, 11, shade(dark, -0.3), 0.55);
  p.line(5, 11, 8, 13, shade(light, -0.1), 0.25);
  p.line(10, 4, 12, 7, shade(dark, -0.25), 0.45);

  // Mineral flecks.
  for (let i = 0; i < 5; i += 1) {
    const a = rand() * Math.PI * 2;
    const d = rand() * (r - 2);
    p.px(
      Math.round(cx + Math.cos(a) * d - 0.5),
      Math.round(cy + Math.sin(a) * d - 0.5),
      mixColor(light, palette.accent, 0.5),
      0.7,
    );
  }

  // Specular: a hard core with a soft skirt, which is what sells "polished".
  p.rect(5, 4, 2, 2, mixColor(light, 0xffffff, 0.65));
  p.px(4, 5, mixColor(light, 0xffffff, 0.3), 0.8);
  p.px(7, 4, mixColor(light, 0xffffff, 0.3), 0.7);
  p.px(5, 6, mixColor(light, 0xffffff, 0.2), 0.6);
  p.px(7, 3, mixColor(light, 0xffffff, 0.18), 0.5);
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
}

function paintSlime(p: Painter, frame: number): void {
  const rand = seeded(0x51117e + frame * 31);
  const deep = 0x0d3b23;
  const base = 0x1d5f3a;
  const bright = 0x63e39a;
  const wave = (x: number, y: number) =>
    Math.sin((x + frame * 1.4) * 0.62) * 0.5 + Math.cos((y - frame * 1.1) * 0.55) * 0.5;

  for (let y = 0; y < p.size; y += 1) {
    for (let x = 0; x < p.size; x += 1) {
      const n = wave(x, y);
      p.px(x, y, mixColor(base, bright, 0.22 + n * 0.16));
    }
  }

  // Bubbles rising through the goo.
  for (let i = 0; i < 8; i += 1) {
    const bx = 1 + Math.floor(rand() * (p.size - 3));
    const by = 1 + Math.floor(rand() * (p.size - 3));
    p.ellipse(bx + 1, by + 1, 1.6, 1.3, mixColor(bright, 0xffffff, 0.25), 0.7);
    p.px(bx, by, 0xc8ffe0, 0.85);
  }

  // A meniscus at the top and drips hanging off the bottom, so a slime ceiling
  // reads as something a boulder would sink through.
  for (let x = 0; x < p.size; x += 1) {
    p.px(x, 0, deep, 0.75);
    p.px(x, 1, mixColor(bright, 0xffffff, 0.4), 0.35);
  }
  for (let i = 0; i < 4; i += 1) {
    const dx = (i * 4 + frame) % p.size;
    const len = 1 + ((frame + i) % 3);
    for (let j = 0; j < len; j += 1) p.px(dx, p.size - 1 - j, deep, 0.6);
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
}

/* ------------------------------------------------------------------ *
 * Creatures
 * ------------------------------------------------------------------ */

/**
 * A firefly: a burning core with four blades whirling round it and a pair of
 * eyes that never blink. Aggressive, hot, and unmistakably not a butterfly --
 * the two used to share a silhouette, which made a cave full of both a
 * guessing game at speed.
 */
function paintFirefly(p: Painter, frame: number): void {
  const halo = 0x5a1204;
  const blade = 0xff7a2a;
  const bladeTip = 0xffd76a;
  const core = 0xd8331f;
  const hot = 0xfff0b0;
  const angle = (frame / CREATURE_FRAMES) * (Math.PI / 2);

  p.disc(8, 8, 7.2, halo, 0.35);
  p.disc(8, 8, 5.6, shade(halo, 0.12), 0.4);

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

  p.disc(8, 8, 3.4, shade(core, -0.4));
  p.disc(8, 8, 2.6, core);
  p.disc(8, 8, 1.4, hot);

  // Eyes.
  p.px(6, 7, 0xffffff);
  p.px(9, 7, 0xffffff);
  p.px(6, 8, 0x2a0800, 0.8);
  p.px(9, 8, 0x2a0800, 0.8);
}

/**
 * A butterfly: pale wings that flap through the frame loop over a dark body.
 * Worth six diamonds when something heavy lands on it, and drawn to look it --
 * the wings carry a gem-blue sheen that echoes the diamond palette.
 */
function paintButterfly(p: Painter, frame: number): void {
  const flap = [1, 0.86, 0.62, 0.45, 0.62, 0.86][frame % CREATURE_FRAMES];
  const wing = 0xdfe9ff;
  const wingDeep = 0x6f8fd8;
  const edge = 0x3a4f8f;
  const sheen = 0x9df0ff;
  const body = 0x1c2340;

  p.disc(8, 8, 7, 0x1a2440, 0.22);

  for (let i = 0; i < 6; i += 1) {
    const t = i / 5;
    const half = Math.max(1, Math.round((1.8 + t * 5.2) * flap));
    for (let dy = -half; dy <= half; dy += 1) {
      const y = 8 + dy;
      const rim = Math.abs(dy) >= half - 0.5;
      const upper = dy < 0;
      let color = mixColor(wing, wingDeep, t * 0.55 + (upper ? 0 : 0.18));
      if (rim) color = edge;
      // A vein of gem-blue along the leading edge of each wing.
      else if (dy === -half + 1 || dy === half - 1) color = mixColor(color, sheen, 0.45);
      p.px(6 - i, y, color, rim ? 0.9 : 1);
      p.px(9 + i, y, shade(color, -0.08), rim ? 0.9 : 1);
    }
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
const BOOT = 0x2a2a33;
const BELT = 0x8a5a2a;
const EYE = 0x1a1a22;

const PLAYER_PALETTE: Readonly<Record<string, number>> = {
  h: HELMET_DARK,
  H: HELMET,
  G: HELMET_LIGHT,
  L: LAMP,
  s: SKIN,
  S: SKIN_DARK,
  E: EYE,
  b: SUIT_DARK,
  B: SUIT,
  C: SUIT_LIGHT,
  t: BELT,
  k: BOOT,
};

/** Head and torso: identical in every pose. */
const PLAYER_BODY: readonly string[] = [
  '................',
  '.....hhhhhh.....',
  '....hHGGGGHh....',
  '..LLHHHHHHHHh...',
  '..LLhhhhhhhhh...',
  '.....ssssss.....',
  '.....sEssEs.....',
  '.....SssssS.....',
  '......SssS......',
  '....bBCCCCBb....',
  '...bBBCCBBBBb...',
  '...sBBBBBBBBs...',
  '...Sttttttttb...',
  '...SbBBBBBBbS...',
];

/** Blinking swaps the eye row for plain skin. */
const PLAYER_EYES_SHUT = '.....ssssss.....';

/** Leg poses, drawn beneath the body. Six of them make a run cycle. */
const PLAYER_LEGS: readonly (readonly string[])[] = [
  ['.....BB..BB.....', '....kkk..kkk....'],
  ['....BB....BB....', '..kkk......kkk..'],
  ['...BB......BB...', '.kkk........kkk.'],
  ['....BB....BB....', '..kkk......kkk..'],
  ['.....BB..BB.....', '...kkk....kkk...'],
  ['......BBBB......', '.....kkkkkk.....'],
];

/**
 * @param bob vertical offset of the torso only, in logical pixels. The boots
 * stay planted, so a breathing idle compresses the miner rather than sliding
 * the whole sprite down the cell.
 */
function paintPlayer(p: Painter, legPose: number, blink: boolean, bob = 0): void {
  const body = blink
    ? PLAYER_BODY.map((row, i) => (i === 6 ? PLAYER_EYES_SHUT : row))
    : PLAYER_BODY;
  p.stamp(body, PLAYER_PALETTE, bob);
  p.stamp(PLAYER_LEGS[legPose % PLAYER_LEGS.length], PLAYER_PALETTE, PLAYER_BODY.length);

  // Lamp bloom, so the miner is always the brightest thing on screen.
  p.px(1, 3, LAMP, 0.6);
  p.px(1, 4, LAMP, 0.45);
  p.px(0, 3, LAMP, 0.28);
  p.px(2, 2, LAMP, 0.3);
  p.px(1, 5, LAMP, 0.2);

  // Contact shadow under the boots.
  p.px(5, 15, 0x000000, 0.25);
  p.px(10, 15, 0x000000, 0.25);
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
    // A slow breath, and a blink two thirds of the way through the loop.
    register(scene, TextureKey.playerIdle(f), (p) =>
      paintPlayer(p, 0, f === PLAYER_IDLE_FRAMES - 2, f >= 2 && f <= 4 ? 1 : 0),
    );
  }
  for (let f = 0; f < PLAYER_RUN_FRAMES; f += 1) {
    register(scene, TextureKey.playerRun(f), (p) => paintPlayer(p, f, false, f % 3 === 1 ? 1 : 0));
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
  register(scene, TextureKey.shard, (p) => paintParticle(p, 0x9df0ff, 2, false), 8);
  register(scene, TextureKey.smoke, (p) => paintParticle(p, 0x8a8a96, 7.5, true), 16);
  register(scene, TextureKey.glow, (p) => paintParticle(p, 0xffffff, 15, true), 32);
  register(scene, TextureKey.ring, (p) => paintRing(p, 0xffffff), 32);
  register(scene, TextureKey.shadow, (p) => paintShadow(p));
}
