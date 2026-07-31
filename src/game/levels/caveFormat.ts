import { CAVE_HEIGHT, CAVE_WIDTH } from '../../config';
import { Cave } from '../engine/Cave';
import type { CaveTuning } from '../engine/simTypes';
import { Tile, isButterfly, type TileId } from '../engine/tiles';

/**
 * Caves are authored as ASCII art so a layout can be read, diffed and tweaked
 * directly in source. One character per cell.
 */
export const CAVE_CHARS: Readonly<Record<string, TileId>> = {
  ' ': Tile.Empty,
  '.': Tile.Dirt,
  r: Tile.Boulder,
  d: Tile.Diamond,
  w: Tile.Wall,
  W: Tile.Steel,
  M: Tile.MagicWall,
  H: Tile.ExpandingWallH,
  V: Tile.ExpandingWallV,
  X: Tile.ExpandingWallAny,
  S: Tile.Slime,
  a: Tile.Amoeba,
  P: Tile.Player,
  f: Tile.FireflyLeft,
  F: Tile.FireflyRight,
  b: Tile.ButterflyDown,
  B: Tile.ButterflyUp,
  E: Tile.ExitClosed,
};

const TILE_CHARS: Readonly<Record<number, string>> = {
  ...Object.fromEntries(Object.entries(CAVE_CHARS).map(([char, tile]) => [tile, char])),
  // Transient tiles that never appear in an authored map but do show up when
  // serialising a live grid.
  [Tile.BoulderFalling]: 'r',
  [Tile.DiamondFalling]: 'd',
  [Tile.PlayerBirth]: 'p',
  [Tile.ExitOpen]: 'e',
  [Tile.ExplosionEmpty]: '*',
  [Tile.ExplosionDiamond]: '+',
};

/** A complete cave: layout plus the tuning the simulation runs it with. */
export interface CaveSpec extends CaveTuning {
  readonly id: string;
  /** Display letter, A through T. */
  readonly letter: string;
  readonly name: string;
  /** Key into `PALETTES`. */
  readonly paletteId: string;
  /** One string per row, `CAVE_WIDTH` characters wide. */
  readonly map: readonly string[];
  /** Short line of flavour shown on the intro card. */
  readonly hint: string;
}

export interface ParsedMap {
  readonly width: number;
  readonly height: number;
  readonly tiles: TileId[];
}

/** Convert ASCII rows into a flat tile array. */
export function parseCaveMap(map: readonly string[]): ParsedMap {
  if (map.length === 0) throw new Error('Cave map is empty');

  const height = map.length;
  const width = map[0].length;
  const tiles: TileId[] = new Array<TileId>(width * height);

  for (let y = 0; y < height; y += 1) {
    const row = map[y];
    if (row.length !== width) {
      throw new Error(`Cave row ${y} is ${row.length} chars, expected ${width}`);
    }
    for (let x = 0; x < width; x += 1) {
      const char = row[x];
      const tile = CAVE_CHARS[char];
      if (tile === undefined) {
        throw new Error(`Unknown cave character '${char}' at row ${y}, column ${x}`);
      }
      tiles[y * width + x] = tile;
    }
  }

  return { width, height, tiles };
}

/** Build a fresh, playable grid from a spec. */
export function buildCave(spec: CaveSpec): Cave {
  const parsed = parseCaveMap(spec.map);
  return Cave.fromTiles(parsed.width, parsed.height, parsed.tiles);
}

/** Render a grid back to ASCII. Used by tests and the debug overlay. */
export function caveToMap(cave: Cave): string[] {
  const rows: string[] = [];
  for (let y = 0; y < cave.height; y += 1) {
    let row = '';
    for (let x = 0; x < cave.width; x += 1) {
      row += TILE_CHARS[cave.get(x, y)] ?? '?';
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Structural check for a cave. Returns a list of human-readable problems; an
 * empty list means the cave is well-formed. Every shipped cave is asserted
 * clean by the test suite, so a broken layout can never reach a player.
 */
export function validateCave(spec: CaveSpec): string[] {
  const problems: string[] = [];

  let parsed: ParsedMap;
  try {
    parsed = parseCaveMap(spec.map);
  } catch (error) {
    return [`${spec.id}: ${(error as Error).message}`];
  }

  if (parsed.width !== CAVE_WIDTH || parsed.height !== CAVE_HEIGHT) {
    problems.push(
      `${spec.id}: expected ${CAVE_WIDTH}x${CAVE_HEIGHT}, got ${parsed.width}x${parsed.height}`,
    );
  }

  const counts = tally(parsed.tiles);
  const players = counts.get(Tile.Player) ?? 0;
  const exits = counts.get(Tile.ExitClosed) ?? 0;

  if (players !== 1) problems.push(`${spec.id}: expected exactly 1 player, found ${players}`);
  if (exits !== 1) problems.push(`${spec.id}: expected exactly 1 exit, found ${exits}`);

  if (!hasSealedBorder(parsed)) {
    problems.push(`${spec.id}: border must be solid steel`);
  }

  if (spec.diamondsRequired <= 0) {
    problems.push(`${spec.id}: diamondsRequired must be positive`);
  }

  const amoebaCredit = amoebaYield(spec, parsed);
  const obtainable = countObtainableDiamonds(counts, amoebaCredit);
  if (obtainable < spec.diamondsRequired) {
    problems.push(
      `${spec.id}: quota of ${spec.diamondsRequired} exceeds the ${obtainable} diamonds the cave can yield`,
    );
  }

  if (spec.timeLimit <= 0) problems.push(`${spec.id}: timeLimit must be positive`);
  if (spec.tickHz <= 0) problems.push(`${spec.id}: tickHz must be positive`);

  problems.push(...checkReachability(spec, parsed, amoebaCredit));

  return problems;
}

/**
 * Conservative solvability check. Floods outward from the player through
 * everything a digger can pass through or shift out of the way, and asserts the
 * exit plus at least the quota's worth of diamonds fall inside that region.
 * Static masonry, magic walls, slime and the amoeba block the flood, so a vault
 * that has been accidentally sealed off is caught before it can ship.
 */
function checkReachability(spec: CaveSpec, parsed: ParsedMap, amoebaCredit: number): string[] {
  const { width, height, tiles } = parsed;
  const start = tiles.indexOf(Tile.Player);
  if (start < 0) return [];

  const seen = new Uint8Array(width * height);
  const stack = [start];
  seen[start] = 1;

  let reachableDiamonds = 0;
  let reachableBoulders = 0;
  let reachedExit = false;
  let touchesAmoeba = false;
  let touchesMagicWall = false;

  while (stack.length > 0) {
    const index = stack.pop() as number;
    const tile = tiles[index];

    if (tile === Tile.Diamond) reachableDiamonds += 1;
    if (tile === Tile.Boulder) reachableBoulders += 1;
    if (tile === Tile.ExitClosed) reachedExit = true;
    if (isButterfly(tile)) reachableDiamonds += BUTTERFLY_YIELD;

    const x = index % width;
    const y = (index - x) / width;

    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = ny * width + nx;
      const neighbour = tiles[next];

      // The amoeba and a magic wall both block movement, but standing next to
      // one still means the player can exploit it for diamonds.
      if (neighbour === Tile.Amoeba) touchesAmoeba = true;
      if (neighbour === Tile.MagicWall) touchesMagicWall = true;

      if (seen[next] === 1 || !PASSABLE.has(neighbour)) continue;
      seen[next] = 1;
      stack.push(next);
    }
  }

  if (touchesAmoeba) reachableDiamonds += amoebaCredit;
  if (touchesMagicWall) reachableDiamonds += reachableBoulders;

  const problems: string[] = [];
  if (!reachedExit) problems.push(`${spec.id}: the exit cannot be reached from the start`);
  if (reachableDiamonds < spec.diamondsRequired) {
    problems.push(
      `${spec.id}: only ${reachableDiamonds} diamonds are reachable, quota is ${spec.diamondsRequired}`,
    );
  }
  return problems;
}

/** A butterfly's blast clears a 3x3; six diamonds is the conservative take. */
const BUTTERFLY_YIELD = 6;

/** Cells the amoeba spreads into, and the tiles it can spread through. */
const AMOEBA_FOOD: ReadonlySet<TileId> = new Set<TileId>([Tile.Empty, Tile.Dirt, Tile.Amoeba]);

/**
 * How many diamonds an amoeba can be relied on for -- often none.
 *
 * An amoeba only crystallises when it has run out of room to grow. Give it more
 * space than `amoebaMaxSize` and it hits its ceiling first and turns to stone
 * instead, which is worth nothing to the player. Cave O once shipped with a
 * quota that could only be met by an amoeba in a chamber three times its
 * maximum size, so it was impossible to finish; crediting the amoeba only when
 * its chamber is genuinely small enough is what stops that recurring.
 */
function amoebaYield(spec: CaveSpec, parsed: ParsedMap): number {
  const { width, height, tiles } = parsed;
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];

  for (let i = 0; i < tiles.length; i += 1) {
    if (tiles[i] === Tile.Amoeba && seen[i] === 0) {
      seen[i] = 1;
      stack.push(i);
    }
  }
  if (stack.length === 0) return 0;

  let room = 0;
  while (stack.length > 0) {
    const index = stack.pop() as number;
    room += 1;

    const x = index % width;
    const y = (index - x) / width;

    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = ny * width + nx;
      if (seen[next] === 1 || !AMOEBA_FOOD.has(tiles[next])) continue;
      seen[next] = 1;
      stack.push(next);
    }
  }

  return room < spec.amoebaMaxSize ? room : 0;
}

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** Tiles a player can dig through, walk over, collect, or shove aside. */
const PASSABLE: ReadonlySet<TileId> = new Set<TileId>([
  Tile.Empty,
  Tile.Dirt,
  Tile.Diamond,
  Tile.Boulder,
  Tile.Player,
  Tile.ExitClosed,
  Tile.FireflyLeft,
  Tile.FireflyRight,
  Tile.FireflyUp,
  Tile.FireflyDown,
  Tile.ButterflyLeft,
  Tile.ButterflyRight,
  Tile.ButterflyUp,
  Tile.ButterflyDown,
]);

function tally(tiles: readonly TileId[]): Map<TileId, number> {
  const counts = new Map<TileId, number>();
  for (const tile of tiles) {
    counts.set(tile, (counts.get(tile) ?? 0) + 1);
  }
  return counts;
}

/**
 * Diamonds already lying around, plus what butterflies and a crystallised
 * amoeba can be made to yield. A butterfly's blast clears a 3x3, but its own
 * cell aside, only the destructible neighbours become diamonds; six is a
 * deliberately conservative estimate.
 */
function countObtainableDiamonds(counts: Map<TileId, number>, amoebaCredit: number): number {
  let total = counts.get(Tile.Diamond) ?? 0;

  for (const [tile, count] of counts) {
    if (isButterfly(tile)) total += count * BUTTERFLY_YIELD;
  }

  total += amoebaCredit;
  if ((counts.get(Tile.MagicWall) ?? 0) > 0) total += counts.get(Tile.Boulder) ?? 0;

  return total;
}

function hasSealedBorder(parsed: ParsedMap): boolean {
  const { width, height, tiles } = parsed;
  for (let x = 0; x < width; x += 1) {
    if (tiles[x] !== Tile.Steel) return false;
    if (tiles[(height - 1) * width + x] !== Tile.Steel) return false;
  }
  for (let y = 0; y < height; y += 1) {
    if (tiles[y * width] !== Tile.Steel) return false;
    if (tiles[y * width + width - 1] !== Tile.Steel) return false;
  }
  return true;
}
