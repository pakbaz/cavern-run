/**
 * Tile vocabulary for the cave simulation.
 *
 * The project compiles with `erasableSyntaxOnly`, so no TypeScript `enum`s:
 * tile ids are a frozen const object plus a derived union type. Values are
 * small integers because the grid is stored in a `Uint8Array`.
 */

export const Tile = {
  Empty: 0,
  Dirt: 1,

  /** Boulder at rest, and the same boulder mid-fall. */
  Boulder: 2,
  BoulderFalling: 3,

  /** Diamond at rest, and mid-fall. */
  Diamond: 4,
  DiamondFalling: 5,

  /** Brick wall: rounded, so things roll off it, and destructible. */
  Wall: 6,
  /** Titanium: nothing rolls off it and nothing destroys it. */
  Steel: 7,

  /** Converts falling boulders to diamonds (and back) while charged. */
  MagicWall: 8,

  /** Walls that creep sideways / vertically into empty space. */
  ExpandingWallH: 9,
  ExpandingWallV: 10,
  ExpandingWallAny: 11,

  /** Falling objects seep through slime; the player cannot. */
  Slime: 12,

  Amoeba: 13,

  Player: 14,
  /** Pulsing egg the player hatches from at cave start. */
  PlayerBirth: 15,

  FireflyUp: 16,
  FireflyRight: 17,
  FireflyDown: 18,
  FireflyLeft: 19,

  ButterflyUp: 20,
  ButterflyRight: 21,
  ButterflyDown: 22,
  ButterflyLeft: 23,

  ExitClosed: 24,
  ExitOpen: 25,

  /** Explosion cells; `Cave.stage` counts each one down. */
  ExplosionEmpty: 26,
  ExplosionDiamond: 27,
} as const;

export type TileId = (typeof Tile)[keyof typeof Tile];

/** Total number of distinct tile ids; sizes the metadata lookup tables. */
export const TILE_COUNT = 28;

/* ------------------------------------------------------------------ *
 * Directions
 * ------------------------------------------------------------------ */

export const Dir = {
  Up: 0,
  Right: 1,
  Down: 2,
  Left: 3,
} as const;

export type Direction = (typeof Dir)[keyof typeof Dir];

export const DIR_DX: readonly number[] = [0, 1, 0, -1];
export const DIR_DY: readonly number[] = [-1, 0, 1, 0];

/** Counter-clockwise turn. */
export function turnLeft(dir: Direction): Direction {
  return ((dir + 3) % 4) as Direction;
}

/** Clockwise turn. */
export function turnRight(dir: Direction): Direction {
  return ((dir + 1) % 4) as Direction;
}

export function reverse(dir: Direction): Direction {
  return ((dir + 2) % 4) as Direction;
}

/* ------------------------------------------------------------------ *
 * Creature <-> direction mapping
 * ------------------------------------------------------------------ */

const FIREFLY_BY_DIR: readonly TileId[] = [
  Tile.FireflyUp,
  Tile.FireflyRight,
  Tile.FireflyDown,
  Tile.FireflyLeft,
];

const BUTTERFLY_BY_DIR: readonly TileId[] = [
  Tile.ButterflyUp,
  Tile.ButterflyRight,
  Tile.ButterflyDown,
  Tile.ButterflyLeft,
];

export function fireflyFacing(dir: Direction): TileId {
  return FIREFLY_BY_DIR[dir];
}

export function butterflyFacing(dir: Direction): TileId {
  return BUTTERFLY_BY_DIR[dir];
}

/** Direction a creature tile faces, or `Dir.Up` for non-creature tiles. */
export function creatureDirection(tile: TileId): Direction {
  if (tile >= Tile.FireflyUp && tile <= Tile.FireflyLeft) {
    return (tile - Tile.FireflyUp) as Direction;
  }
  if (tile >= Tile.ButterflyUp && tile <= Tile.ButterflyLeft) {
    return (tile - Tile.ButterflyUp) as Direction;
  }
  return Dir.Up;
}

/* ------------------------------------------------------------------ *
 * Metadata tables
 * ------------------------------------------------------------------ */

function table(...members: TileId[]): Readonly<Uint8Array> {
  const flags = new Uint8Array(TILE_COUNT);
  for (const tile of members) flags[tile] = 1;
  return flags;
}

/**
 * Things roll off rounded surfaces. Classic set: boulders, diamonds and brick
 * walls are rounded; dirt, steel, magic walls and creatures are not.
 */
const ROUNDED = table(
  Tile.Boulder,
  Tile.BoulderFalling,
  Tile.Diamond,
  Tile.DiamondFalling,
  Tile.Wall,
  Tile.ExpandingWallH,
  Tile.ExpandingWallV,
  Tile.ExpandingWallAny,
);

/** Obeys gravity. */
const FALLS = table(Tile.Boulder, Tile.BoulderFalling, Tile.Diamond, Tile.DiamondFalling);

/** Currently in free fall (lethal on landing). */
const FALLING = table(Tile.BoulderFalling, Tile.DiamondFalling);

/** Survives a neighbouring explosion. */
const BLAST_PROOF = table(Tile.Steel, Tile.MagicWall, Tile.ExitClosed, Tile.ExitOpen);

/** Detonates when a falling object lands on it. */
const CRUSHABLE = table(
  Tile.Player,
  Tile.FireflyUp,
  Tile.FireflyRight,
  Tile.FireflyDown,
  Tile.FireflyLeft,
  Tile.ButterflyUp,
  Tile.ButterflyRight,
  Tile.ButterflyDown,
  Tile.ButterflyLeft,
);

const FIREFLY = table(Tile.FireflyUp, Tile.FireflyRight, Tile.FireflyDown, Tile.FireflyLeft);

const BUTTERFLY = table(
  Tile.ButterflyUp,
  Tile.ButterflyRight,
  Tile.ButterflyDown,
  Tile.ButterflyLeft,
);

/**
 * Kills the player on contact. The amoeba is deliberately absent: like the
 * original, it merely blocks the player rather than killing them.
 */
const DEADLY = table(
  Tile.FireflyUp,
  Tile.FireflyRight,
  Tile.FireflyDown,
  Tile.FireflyLeft,
  Tile.ButterflyUp,
  Tile.ButterflyRight,
  Tile.ButterflyDown,
  Tile.ButterflyLeft,
);

/** The player can walk straight into these. */
const WALKABLE = table(
  Tile.Empty,
  Tile.Dirt,
  Tile.Diamond,
  Tile.DiamondFalling,
  Tile.ExitOpen,
);

/** Explosions and amoeba growth treat these as free space. */
const SOFT = table(Tile.Empty, Tile.Dirt);

const EXPANDING = table(Tile.ExpandingWallH, Tile.ExpandingWallV, Tile.ExpandingWallAny);

const EXPLOSION = table(Tile.ExplosionEmpty, Tile.ExplosionDiamond);

export const isRounded = (t: TileId): boolean => ROUNDED[t] === 1;
export const isFallable = (t: TileId): boolean => FALLS[t] === 1;
export const isFalling = (t: TileId): boolean => FALLING[t] === 1;
export const isBlastProof = (t: TileId): boolean => BLAST_PROOF[t] === 1;
export const isCrushable = (t: TileId): boolean => CRUSHABLE[t] === 1;
export const isFirefly = (t: TileId): boolean => FIREFLY[t] === 1;
export const isButterfly = (t: TileId): boolean => BUTTERFLY[t] === 1;
export const isCreature = (t: TileId): boolean => FIREFLY[t] === 1 || BUTTERFLY[t] === 1;
export const isDeadly = (t: TileId): boolean => DEADLY[t] === 1;
export const isWalkable = (t: TileId): boolean => WALKABLE[t] === 1;
export const isSoft = (t: TileId): boolean => SOFT[t] === 1;
export const isExpandingWall = (t: TileId): boolean => EXPANDING[t] === 1;
export const isExplosion = (t: TileId): boolean => EXPLOSION[t] === 1;

/** Diamonds count toward the quota whether resting or falling. */
export const isDiamond = (t: TileId): boolean => t === Tile.Diamond || t === Tile.DiamondFalling;
export const isBoulder = (t: TileId): boolean => t === Tile.Boulder || t === Tile.BoulderFalling;

/** Settle a falling tile, or set a resting tile in motion. */
export function asResting(t: TileId): TileId {
  if (t === Tile.BoulderFalling) return Tile.Boulder;
  if (t === Tile.DiamondFalling) return Tile.Diamond;
  return t;
}

export function asFalling(t: TileId): TileId {
  if (t === Tile.Boulder) return Tile.BoulderFalling;
  if (t === Tile.Diamond) return Tile.DiamondFalling;
  return t;
}

/** Human-readable name, for test failures and debug overlays. */
export function tileName(t: TileId): string {
  for (const [key, value] of Object.entries(Tile)) {
    if (value === t) return key;
  }
  return `Unknown(${t})`;
}
