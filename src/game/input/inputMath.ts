import { Dir, type Direction } from '../engine/tiles';

/**
 * Resolves which way the player is actually trying to go.
 *
 * Holding two directions at once is normal -- you roll your thumb from right
 * to up rather than releasing cleanly -- so the most recently pressed
 * direction wins, and releasing it falls back to whatever is still held
 * instead of stopping dead. That is what makes diagonal-ish turns feel
 * responsive on a grid.
 */
export class DirectionLatch {
  /** Held directions, oldest first. The last entry is the active one. */
  private readonly held: Direction[] = [];

  /**
   * A direction pressed and released between two simulation scans still
   * counts. At 7 Hz a quick tap is easily shorter than one tick, and losing
   * those taps makes the miner feel unresponsive.
   */
  private buffered: Direction | null = null;

  press(dir: Direction): void {
    const at = this.held.indexOf(dir);
    if (at !== -1) this.held.splice(at, 1);
    this.held.push(dir);
    this.buffered = dir;
  }

  release(dir: Direction): void {
    const at = this.held.indexOf(dir);
    if (at !== -1) this.held.splice(at, 1);
  }

  clear(): void {
    this.held.length = 0;
    this.buffered = null;
  }

  /** The direction to feed the next scan, or null to stand still. */
  resolve(): Direction | null {
    const active = this.held[this.held.length - 1];
    if (active !== undefined) return active;
    return this.buffered;
  }

  /**
   * Called once the simulation has consumed a scan. Drops the buffered tap so
   * a single press does not repeat, but leaves genuinely held keys alone.
   */
  consume(): void {
    this.buffered = null;
  }

  get isIdle(): boolean {
    return this.held.length === 0 && this.buffered === null;
  }
}

/** Map an analog stick to a direction, ignoring the dead zone. */
export function stickDirection(x: number, y: number, deadZone = 0.5): Direction | null {
  if (Math.abs(x) < deadZone && Math.abs(y) < deadZone) return null;
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? Dir.Right : Dir.Left;
  return y > 0 ? Dir.Down : Dir.Up;
}

/**
 * Map a drag offset from the touch origin to a direction.
 *
 * Requires a minimum travel so a tap meant as "pause" does not read as a
 * step, and picks the dominant axis so the miner never tries to move
 * diagonally.
 */
export function swipeDirection(dx: number, dy: number, threshold = 24): Direction | null {
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? Dir.Right : Dir.Left;
  return dy > 0 ? Dir.Down : Dir.Up;
}
