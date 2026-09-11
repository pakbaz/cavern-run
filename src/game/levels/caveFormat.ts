import { CAVE_HEIGHT, CAVE_WIDTH } from '../../config';
import { Cave } from '../engine/Cave';
import type { CaveTuning } from '../engine/simTypes';
import {
  Tile,
  isBlastProof,
  isButterfly,
  isCreature,
  isFallable,
  type TileId,
} from '../engine/tiles';

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
  /** One-line description of the concrete win plan for menus and briefings. */
  readonly objective: string;
  /** Primary rules a player must understand to complete this cave. */
  readonly mechanics: readonly CaveMechanic[];
  /** Campaign challenge tier, from introductory (1) through finale (5). */
  readonly difficulty: 1 | 2 | 3 | 4 | 5;
}

export type CaveMechanic =
  | 'digging'
  | 'gravity'
  | 'boulder-pushing'
  | 'fireflies'
  | 'butterflies'
  | 'magic-wall'
  | 'amoeba'
  | 'expanding-wall'
  | 'slime';

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
  const butterflyCredit = butterflyYields(parsed);
  const obtainable = countObtainableDiamonds(counts, amoebaCredit, butterflyCredit);
  if (obtainable < spec.diamondsRequired) {
    problems.push(
      `${spec.id}: quota of ${spec.diamondsRequired} exceeds the ${obtainable} diamonds the cave can yield`,
    );
  }

  if (spec.timeLimit <= 0) problems.push(`${spec.id}: timeLimit must be positive`);
  if (spec.tickHz <= 0) problems.push(`${spec.id}: tickHz must be positive`);
  if (!Number.isInteger(spec.difficulty) || spec.difficulty < 1 || spec.difficulty > 5) {
    problems.push(`${spec.id}: difficulty must be an integer from 1 to 5`);
  }
  if (spec.objective.trim().length === 0) problems.push(`${spec.id}: objective must not be empty`);
  if (spec.mechanics.length === 0) problems.push(`${spec.id}: mechanics must not be empty`);

  problems.push(...checkReachability(spec, parsed, amoebaCredit, butterflyCredit));

  return problems;
}

/**
 * Conservative solvability check. Floods outward from the player through
 * everything a digger can pass through or shift out of the way, and asserts the
 * exit plus at least the quota's worth of diamonds fall inside that region.
 * Static masonry, magic walls, slime and the amoeba block the flood, so a vault
 * that has been accidentally sealed off is caught before it can ship.
 */
function checkReachability(
  spec: CaveSpec,
  parsed: ParsedMap,
  amoebaCredit: number,
  butterflyCredit: ReadonlyMap<number, number>,
): string[] {
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
    if (isButterfly(tile)) reachableDiamonds += butterflyCredit.get(index) ?? 0;

    const x = index % width;
    const y = (index - x) / width;

    // A reachable loaded support over a boxed creature is a deterministic
    // demolition charge. Admit only the 3x3 blast footprint so a deliberate
    // brick gate validates without treating arbitrary masonry as passable.
    if (
      tile === Tile.Dirt &&
      isFallable(tiles[index - width] ?? Tile.Steel) &&
      isCreature(tiles[index + width] ?? Tile.Steel)
    ) {
      for (let by = y; by <= y + 2; by += 1) {
        for (let bx = x - 1; bx <= x + 1; bx += 1) {
          if (bx < 0 || by < 0 || bx >= width || by >= height) continue;
          const blast = by * width + bx;
          if (seen[blast] === 1 || isBlastProof(tiles[blast])) continue;
          seen[blast] = 1;
          stack.push(blast);
        }
      }
    }

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

/**
 * Credit the largest possible blast footprint in each butterfly's initial patrol
 * space. Steel-cheeked nests yield six, but all-destructible courts yield nine;
 * a blanket six rejected quotas that the normal-input replay actually earns.
 * This is a static upper bound, not proof that a player can time the shot;
 * the normal-input campaign playthrough must still earn the quota.
 */
function butterflyYields(parsed: ParsedMap): ReadonlyMap<number, number> {
  const { width, height, tiles } = parsed;
  const yields = new Map<number, number>();
  for (let start = 0; start < tiles.length; start += 1) {
    if (!isButterfly(tiles[start])) continue;
    const seen = new Set<number>();
    const pending = [start];
    let maximum = 0;
    while (pending.length > 0) {
      const at = pending.pop()!;
      if (seen.has(at)) continue;
      seen.add(at);
      const x = at % width;
      const y = Math.floor(at / width);
      let footprint = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height &&
              !isBlastProof(tiles[ny * width + nx])) footprint += 1;
        }
      }
      maximum = Math.max(maximum, footprint);
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (tiles[next] === Tile.Empty && !seen.has(next)) pending.push(next);
      }
    }
    yields.set(start, maximum);
  }
  return yields;
}

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
  const openRoom = amoebaRoom(parsed);
  if (openRoom === 0) return 0;
  if (openRoom < spec.amoebaMaxSize) return openRoom;

  // Some campaign puzzles ask the player to slide a boulder along a short
  // horizontal rail into the amoeba's escape choke. Test every reachable stop
  // on such a rail and credit only a genuinely bounded post-push chamber.
  let containedRoom = 0;
  for (let index = 0; index < parsed.tiles.length; index += 1) {
    if (parsed.tiles[index] !== Tile.Boulder) continue;
    const x = index % parsed.width;
    const y = Math.floor(index / parsed.width);

    for (const dx of [-1, 1]) {
      for (let nx = x + dx; nx > 0 && nx < parsed.width - 1; nx += dx) {
        const destination = y * parsed.width + nx;
        if (parsed.tiles[destination] !== Tile.Empty) break;
        const room = amoebaRoom(parsed, destination, index);
        if (room < spec.amoebaMaxSize) containedRoom = Math.max(containedRoom, room);
      }
    }
  }
  return containedRoom;
}

function amoebaRoom(parsed: ParsedMap, blocked = -1, vacated = -1): number {
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
      const tile = next === vacated ? Tile.Empty : tiles[next];
      if (next === blocked || seen[next] === 1 || !AMOEBA_FOOD.has(tile)) continue;
      seen[next] = 1;
      stack.push(next);
    }
  }

  return room;
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
 * amoeba can be made to yield. Butterfly credit uses each patrol space's
 * destructible footprint rather than assuming every nest has steel cheeks.
 */
function countObtainableDiamonds(
  counts: Map<TileId, number>,
  amoebaCredit: number,
  butterflyCredit: ReadonlyMap<number, number>,
): number {
  let total = counts.get(Tile.Diamond) ?? 0;

  for (const credit of butterflyCredit.values()) total += credit;

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
