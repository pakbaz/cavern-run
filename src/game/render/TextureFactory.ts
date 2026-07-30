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
 */

/** Logical resolution every sprite is authored at. */
export const ART_SIZE = 16;
const SCALE = TILE_SIZE / ART_SIZE;

export const TextureKey = {
  backdrop: (palette: string) => `cr.bg.${palette}`,
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
  vignette: 'cr.vignette',
} as const;

export const DIAMOND_FRAMES = 8;
export const SLIME_FRAMES = 4;
export const AMOEBA_FRAMES = 4;
export const CREATURE_FRAMES = 4;
export const PLAYER_IDLE_FRAMES = 4;
export const PLAYER_RUN_FRAMES = 4;
export const BIRTH_FRAMES = 4;
export const BOOM_FRAMES = 5;
export const MAGIC_FRAMES = 4;
export const EXIT_FRAMES = 4;
export const DIRT_VARIANTS = 4;

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

/** A single sprite's canvas, addressed in 16x16 logical pixels. */
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

  outline(x: number, y: number, w: number, h: number, color: number): void {
    for (let i = x; i < x + w; i += 1) {
      this.px(i, y, color);
      this.px(i, y + h - 1, color);
    }
    for (let j = y; j < y + h; j += 1) {
      this.px(x, j, color);
      this.px(x + w - 1, j, color);
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

  /** Solid rhombus, used for gems and creature bodies. */
  rhombus(cx: number, cy: number, r: number, color: number, alpha = 1): void {
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) {
        if (Math.abs(x + 0.5 - cx) + Math.abs(y + 0.5 - cy) <= r) this.px(x, y, color, alpha);
      }
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
 * Surfaces
 * ------------------------------------------------------------------ */

function paintBackdrop(p: Painter, palette: CavePalette): void {
  const rand = seeded(0xbeef);
  p.fill(palette.background);
  // Faint strata so the void behind the cave is not a flat colour.
  for (let y = 0; y < p.size; y += 1) {
    for (let x = 0; x < p.size; x += 1) {
      const n = rand();
      if (n > 0.94) p.px(x, y, shade(palette.background, 0.1));
      else if (n < 0.05) p.px(x, y, shade(palette.background, -0.35));
    }
  }
}

function paintDirt(p: Painter, palette: CavePalette, variant: number): void {
  const rand = seeded(0x1000 + variant * 977);
  p.fill(palette.dirt);

  // Grains and pebbles.
  for (let i = 0; i < 34; i += 1) {
    const x = Math.floor(rand() * p.size);
    const y = Math.floor(rand() * p.size);
    p.px(x, y, rand() > 0.45 ? palette.dirtDark : palette.dirtLight);
  }
  for (let i = 0; i < 5; i += 1) {
    const x = 1 + Math.floor(rand() * (p.size - 3));
    const y = 2 + Math.floor(rand() * (p.size - 4));
    p.rect(x, y, 2, 2, palette.dirtDark);
    p.px(x, y, mixColor(palette.dirtDark, palette.dirtLight, 0.5));
  }

  // Lit top edge, shadowed bottom edge: reads as a dug-out surface.
  for (let x = 0; x < p.size; x += 1) {
    p.px(x, 0, palette.dirtLight, 0.85);
    p.px(x, p.size - 1, palette.dirtDark, 0.7);
  }
  for (let y = 0; y < p.size; y += 1) {
    p.px(0, y, palette.dirtLight, 0.35);
    p.px(p.size - 1, y, palette.dirtDark, 0.5);
  }
}

function paintBrick(p: Painter, palette: CavePalette): void {
  p.fill(palette.wallDark);
  const courses = [
    { y: 0, offset: 0 },
    { y: 5, offset: 4 },
    { y: 10, offset: 0 },
  ];
  for (const { y, offset } of courses) {
    for (let x = -8; x < p.size; x += 8) {
      const bx = x + offset;
      p.rect(bx + 1, y + 1, 6, 3, palette.wall);
      for (let i = 0; i < 6; i += 1) p.px(bx + 1 + i, y + 1, palette.wallLight);
      for (let i = 0; i < 6; i += 1) p.px(bx + 1 + i, y + 3, shade(palette.wall, -0.18));
      p.px(bx + 1, y + 2, palette.wallLight, 0.6);
      p.px(bx + 6, y + 2, palette.wallDark, 0.6);
    }
  }
  p.rect(0, 15, p.size, 1, palette.wallDark);
}

function paintSteel(p: Painter, palette: CavePalette): void {
  p.fill(palette.steel);

  // Bevel: lit from the upper left.
  for (let i = 0; i < p.size; i += 1) {
    p.px(i, 0, palette.steelLight);
    p.px(0, i, palette.steelLight);
    p.px(i, 1, palette.steelLight, 0.35);
    p.px(1, i, palette.steelLight, 0.35);
    p.px(i, p.size - 1, palette.steelDark);
    p.px(p.size - 1, i, palette.steelDark);
    p.px(i, p.size - 2, palette.steelDark, 0.4);
    p.px(p.size - 2, i, palette.steelDark, 0.4);
  }

  // Brushed-metal streaks and rivets.
  const rand = seeded(0x51ee1);
  for (let i = 0; i < 22; i += 1) {
    const x = 2 + Math.floor(rand() * (p.size - 4));
    const y = 2 + Math.floor(rand() * (p.size - 4));
    p.px(x, y, rand() > 0.5 ? shade(palette.steel, 0.12) : shade(palette.steel, -0.12));
  }
  for (const [rx, ry] of [
    [3, 3],
    [12, 3],
    [3, 12],
    [12, 12],
  ]) {
    p.rect(rx, ry, 2, 2, palette.steelDark);
    p.px(rx, ry, palette.steelLight);
  }
}

function paintBoulder(p: Painter, palette: CavePalette): void {
  const base = mixColor(palette.steel, palette.wall, 0.45);
  const light = shade(base, 0.42);
  const dark = shade(base, -0.42);
  const rim = shade(base, -0.62);
  const rand = seeded(0xb0d1);

  const cx = 8;
  const cy = 8.4;
  const r = 7.1;

  for (let y = 0; y < p.size; y += 1) {
    for (let x = 0; x < p.size; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > r) continue;

      // Cheap Lambert term: light sits up and to the left.
      const nx = dx / r;
      const ny = dy / r;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lambert = Math.max(0, nx * -0.55 + ny * -0.62 + nz * 0.56);

      let color = mixColor(dark, light, Math.pow(lambert, 0.75));
      if (d > r - 1) color = mixColor(color, rim, 0.65);
      if (rand() > 0.9) color = shade(color, rand() > 0.5 ? 0.1 : -0.12);
      p.px(x, y, color);
    }
  }

  // Specular glint plus a couple of chips so the rock has character.
  p.rect(5, 4, 2, 2, shade(light, 0.4));
  p.px(4, 5, shade(light, 0.25));
  p.px(7, 3, shade(light, 0.2));
  p.px(11, 11, rim);
  p.px(6, 12, rim);
}

/* ------------------------------------------------------------------ *
 * Collectibles and hazards
 * ------------------------------------------------------------------ */

const GEM_DEEP = 0x0b4f7a;
const GEM_MID = 0x24a8d8;
const GEM_LIGHT = 0x9df0ff;

function paintDiamond(p: Painter, frame: number): void {
  const cx = 8;
  const cy = 8;

  for (let y = 0; y < p.size; y += 1) {
    for (let x = 0; x < p.size; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const manhattan = Math.abs(dx) + Math.abs(dy) * 0.92;
      if (manhattan > 7) continue;

      // Facets: the upper half catches the light, the lower half is deeper.
      const facet = dy < 0 ? 0.72 : 0.3;
      const edge = manhattan > 6 ? -0.25 : 0;
      const side = dx < 0 ? 0.12 : -0.06;
      p.px(x, y, mixColor(GEM_DEEP, GEM_MID, Math.max(0, facet + edge + side)));
    }
  }

  // Crown facet lines.
  for (let i = -3; i <= 3; i += 1) p.px(cx + i, cy - 3, mixColor(GEM_MID, GEM_LIGHT, 0.55));
  for (let i = 0; i < 4; i += 1) {
    p.px(cx - 1 - i, cy - 3 + i, mixColor(GEM_MID, GEM_LIGHT, 0.3));
    p.px(cx + i, cy - 3 + i, mixColor(GEM_MID, GEM_LIGHT, 0.3));
  }
  p.px(cx - 1, cy + 5, GEM_LIGHT, 0.5);

  // A highlight that sweeps around the gem, one step per frame.
  const sweep = [
    [6, 4],
    [9, 5],
    [10, 8],
    [9, 11],
    [7, 12],
    [5, 10],
    [4, 8],
    [5, 5],
  ][frame % DIAMOND_FRAMES];
  p.px(sweep[0], sweep[1], 0xffffff);
  p.px(sweep[0] + 1, sweep[1], GEM_LIGHT);
  p.px(sweep[0], sweep[1] + 1, GEM_LIGHT, 0.75);
}

function paintSlime(p: Painter, frame: number): void {
  const rand = seeded(0x51117e + frame * 31);
  const base = 0x1d5f3a;
  p.fill(base);

  for (let y = 0; y < p.size; y += 1) {
    for (let x = 0; x < p.size; x += 1) {
      const wobble = Math.sin((x + frame * 1.6) * 0.7) + Math.cos((y - frame * 1.2) * 0.6);
      p.px(x, y, mixColor(base, 0x3fbf72, 0.25 + wobble * 0.14));
    }
  }
  for (let i = 0; i < 7; i += 1) {
    const bx = 1 + Math.floor(rand() * (p.size - 3));
    const by = 1 + Math.floor(rand() * (p.size - 3));
    p.rect(bx, by, 2, 2, 0x63e39a, 0.75);
    p.px(bx, by, 0xc8ffe0, 0.8);
  }
  for (let x = 0; x < p.size; x += 1) p.px(x, 0, 0x0d3b23, 0.6);
}

function paintAmoeba(p: Painter, frame: number): void {
  const rand = seeded(0xa30e3a + frame * 613);
  const base = 0x3d8f1f;
  p.fill(0x1d4a10);

  for (let y = 0; y < p.size; y += 1) {
    for (let x = 0; x < p.size; x += 1) {
      const n =
        Math.sin((x * 0.9 + frame * 1.1) * 0.8) * Math.cos((y * 1.1 - frame * 0.9) * 0.7) * 0.5 + 0.5;
      if (n > 0.28) p.px(x, y, mixColor(base, 0x7fd83a, n * 0.7));
    }
  }
  // Nuclei drifting inside the mass.
  for (let i = 0; i < 5; i += 1) {
    const bx = 2 + Math.floor(rand() * (p.size - 4));
    const by = 2 + Math.floor(rand() * (p.size - 4));
    p.rect(bx, by, 2, 2, 0xb6ff6a, 0.85);
    p.px(bx, by, 0xe8ffd0);
  }
}

/* ------------------------------------------------------------------ *
 * Creatures
 * ------------------------------------------------------------------ */

/**
 * Fireflies and butterflies share a silhouette: a bright core with four
 * blades that rotate one step per frame, so they read as spinning menaces.
 */
function paintCreature(p: Painter, frame: number, core: number, blade: number, glow: number): void {
  const cx = 8;
  const cy = 8;
  const angle = (frame / CREATURE_FRAMES) * Math.PI * 0.5;

  for (let i = 0; i < 4; i += 1) {
    const a = angle + (i * Math.PI) / 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    for (let t = 2; t <= 7; t += 0.5) {
      const x = Math.round(cx + dx * t - 0.5);
      const y = Math.round(cy + dy * t - 0.5);
      const fade = 1 - (t - 2) / 6;
      p.px(x, y, mixColor(blade, glow, fade * 0.6), 0.55 + fade * 0.45);
      // Thicken the blade near the core.
      if (t < 5) {
        p.px(x + Math.round(-dy), y + Math.round(dx), blade, 0.5 * fade + 0.2);
      }
    }
  }

  p.rhombus(cx, cy, 3.6, shade(core, -0.35));
  p.rhombus(cx, cy, 2.7, core);
  p.rhombus(cx, cy, 1.4, glow);
  p.px(cx - 1, cy - 1, 0xffffff);
  p.px(cx, cy - 2, glow, 0.8);
}

/* ------------------------------------------------------------------ *
 * The player
 * ------------------------------------------------------------------ */

const SKIN = 0xe8b48a;
const SKIN_DARK = 0xb9805c;
const HELMET = 0xf2c227;
const HELMET_DARK = 0xa87a10;
const LAMP = 0xfff6c2;
const SUIT = 0x2f6fd0;
const SUIT_DARK = 0x1b4489;
const BOOT = 0x2a2a33;
const EYE = 0x1a1a22;

const PLAYER_PALETTE: Readonly<Record<string, number>> = {
  h: HELMET_DARK,
  H: HELMET,
  L: LAMP,
  s: SKIN,
  S: SKIN_DARK,
  E: EYE,
  b: SUIT_DARK,
  B: SUIT,
  k: BOOT,
};

/** Head and torso: identical in every pose. */
const PLAYER_BODY: readonly string[] = [
  '................',
  '................',
  '.....hhhhhh.....',
  '....hHHHHHHh....',
  '...LHHHHHHHHh...',
  '...LLhhhhhhhh...',
  '.....ssssss.....',
  '.....sEssEs.....',
  '......SssS......',
  '....bBBBBBBb....',
  '...bBBBBBBBBb...',
  '...sBBBBBBBBs...',
  '...SbBBBBBBbS...',
];

/** Leg poses, drawn beneath the body. Four of them make a run cycle. */
const PLAYER_LEGS: readonly (readonly string[])[] = [
  ['.....BB..BB.....', '....kkk..kkk....'],
  ['....BB....BB....', '..kkk......kkk..'],
  ['.....BB..BB.....', '....kkk..kkk....'],
  ['......BBBB......', '.....kkkkkk.....'],
];

function paintPlayer(p: Painter, legPose: number, blink: boolean): void {
  const body = blink
    ? PLAYER_BODY.map((row, i) => (i === 7 ? '.....ssssss.....' : row))
    : PLAYER_BODY;
  p.stamp(body, PLAYER_PALETTE);
  p.stamp(PLAYER_LEGS[legPose % PLAYER_LEGS.length], PLAYER_PALETTE, PLAYER_BODY.length);

  // Lamp bloom, so the miner is always the brightest thing on screen.
  p.px(2, 4, LAMP, 0.55);
  p.px(2, 5, LAMP, 0.4);
  p.px(3, 3, LAMP, 0.25);
}

function paintBirth(p: Painter, frame: number): void {
  const pulse = frame / (BIRTH_FRAMES - 1);
  const r = 3.5 + pulse * 3;
  p.disc(8, 8, r + 1.4, mixColor(0x1b4489, 0x9df0ff, pulse), 0.25 + pulse * 0.35);
  p.disc(8, 8, r, mixColor(0x2f6fd0, 0xffffff, pulse * 0.8));
  p.disc(8, 8, Math.max(1, r - 2), 0xffffff, 0.6 + pulse * 0.4);

  // Cracks widening as the egg is about to break.
  const spokes = 4 + frame;
  for (let i = 0; i < spokes; i += 1) {
    const a = (i / spokes) * Math.PI * 2 + frame * 0.4;
    const x = Math.round(8 + Math.cos(a) * (r + 1.5) - 0.5);
    const y = Math.round(8 + Math.sin(a) * (r + 1.5) - 0.5);
    p.px(x, y, 0xfff6c2, 0.8);
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

function paintMagicWallActive(p: Painter, frame: number): void {
  const base = 0x2c1f4a;
  p.fill(base);
  for (let y = 0; y < p.size; y += 1) {
    for (let x = 0; x < p.size; x += 1) {
      const wave = Math.sin((x * 0.8 + y * 0.5 + frame * 1.7) * 0.9) * 0.5 + 0.5;
      p.px(x, y, mixColor(base, 0xb98cff, wave * 0.8));
    }
  }
  for (let x = 0; x < p.size; x += 1) {
    p.px(x, 0, 0xffffff, 0.35);
    p.px(x, p.size - 1, 0x120a20, 0.6);
    const spark = (x * 3 + frame * 5) % 16;
    p.px(x, 4 + (spark % 8), 0xffffff, 0.5);
  }
}

function paintExpandingWall(p: Painter, palette: CavePalette, axis: 'h' | 'v' | 'any'): void {
  paintBrick(p, palette);
  const marker = mixColor(palette.ambient, 0xffffff, 0.3);

  const drawArrow = (horizontal: boolean) => {
    if (horizontal) {
      for (let i = 0; i < 3; i += 1) {
        p.px(2 + i, 7, marker);
        p.px(13 - i, 7, marker);
      }
      p.px(1, 7, marker);
      p.px(2, 6, marker);
      p.px(2, 8, marker);
      p.px(14, 7, marker);
      p.px(13, 6, marker);
      p.px(13, 8, marker);
    } else {
      for (let i = 0; i < 3; i += 1) {
        p.px(7, 2 + i, marker);
        p.px(7, 13 - i, marker);
      }
      p.px(7, 1, marker);
      p.px(6, 2, marker);
      p.px(8, 2, marker);
      p.px(7, 14, marker);
      p.px(6, 13, marker);
      p.px(8, 13, marker);
    }
  };

  if (axis === 'h' || axis === 'any') drawArrow(true);
  if (axis === 'v' || axis === 'any') drawArrow(false);
}

function paintExitClosed(p: Painter, palette: CavePalette): void {
  paintSteel(p, palette);
  p.rect(4, 3, 8, 11, shade(palette.steelDark, -0.4));
  p.outline(4, 3, 8, 11, palette.steelDark);
  for (let y = 4; y < 13; y += 2) p.rect(5, y, 6, 1, shade(palette.steel, -0.55));
  p.rect(9, 8, 2, 2, palette.steelLight);
}

function paintExitOpen(p: Painter, frame: number): void {
  const pulse = frame / EXIT_FRAMES;
  p.fill(0x04140f);
  for (let y = 0; y < p.size; y += 1) {
    for (let x = 0; x < p.size; x += 1) {
      const dx = x + 0.5 - 8;
      const dy = y + 0.5 - 8;
      const d = Math.sqrt(dx * dx + dy * dy);
      const ring = Math.sin(d * 1.5 - pulse * Math.PI * 2) * 0.5 + 0.5;
      if (d < 7.5) p.px(x, y, mixColor(0x0d6b4a, 0x9dffd8, ring * 0.9));
    }
  }
  p.outline(0, 0, p.size, p.size, 0x1d9b6a);
  p.disc(8, 8, 2 + pulse * 1.5, 0xffffff, 0.85);
}

function paintBoom(p: Painter, frame: number): void {
  // Stage 0 is the flash; the last stage is fading smoke.
  const t = frame / (BOOM_FRAMES - 1);
  const r = 2 + t * 8;
  const rand = seeded(0xb0057 + frame * 71);

  for (let y = 0; y < p.size; y += 1) {
    for (let x = 0; x < p.size; x += 1) {
      const dx = x + 0.5 - 8;
      const dy = y + 0.5 - 8;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > r) continue;
      const heat = 1 - d / r;
      let color = mixColor(0x7a1f05, 0xffe9a0, Math.pow(heat, 0.6));
      if (t > 0.55) color = mixColor(color, 0x2a2026, (t - 0.55) / 0.45);
      p.px(x, y, color, Math.min(1, (1 - t * 0.55) * (0.5 + heat)));
    }
  }
  for (let i = 0; i < 10; i += 1) {
    const a = rand() * Math.PI * 2;
    const d = r * (0.6 + rand() * 0.6);
    p.px(
      Math.round(8 + Math.cos(a) * d - 0.5),
      Math.round(8 + Math.sin(a) * d - 0.5),
      mixColor(0xffe9a0, 0xff6a1f, rand()),
      1 - t * 0.7,
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
    register(scene, TextureKey.firefly(f), (p) => paintCreature(p, f, 0xd8331f, 0xff7a2a, 0xffd76a));
    register(scene, TextureKey.butterfly(f), (p) => paintCreature(p, f, 0xdfe9ff, 0x8ab6ff, 0xffffff));
  }
  for (let f = 0; f < PLAYER_IDLE_FRAMES; f += 1) {
    register(scene, TextureKey.playerIdle(f), (p) => paintPlayer(p, 0, f === PLAYER_IDLE_FRAMES - 1));
  }
  for (let f = 0; f < PLAYER_RUN_FRAMES; f += 1) {
    register(scene, TextureKey.playerRun(f), (p) => paintPlayer(p, f, false));
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
  register(scene, TextureKey.glow, (p) => paintParticle(p, 0xffffff, 15, true), 32);
}
