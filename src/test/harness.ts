import { Cave } from '../game/engine/Cave';
import { CaveSim } from '../game/engine/CaveSim';
import {
  DEFAULT_TUNING,
  type CaveTuning,
  type PlayerInput,
  type SimEvent,
} from '../game/engine/simTypes';
import { Tile, type Direction } from '../game/engine/tiles';
import { caveToMap, parseCaveMap } from '../game/levels/caveFormat';

/**
 * Test helpers for driving the simulation from small ASCII cave fragments.
 *
 * Fragments do not have to be full-size or sealed, so a rule can be exercised
 * in isolation with the minimum surrounding rock.
 */

export function makeCave(rows: readonly string[]): Cave {
  const parsed = parseCaveMap(rows);
  return Cave.fromTiles(parsed.width, parsed.height, parsed.tiles);
}

export interface SimOptions {
  readonly tuning?: Partial<CaveTuning>;
  /** Skip the birth animation so the player is immediately controllable. */
  readonly hatched?: boolean;
  readonly seed?: number;
}

export function makeSim(rows: readonly string[], options: SimOptions = {}): CaveSim {
  const tuning: CaveTuning = { ...DEFAULT_TUNING, ...options.tuning };
  const sim = new CaveSim(makeCave(rows), tuning, options.seed ?? 12345);

  if (options.hatched !== false) hatch(sim);
  return sim;
}

/** Replace the birth egg with a live player, bypassing the intro animation. */
export function hatch(sim: CaveSim): void {
  const egg = sim.cave.findFirst((tile) => tile === Tile.PlayerBirth);
  if (!egg) return;
  sim.cave.set(egg.x, egg.y, Tile.Player);
  sim.runtime.playerX = egg.x;
  sim.runtime.playerY = egg.y;
  sim.runtime.playerBorn = true;
  sim.runtime.playerAlive = true;
}

export function input(dir: Direction | null, grab = false): PlayerInput {
  return { dir, grab };
}

const IDLE: PlayerInput = { dir: null, grab: false };

/** Run `count` scans, returning every event they produced. */
export function run(sim: CaveSim, count: number, playerInput: PlayerInput = IDLE): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < count; i += 1) {
    events.push(...sim.tick(playerInput));
  }
  return events;
}

/** Current grid as ASCII rows, for readable assertions. */
export function snapshot(sim: CaveSim): string[] {
  return caveToMap(sim.cave);
}

export function eventsOfType<T extends SimEvent['type']>(
  events: readonly SimEvent[],
  type: T,
): Array<Extract<SimEvent, { type: T }>> {
  return events.filter((event) => event.type === type) as Array<Extract<SimEvent, { type: T }>>;
}
