/**
 * Global tuning constants for Cavern Run.
 *
 * Everything here is framework-agnostic data so the pure simulation under
 * `src/game/engine` can share it with the Phaser presentation layer.
 */

/** Pixel size of one cave cell. */
export const TILE_SIZE = 32;

/** Every cave is exactly this many cells; the camera scrolls across it. */
export const CAVE_WIDTH = 40;
export const CAVE_HEIGHT = 22;

/**
 * Default playfield in cells (classic 20x12 proportions).
 *
 * This is only the starting point: `src/layout.ts` picks the real figures from
 * the window's size and density, so a phone sees a taller, narrower slice of
 * cave and a desktop a wider one.
 */
export const VIEWPORT_TILES_W = 20;
export const VIEWPORT_TILES_H = 12;

/** Height of the status bar above the playfield, in pixels. */
export const HUD_HEIGHT = 32;

/** Vertical pixel offset of the playfield inside the canvas. */
export const WORLD_OFFSET_Y = HUD_HEIGHT;

/**
 * Simulation speed. The world advances in discrete scans; rendering
 * interpolates between them so motion still reads as smooth 60fps.
 */
export const DEFAULT_TICK_HZ = 7.5;
export const MIN_TICK_HZ = 6;
export const MAX_TICK_HZ = 12;

/** Ticks the player-birth animation runs for at cave start. */
export const BIRTH_TICKS = 12;

/** Ticks each cell of an explosion spends in each of its stages. */
export const EXPLOSION_STAGES = 5;

/** How long the cave lingers after the player dies, before the life is lost. */
export const DEATH_HOLD_TICKS = 18;

/** Scoring / lives. */
export const STARTING_LIVES = 3;
export const MAX_LIVES = 9;
export const EXTRA_LIFE_EVERY = 500;
export const TIME_BONUS_PER_SECOND = 1;

/** Seconds remaining at which the soundtrack switches to its urgent voicing. */
export const TIME_PRESSURE_SECONDS = 30;
export const TIME_CRITICAL_SECONDS = 10;

/** Rendering z-order. */
export const Depth = {
  Background: 0,
  Tiles: 10,
  Entities: 20,
  Particles: 30,
  Lighting: 40,
  Vignette: 45,
  Overlay: 50,
  Hud: 60,
  Menu: 70,
} as const;

/** Phaser scene keys. */
export const SceneKey = {
  Boot: 'BootScene',
  Title: 'TitleScene',
  CaveIntro: 'CaveIntroScene',
  Game: 'GameScene',
  Hud: 'HudScene',
  Pause: 'PauseScene',
  CaveComplete: 'CaveCompleteScene',
  GameOver: 'GameOverScene',
} as const;

export type SceneKeyValue = (typeof SceneKey)[keyof typeof SceneKey];

/**
 * A cave's colour scheme. Palette-dependent textures (dirt, walls, backdrop)
 * are baked once per palette at boot rather than tinted at draw time, which
 * keeps the shading highlights readable.
 */
export interface CavePalette {
  readonly id: string;
  /** Deep backdrop behind the tiles. */
  readonly background: number;
  /** Dirt body / highlight / shadow. */
  readonly dirt: number;
  readonly dirtLight: number;
  readonly dirtDark: number;
  /** Brick wall body / mortar. */
  readonly wall: number;
  readonly wallLight: number;
  readonly wallDark: number;
  /** Indestructible steel. */
  readonly steel: number;
  readonly steelLight: number;
  readonly steelDark: number;
  /** Ambient light colour used by the lighting layer. */
  readonly ambient: number;
}

export const PALETTES: Readonly<Record<string, CavePalette>> = {
  /** Cool blue starter caves, matching the key art. */
  glacier: {
    id: 'glacier',
    background: 0x070c18,
    dirt: 0x4a3a2a,
    dirtLight: 0x6d5638,
    dirtDark: 0x2c2118,
    wall: 0x3b4a63,
    wallLight: 0x5b7093,
    wallDark: 0x212b3c,
    steel: 0x8291a8,
    steelLight: 0xc2d2e8,
    steelDark: 0x424d60,
    ambient: 0x6fb6ff,
  },
  /** Warm copper seams. */
  ember: {
    id: 'ember',
    background: 0x140a08,
    dirt: 0x5a3520,
    dirtLight: 0x8a5330,
    dirtDark: 0x30190e,
    wall: 0x633d2c,
    wallLight: 0x91603f,
    wallDark: 0x38211a,
    steel: 0xa38466,
    steelLight: 0xe0c6a2,
    steelDark: 0x54412f,
    ambient: 0xff9b4a,
  },
  /** Mossy flooded galleries. */
  verdant: {
    id: 'verdant',
    background: 0x061410,
    dirt: 0x3f4a26,
    dirtLight: 0x5f7038,
    dirtDark: 0x232a15,
    wall: 0x2f5044,
    wallLight: 0x477a67,
    wallDark: 0x1a2d27,
    steel: 0x77a08f,
    steelLight: 0xb2ddcb,
    steelDark: 0x3e5a50,
    ambient: 0x5ce8b0,
  },
  /** Deep amethyst pockets. */
  amethyst: {
    id: 'amethyst',
    background: 0x0d0718,
    dirt: 0x4a3350,
    dirtLight: 0x6d4c78,
    dirtDark: 0x2a1c30,
    wall: 0x453363,
    wallLight: 0x6a5090,
    wallDark: 0x271b3a,
    steel: 0x9a86b8,
    steelLight: 0xd6c6ec,
    steelDark: 0x50446b,
    ambient: 0xb782ff,
  },
  /** Sulphurous lower depths. */
  sulphur: {
    id: 'sulphur',
    background: 0x121004,
    dirt: 0x5c4c16,
    dirtLight: 0x8a7524,
    dirtDark: 0x322a0c,
    wall: 0x5b4a1e,
    wallLight: 0x8c7430,
    wallDark: 0x332911,
    steel: 0xb0a068,
    steelLight: 0xe8dca0,
    steelDark: 0x5d5334,
    ambient: 0xffd453,
  },
  /** The final, near-lightless caves. */
  obsidian: {
    id: 'obsidian',
    background: 0x04050a,
    dirt: 0x2e3038,
    dirtLight: 0x474a56,
    dirtDark: 0x191b21,
    wall: 0x26282f,
    wallLight: 0x3c3f4a,
    wallDark: 0x141519,
    steel: 0x6a6f7d,
    steelLight: 0xa4abbc,
    steelDark: 0x363a44,
    ambient: 0x8fd0ff,
  },
} as const;

export const DEFAULT_PALETTE_ID = 'glacier';

/** Namespaced keys used by the persistence layer. */
export const STORAGE_DB_NAME = 'cavern-run';
export const STORAGE_DB_VERSION = 1;
export const STORAGE_FALLBACK_PREFIX = 'cavern-run:';
