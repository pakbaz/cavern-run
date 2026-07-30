import { STORAGE_DB_NAME, STORAGE_DB_VERSION, STORAGE_FALLBACK_PREFIX } from '../../config';

/**
 * Local persistence, with a ladder of fallbacks.
 *
 * IndexedDB is the real home for high scores and per-cave bests. It is also
 * unavailable in a surprising number of situations -- private browsing, some
 * embedded webviews, storage-blocking extensions -- and a game that throws
 * instead of starting because it could not save a score would be a bad game.
 * So the store degrades: IndexedDB, then localStorage, then plain memory.
 */

export const StoreName = {
  highscores: 'highscores',
  caveBests: 'caveBests',
  progress: 'progress',
  settings: 'settings',
} as const;

export type StoreNameValue = (typeof StoreName)[keyof typeof StoreName];

export const ALL_STORES: readonly StoreNameValue[] = Object.values(StoreName);

export interface KeyValueStore {
  readonly kind: 'indexeddb' | 'localstorage' | 'memory';
  get<T>(store: StoreNameValue, key: string): Promise<T | undefined>;
  put<T>(store: StoreNameValue, key: string, value: T): Promise<void>;
  all<T>(store: StoreNameValue): Promise<T[]>;
  remove(store: StoreNameValue, key: string): Promise<void>;
  clear(store: StoreNameValue): Promise<void>;
}

/* ------------------------------------------------------------------ *
 * IndexedDB
 * ------------------------------------------------------------------ */

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

class IndexedDbStore implements KeyValueStore {
  readonly kind = 'indexeddb' as const;
  private readonly db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.db = db;
  }

  private tx(store: StoreNameValue, mode: IDBTransactionMode): IDBObjectStore {
    return this.db.transaction(store, mode).objectStore(store);
  }

  async get<T>(store: StoreNameValue, key: string): Promise<T | undefined> {
    return (await promisify(this.tx(store, 'readonly').get(key))) as T | undefined;
  }

  async put<T>(store: StoreNameValue, key: string, value: T): Promise<void> {
    await promisify(this.tx(store, 'readwrite').put(value as unknown as object, key));
  }

  async all<T>(store: StoreNameValue): Promise<T[]> {
    return (await promisify(this.tx(store, 'readonly').getAll())) as T[];
  }

  async remove(store: StoreNameValue, key: string): Promise<void> {
    await promisify(this.tx(store, 'readwrite').delete(key));
  }

  async clear(store: StoreNameValue): Promise<void> {
    await promisify(this.tx(store, 'readwrite').clear());
  }
}

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }

    const request = indexedDB.open(STORAGE_DB_NAME, STORAGE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of ALL_STORES) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'));
  });
}

/* ------------------------------------------------------------------ *
 * localStorage
 * ------------------------------------------------------------------ */

class LocalStorageStore implements KeyValueStore {
  readonly kind = 'localstorage' as const;

  private prefix(store: StoreNameValue, key = ''): string {
    return `${STORAGE_FALLBACK_PREFIX}${store}:${key}`;
  }

  async get<T>(store: StoreNameValue, key: string): Promise<T | undefined> {
    const raw = localStorage.getItem(this.prefix(store, key));
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  async put<T>(store: StoreNameValue, key: string, value: T): Promise<void> {
    try {
      localStorage.setItem(this.prefix(store, key), JSON.stringify(value));
    } catch {
      // Quota exhausted, or storage disabled mid-session. Nothing to do.
    }
  }

  async all<T>(store: StoreNameValue): Promise<T[]> {
    const results: T[] = [];
    const prefix = this.prefix(store);
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key === null || !key.startsWith(prefix)) continue;
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      try {
        results.push(JSON.parse(raw) as T);
      } catch {
        // Skip anything that is not ours.
      }
    }
    return results;
  }

  async remove(store: StoreNameValue, key: string): Promise<void> {
    localStorage.removeItem(this.prefix(store, key));
  }

  async clear(store: StoreNameValue): Promise<void> {
    const prefix = this.prefix(store);
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key !== null && key.startsWith(prefix)) doomed.push(key);
    }
    for (const key of doomed) localStorage.removeItem(key);
  }
}

function localStorageWorks(): boolean {
  try {
    const probe = `${STORAGE_FALLBACK_PREFIX}probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Memory
 * ------------------------------------------------------------------ */

/** Last resort: the run still works, it just will not be remembered. */
export class MemoryStore implements KeyValueStore {
  readonly kind = 'memory' as const;
  private readonly data = new Map<string, Map<string, unknown>>();

  private bucket(store: StoreNameValue): Map<string, unknown> {
    let bucket = this.data.get(store);
    if (!bucket) {
      bucket = new Map();
      this.data.set(store, bucket);
    }
    return bucket;
  }

  async get<T>(store: StoreNameValue, key: string): Promise<T | undefined> {
    return this.bucket(store).get(key) as T | undefined;
  }

  async put<T>(store: StoreNameValue, key: string, value: T): Promise<void> {
    this.bucket(store).set(key, value);
  }

  async all<T>(store: StoreNameValue): Promise<T[]> {
    return [...this.bucket(store).values()] as T[];
  }

  async remove(store: StoreNameValue, key: string): Promise<void> {
    this.bucket(store).delete(key);
  }

  async clear(store: StoreNameValue): Promise<void> {
    this.bucket(store).clear();
  }
}

/* ------------------------------------------------------------------ *
 * Selection
 * ------------------------------------------------------------------ */

let pending: Promise<KeyValueStore> | null = null;

/**
 * Open the best storage this browser will give us. Memoised, so every caller
 * shares one connection.
 */
export function openStore(): Promise<KeyValueStore> {
  pending ??= selectStore();
  return pending;
}

async function selectStore(): Promise<KeyValueStore> {
  try {
    const db = await openIndexedDb();
    return new IndexedDbStore(db);
  } catch {
    // Fall through.
  }

  if (typeof localStorage !== 'undefined' && localStorageWorks()) {
    return new LocalStorageStore();
  }

  return new MemoryStore();
}

/** Test seam: force a particular store implementation. */
export function useStore(store: KeyValueStore): void {
  pending = Promise.resolve(store);
}
