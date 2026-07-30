/**
 * A cave-playing bot, used to prove every cave in the campaign can actually be
 * finished through legitimate play: no forced outcomes, no reaching into the
 * grid, just the same `update(dt, input)` a player drives with the keyboard.
 *
 * It plays the way a person does. Every scan it rebuilds a danger map -- the
 * shafts a boulder is about to come down, the cells a creature can reach --
 * then runs a cost-weighted search for the best thing to do next:
 *
 *   1. get clear of anything about to land on it
 *   2. walk out of the open exit
 *   3. take the nearest diamond
 *   4. dig out whatever is holding a boulder up, so it drops through the slime,
 *      the magic wall or the creature underneath it
 *   5. dig anywhere, to open the cave up
 *
 * The one piece of real technique it has is the grab modifier: when the cell it
 * wants is loaded -- dirt with a boulder resting on it, a diamond under an
 * overhang -- it takes the cell without stepping into it and lets whatever was
 * up there fall past. That single move is what feeds magic walls and drops
 * rocks on butterflies.
 */

import { CaveSession } from '../game/engine/CaveSession';
import { CaveOutcome, type PlayerInput } from '../game/engine/simTypes';
import {
  Dir,
  Tile,
  isCreature,
  isDiamond,
  isFallable,
  isRounded,
  type Direction,
  type TileId,
} from '../game/engine/tiles';

type Sim = CaveSession['simulation'];

const STEPS: readonly { dir: Direction; dx: number; dy: number }[] = [
  { dir: Dir.Up, dx: 0, dy: -1 },
  { dir: Dir.Right, dx: 1, dy: 0 },
  { dir: Dir.Down, dx: 0, dy: 1 },
  { dir: Dir.Left, dx: -1, dy: 0 },
];

/** Something is going to land here. Never walk in; grabbing is still fine. */
const FALL = 1;
/** Orthogonally next to a creature. It detonates the moment we stand here. */
const CREATURE_HIT = 2;
/** Two cells from a creature: survivable, but only for a scan. */
const CREATURE_NEAR = 4;
/** Under or beside the amoeba: it grows over you, or crystallises on top of you. */
const AMOEBA = 8;

const LETHAL = FALL | CREATURE_HIT;

const STEP_COST = 1;
const PUSH_COST = 10;
const CREATURE_COST = 200;
const AMOEBA_COST = 80;
const UNREACHABLE = Number.POSITIVE_INFINITY;

/** How many scans a cell stays "just been there", and what revisiting costs. */
const TRAIL_LENGTH = 12;
const TRAIL_COST = 4;

/**
 * Where the miner has just been.
 *
 * Without this it will happily pace between two cells forever: from the left
 * end of a pocket the cheapest diamond is to the right, from the right end it
 * is back to the left, and neither view ever changes. Charging for ground it
 * has only just covered breaks the tie in favour of somewhere new.
 */
export class Trail {
  private readonly heat = new Map<number, number>();

  /** Note where the miner is standing and let the older marks fade. */
  mark(cell: number): void {
    for (const [at, left] of this.heat) {
      if (left <= 1) this.heat.delete(at);
      else this.heat.set(at, left - 1);
    }
    this.heat.set(cell, TRAIL_LENGTH);
  }

  cost(cell: number): number {
    return (this.heat.get(cell) ?? 0) * TRAIL_COST;
  }
}

/** Cells the miner can move into unaided. */
function isEnterable(tile: TileId): boolean {
  return (
    tile === Tile.Empty ||
    tile === Tile.Dirt ||
    tile === Tile.Diamond ||
    tile === Tile.DiamondFalling ||
    tile === Tile.ExitOpen
  );
}

/** Cells the miner can clear from where it stands, without stepping in. */
function isGrabbable(tile: TileId): boolean {
  return tile === Tile.Dirt || isDiamond(tile);
}

/** A boulder can be shouldered sideways when the cell beyond it is clear. */
function isPushable(sim: Sim, tile: TileId, x: number, y: number, dx: number): boolean {
  return dx !== 0 && tile === Tile.Boulder && sim.cave.get(x + dx, y) === Tile.Empty;
}

/** Paint the column of air under (x, y) as somewhere about to be occupied. */
function markShaft(sim: Sim, danger: Uint8Array, x: number, y: number, flag: number): void {
  const { cave } = sim;
  for (let below = y + 1; below < cave.height; below += 1) {
    if (cave.get(x, below) !== Tile.Empty) break;
    danger[below * cave.width + x] |= flag;
  }
}

/**
 * Everything that is about to hurt, as a per-cell bitmask.
 *
 * A boulder is only a threat once there is air under it, which is why standing
 * beneath a resting one is safe and stepping into the shaft below a hanging one
 * is not. Boulders perched on anything rounded get their roll predicted too.
 * Creatures detonate the instant they are orthogonally adjacent to the miner,
 * so their blast radius is projected a scan ahead. And an amoeba that outgrows
 * its cap turns into a boulder in every cell at once, so anywhere underneath it
 * is somewhere to not be standing.
 */
function dangerMap(sim: Sim): Uint8Array {
  const { cave } = sim;
  const { width, height } = cave;
  const danger = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tile = cave.get(x, y);

      if (isFallable(tile)) {
        const below = cave.get(x, y + 1);
        if (below === Tile.Empty) {
          markShaft(sim, danger, x, y, FALL);
        } else if (isRounded(below)) {
          // It will roll off: left is tried first, exactly as gravity does it.
          for (const dx of [-1, 1]) {
            if (cave.get(x + dx, y) !== Tile.Empty) continue;
            if (cave.get(x + dx, y + 1) !== Tile.Empty) continue;
            danger[y * width + x + dx] |= FALL;
            markShaft(sim, danger, x + dx, y, FALL);
            break;
          }
        }
        continue;
      }

      if (isCreature(tile)) {
        // Standing alongside one detonates it there and then. Two cells out is
        // only dangerous after it has taken a step, so it is worth risking.
        for (let dy = -2; dy <= 2; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            const reach = Math.abs(dx) + Math.abs(dy);
            if (reach > 2) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (!cave.inBounds(nx, ny)) continue;
            danger[ny * width + nx] |= reach <= 1 ? CREATURE_HIT : CREATURE_NEAR;
          }
        }
        continue;
      }

      if (tile === Tile.Amoeba) {
        for (const { dx, dy } of STEPS) {
          const nx = x + dx;
          const ny = y + dy;
          if (!cave.inBounds(nx, ny)) continue;
          danger[ny * width + nx] |= AMOEBA;
        }
        // Everything it can crystallise on top of.
        for (let below = y + 1; below < height; below += 1) {
          const under = cave.get(x, below);
          if (under !== Tile.Empty && under !== Tile.Dirt) break;
          danger[below * width + x] |= AMOEBA;
        }
      }
    }
  }

  return danger;
}

function cellCost(flags: number): number {
  if ((flags & LETHAL) !== 0) return UNREACHABLE;
  let cost = STEP_COST;
  if ((flags & CREATURE_NEAR) !== 0) cost += CREATURE_COST;
  if ((flags & AMOEBA) !== 0) cost += AMOEBA_COST;
  return cost;
}

/** Binary min-heap of cell indices, keyed by route cost. */
class Frontier {
  private readonly cells: number[] = [];
  private readonly costs: number[] = [];

  get size(): number {
    return this.cells.length;
  }

  push(cell: number, cost: number): void {
    this.cells.push(cell);
    this.costs.push(cost);
    let i = this.cells.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.costs[parent] <= this.costs[i]) break;
      this.swap(parent, i);
      i = parent;
    }
  }

  pop(): number {
    const top = this.cells[0];
    const cell = this.cells.pop() as number;
    const cost = this.costs.pop() as number;
    if (this.cells.length > 0) {
      this.cells[0] = cell;
      this.costs[0] = cost;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.cells.length && this.costs[left] < this.costs[smallest]) smallest = left;
        if (right < this.cells.length && this.costs[right] < this.costs[smallest]) smallest = right;
        if (smallest === i) break;
        this.swap(smallest, i);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.cells[a], this.cells[b]] = [this.cells[b], this.cells[a]];
    [this.costs[a], this.costs[b]] = [this.costs[b], this.costs[a]];
  }
}

/**
 * Direction of the miner's very next step along the cheapest route to any cell
 * `wants` accepts, or null when there is no route.
 *
 * Dijkstra rather than a plain breadth-first search, because the whole point is
 * to prefer a long safe way round over a short walk past a butterfly.
 */
function approach(
  sim: Sim,
  danger: Uint8Array,
  wants: (tile: TileId, x: number, y: number) => boolean,
  trail: Trail | null = null,
): Direction | null {
  const { cave } = sim;
  const { width, height } = cave;
  const size = width * height;
  const start = sim.runtime.playerX + sim.runtime.playerY * width;

  const dist = new Float64Array(size).fill(UNREACHABLE);
  const firstMove = new Int8Array(size).fill(-1);
  const settled = new Uint8Array(size);
  const frontier = new Frontier();

  dist[start] = 0;
  frontier.push(start, 0);

  while (frontier.size > 0) {
    const at = frontier.pop();
    if (settled[at] === 1) continue;
    settled[at] = 1;

    const x = at % width;
    const y = (at - x) / width;

    for (const { dir, dx, dy } of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

      const next = nx + ny * width;
      if (settled[next] === 1) continue;

      const tile = cave.get(nx, ny);
      const step: Direction = firstMove[at] >= 0 ? (firstMove[at] as Direction) : dir;

      if (wants(tile, nx, ny)) return step;

      let extra = 0;
      if (!isEnterable(tile)) {
        if (!isPushable(sim, tile, nx, ny, dx)) continue;
        extra = PUSH_COST;
      }

      const cost = dist[at] + cellCost(danger[next]) + extra + (trail?.cost(next) ?? 0);
      if (cost >= dist[next]) continue;
      dist[next] = cost;
      firstMove[next] = step;
      frontier.push(next, cost);
    }
  }

  return null;
}

/**
 * Can the miner reach any cell matching `wants` at all, ignoring danger?
 * Used to assert that a cave never seals its own exit.
 */
export function canReach(sim: Sim, wants: (tile: TileId) => boolean): boolean {
  const clear = new Uint8Array(sim.cave.width * sim.cave.height);
  return approach(sim, clear, (tile) => wants(tile)) !== null;
}

/** True when something is resting on (x, y) and will drop the moment it clears. */
function isLoaded(sim: Sim, x: number, y: number): boolean {
  return isFallable(sim.cave.get(x, y - 1));
}

/** Dirt with a boulder or diamond resting on it: dig it and the load drops. */
function isLoadedDirt(sim: Sim, tile: TileId, x: number, y: number): boolean {
  return tile === Tile.Dirt && isLoaded(sim, x, y);
}

/**
 * Turn a step direction into an actual key press.
 *
 * Standing under a resting boulder is safe -- the miner becomes its support --
 * so stepping up into a loaded cell is fine. Clearing that cell from below is
 * not: the load drops into the hole and then onto our head. That asymmetry is
 * the whole of the technique, and it is what lets the miner tunnel out from
 * under a rock, feed a magic wall, and drop one on a butterfly.
 */
function commit(
  sim: Sim,
  danger: Uint8Array,
  dir: Direction | null,
  dropLoads: boolean,
): PlayerInput | null {
  if (dir === null) return null;

  const { playerX, playerY } = sim.runtime;
  const target = STEPS.find((step) => step.dir === dir);
  if (target === undefined) return null;

  const tx = playerX + target.dx;
  const ty = playerY + target.dy;
  if (!sim.cave.inBounds(tx, ty)) return null;

  const tile = sim.cave.get(tx, ty);
  const loaded = isLoaded(sim, tx, ty);
  const lethal = (danger[tx + ty * sim.cave.width] & LETHAL) !== 0;

  // Standing there would kill us: take the cell from here instead, or wait.
  if (lethal) {
    if (!isGrabbable(tile) || (dir === Dir.Up && loaded)) return null;
    return { dir, grab: true };
  }

  // Deliberately pulling the rug out from under a boulder: never from below.
  if (dropLoads && loaded && isGrabbable(tile)) {
    if (dir === Dir.Up) return null;
    return { dir, grab: true };
  }

  return { dir, grab: false };
}


/** Everything the miner might want, in the order it wants it. */
function decide(sim: Sim, danger: Uint8Array, trail: Trail): PlayerInput {
  const { width } = sim.cave;
  const here = danger[sim.runtime.playerX + sim.runtime.playerY * width];

  // Something is about to land on this cell, or a creature is closing on it:
  // getting clear beats everything else we might do this scan.
  if ((here & (LETHAL | CREATURE_NEAR)) !== 0) {
    const bolt = approach(
      sim,
      danger,
      (tile, x, y) => isEnterable(tile) && (danger[x + y * width] & (LETHAL | CREATURE_NEAR)) === 0,
    );
    const escape = commit(sim, danger, bolt, false);
    if (escape !== null) return escape;
  }

  const takeDiamond: Goal = { wants: (tile) => isDiamond(tile), dropLoads: false };
  const dropLoad: Goal = {
    wants: (tile, x, y) => isLoadedDirt(sim, tile, x, y),
    dropLoads: true,
  };
  const anyDirt: Goal = { wants: (tile) => tile === Tile.Dirt, dropLoads: false };

  // Take what is lying about first; when nothing is reachable, go and make some
  // -- drop boulders through the slime, the magic wall or the nest below.
  const goals: Goal[] = [takeDiamond, dropLoad, anyDirt];

  if (sim.runtime.exitOpen) {
    goals.unshift({ wants: (tile: TileId) => tile === Tile.ExitOpen, dropLoads: false });
  }

  for (const goal of goals) {
    const move = commit(sim, danger, approach(sim, danger, goal.wants, trail), goal.dropLoads);
    if (move !== null) return move;
  }

  return { dir: null, grab: false };
}

interface Goal {
  readonly wants: (tile: TileId, x: number, y: number) => boolean;
  /** Grab a loaded cell rather than stepping into it, so its load drops. */
  readonly dropLoads: boolean;
}

export interface BotRun {
  readonly outcome: string;
  readonly diamonds: number;
  readonly ticks: number;
}

/**
 * Play the session's current cave until it ends or `maxTicks` elapse.
 * Everything goes through the normal update path, so a win here means the
 * cave is genuinely winnable.
 */
export function playCave(run: CaveSession, maxTicks = 4000): BotRun {
  const sim = run.simulation;
  const trail = new Trail();
  let ticks = 0;

  while (ticks < maxTicks && run.outcome === CaveOutcome.Running) {
    let input: PlayerInput = { dir: null, grab: false };

    if (sim.runtime.playerBorn && sim.runtime.playerAlive) {
      trail.mark(sim.runtime.playerX + sim.runtime.playerY * sim.cave.width);
      input = decide(sim, dangerMap(sim), trail);
    }

    run.update(run.tickMs, input);
    ticks += 1;
  }

  return {
    outcome: run.outcome,
    diamonds: sim.runtime.diamondsCollected,
    ticks,
  };
}
