import { Tile, type TileId } from './tiles';

/**
 * A single tile relocation recorded during the current scan. The renderer
 * replays these to interpolate sprites smoothly between simulation ticks.
 */
export interface TileMove {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly tile: TileId;
}

/**
 * The cave grid.
 *
 * Boulder Dash's emergent behaviour comes from scanning cells in a fixed
 * order (top-to-bottom, left-to-right) with a per-cell "already acted this
 * scan" flag. Everything about this class exists to make that faithful and
 * cheap: flat typed arrays, out-of-bounds reads that behave like steel walls,
 * and an explicit `move` that maintains the scan flag for you.
 */
export class Cave {
  readonly width: number;
  readonly height: number;

  /** Tile ids, row-major. */
  readonly tiles: Uint8Array;

  /** Auxiliary countdown per cell (explosion stage, birth stage). */
  readonly stage: Uint8Array;

  /** Set for cells that have already acted during the current scan. */
  private readonly scanned: Uint8Array;

  /** Moves recorded since the last `beginScan`, for render interpolation. */
  readonly moves: TileMove[] = [];

  constructor(width: number, height: number) {
    if (width <= 0 || height <= 0) {
      throw new Error(`Cave dimensions must be positive, got ${width}x${height}`);
    }
    this.width = width;
    this.height = height;
    const size = width * height;
    this.tiles = new Uint8Array(size);
    this.stage = new Uint8Array(size);
    this.scanned = new Uint8Array(size);
  }

  static fromTiles(width: number, height: number, tiles: readonly TileId[]): Cave {
    if (tiles.length !== width * height) {
      throw new Error(
        `Expected ${width * height} tiles for a ${width}x${height} cave, got ${tiles.length}`,
      );
    }
    const cave = new Cave(width, height);
    cave.tiles.set(tiles);
    return cave;
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /**
   * Reads outside the grid return steel, so rules never need bounds checks:
   * the cave behaves as though it were encased in indestructible rock.
   */
  get(x: number, y: number): TileId {
    if (!this.inBounds(x, y)) return Tile.Steel;
    return this.tiles[y * this.width + x] as TileId;
  }

  set(x: number, y: number, tile: TileId, stage = 0): void {
    if (!this.inBounds(x, y)) return;
    const i = y * this.width + x;
    this.tiles[i] = tile;
    this.stage[i] = stage;
  }

  getStage(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.stage[y * this.width + x];
  }

  setStage(x: number, y: number, value: number): void {
    if (!this.inBounds(x, y)) return;
    this.stage[y * this.width + x] = value;
  }

  isScanned(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return true;
    return this.scanned[y * this.width + x] === 1;
  }

  markScanned(x: number, y: number): void {
    if (!this.inBounds(x, y)) return;
    this.scanned[y * this.width + x] = 1;
  }

  /** Clears the scan flags and the move log; call once per simulation tick. */
  beginScan(): void {
    this.scanned.fill(0);
    this.moves.length = 0;
  }

  /**
   * Relocate the tile at (fromX, fromY) to (toX, toY), leaving empty behind.
   * The destination is flagged as scanned so the same object cannot act twice
   * within one scan, and the move is logged for the renderer.
   */
  move(fromX: number, fromY: number, toX: number, toY: number, becomes?: TileId): void {
    const tile = becomes ?? this.get(fromX, fromY);
    const carriedStage = this.getStage(fromX, fromY);
    this.set(fromX, fromY, Tile.Empty);
    this.set(toX, toY, tile, carriedStage);
    this.markScanned(toX, toY);
    this.moves.push({ fromX, fromY, toX, toY, tile });
  }

  /** Records a move that the renderer should animate without changing tiles. */
  logMove(fromX: number, fromY: number, toX: number, toY: number, tile: TileId): void {
    this.moves.push({ fromX, fromY, toX, toY, tile });
  }

  countTile(tile: TileId): number {
    let total = 0;
    for (let i = 0; i < this.tiles.length; i += 1) {
      if (this.tiles[i] === tile) total += 1;
    }
    return total;
  }

  countWhere(predicate: (tile: TileId) => boolean): number {
    let total = 0;
    for (let i = 0; i < this.tiles.length; i += 1) {
      if (predicate(this.tiles[i] as TileId)) total += 1;
    }
    return total;
  }

  findFirst(predicate: (tile: TileId) => boolean): { x: number; y: number } | null {
    for (let i = 0; i < this.tiles.length; i += 1) {
      if (predicate(this.tiles[i] as TileId)) {
        return { x: i % this.width, y: Math.floor(i / this.width) };
      }
    }
    return null;
  }

  /** Replace every occurrence of one tile with another. */
  replaceAll(from: (tile: TileId) => boolean, to: TileId): number {
    let changed = 0;
    for (let i = 0; i < this.tiles.length; i += 1) {
      if (from(this.tiles[i] as TileId)) {
        this.tiles[i] = to;
        this.stage[i] = 0;
        changed += 1;
      }
    }
    return changed;
  }

  clone(): Cave {
    const copy = new Cave(this.width, this.height);
    copy.tiles.set(this.tiles);
    copy.stage.set(this.stage);
    copy.scanned.set(this.scanned);
    return copy;
  }
}
