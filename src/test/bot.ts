/**
 * A cave-playing bot, used to prove every cave in the campaign can actually be
 * finished through legitimate play: no forced outcomes, no reaching into the
 * grid, just the same `update(dt, input)` a player drives with the keyboard.
 *
 * The bot is deliberately simple. It breadth-first searches the live grid for
 * the nearest thing it wants (a diamond, then the open exit), walks one step
 * along that route per scan, and re-plans every scan so that shifting boulders
 * and wandering creatures are handled by replanning rather than by prediction.
 */

import { CaveSession } from '../game/engine/CaveSession';
import { CaveOutcome, type PlayerInput } from '../game/engine/simTypes';
import { Dir, Tile, type Direction, type TileId } from '../game/engine/tiles';

const STEPS: readonly { dir: Direction; dx: number; dy: number }[] = [
  { dir: Dir.Up, dx: 0, dy: -1 },
  { dir: Dir.Down, dx: 0, dy: 1 },
  { dir: Dir.Left, dx: -1, dy: 0 },
  { dir: Dir.Right, dx: 1, dy: 0 },
];

/** Tiles the miner can walk into or dig through. */
function isWalkable(tile: TileId): boolean {
  return (
    tile === Tile.Empty ||
    tile === Tile.Dirt ||
    tile === Tile.Diamond ||
    tile === Tile.ExitOpen
  );
}

/** Cells that are lethal or about to be, and so are never routed through. */
function isDangerous(sim: CaveSession['simulation'], x: number, y: number): boolean {
  for (const { dx, dy } of [
    { dx: 0, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ]) {
    const tile = sim.cave.get(x + dx, y + dy);
    if (tile >= Tile.FireflyUp && tile <= Tile.ButterflyLeft) return true;
    if (tile === Tile.Amoeba) return true;
  }

  // Look up the shaft above the cell. A rock resting directly on our head is
  // harmless -- it has nowhere to accelerate -- but one with air beneath it is
  // either already falling or about to, and will arrive with enough speed to
  // kill.
  for (let above = y - 1, gap = 0; above >= 0; above -= 1, gap += 1) {
    const tile = sim.cave.get(x, above);
    if (tile === Tile.Empty) continue;
    if (tile === Tile.BoulderFalling || tile === Tile.DiamondFalling) return true;
    if ((tile === Tile.Boulder || tile === Tile.Diamond) && gap > 0) return true;
    break;
  }
  return false;
}

/**
 * First step of the shortest route from the miner to any cell the goal test
 * accepts, or null when no route exists.
 */
function routeStep(
  sim: CaveSession['simulation'],
  wants: (tile: TileId) => boolean,
): Direction | null {
  const { playerX, playerY } = sim.runtime;
  const { width, height } = sim.cave;
  const seen = new Uint8Array(width * height);
  const firstMove = new Int8Array(width * height).fill(-1);
  const queue: number[] = [playerX + playerY * width];
  seen[queue[0]] = 1;

  for (let head = 0; head < queue.length; head += 1) {
    const at = queue[head];
    const x = at % width;
    const y = (at - x) / width;

    for (const { dir, dx, dy } of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

      const next = nx + ny * width;
      if (seen[next]) continue;

      const tile = sim.cave.get(nx, ny);
      if (wants(tile)) return firstMove[at] >= 0 ? (firstMove[at] as Direction) : dir;
      if (!isWalkable(tile) || isDangerous(sim, nx, ny)) continue;

      seen[next] = 1;
      firstMove[next] = firstMove[at] >= 0 ? firstMove[at] : dir;
      queue.push(next);
    }
  }
  return null;
}

/**
 * Can the miner reach any cell matching `wants` at all, ignoring danger?
 * Used to assert that a cave never seals its own exit.
 */
export function canReach(
  sim: CaveSession['simulation'],
  wants: (tile: TileId) => boolean,
): boolean {
  return routeStep(sim, wants) !== null;
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
  let ticks = 0;

  while (ticks < maxTicks && run.outcome === CaveOutcome.Running) {
    let input: PlayerInput = { dir: null, grab: false };

    if (sim.runtime.playerBorn && sim.runtime.playerAlive) {
      // `diamondsNeeded` is how many are still outstanding, so the exit being
      // open is the signal to stop digging and leave.
      const dir = sim.runtime.exitOpen
        ? (routeStep(sim, (tile) => tile === Tile.ExitOpen) ??
          routeStep(sim, (tile) => tile === Tile.Diamond))
        : (routeStep(sim, (tile) => tile === Tile.Diamond) ??
          routeStep(sim, (tile) => tile === Tile.Dirt));

      if (dir !== null) input = { dir, grab: false };
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
