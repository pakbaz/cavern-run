import { openStore, StoreName } from './db';

export interface Settings {
  musicVolume: number;
  sfxVolume: number;
  lighting: boolean;
  reducedMotion: boolean;
  scanlines: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  musicVolume: 0.7,
  sfxVolume: 0.85,
  lighting: true,
  reducedMotion: false,
  scanlines: true,
};

/**
 * Coerce whatever came out of storage into a usable Settings object.
 *
 * Saved settings outlive the code that wrote them, so this treats stored data
 * as untrusted: unknown shapes, missing keys and out-of-range numbers all fall
 * back to the default rather than propagating a NaN into a gain node.
 */
export function normalizeSettings(raw: unknown): Settings {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Settings>;
  return {
    musicVolume: normalizeVolume(input.musicVolume, DEFAULT_SETTINGS.musicVolume),
    sfxVolume: normalizeVolume(input.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
    lighting: typeof input.lighting === 'boolean' ? input.lighting : DEFAULT_SETTINGS.lighting,
    reducedMotion:
      typeof input.reducedMotion === 'boolean' ? input.reducedMotion : prefersReducedMotion(),
    scanlines: typeof input.scanlines === 'boolean' ? input.scanlines : DEFAULT_SETTINGS.scanlines,
  };
}

function normalizeVolume(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

/** Respect the OS-level motion preference the first time we ever run. */
export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export async function loadSettings(): Promise<Settings> {
  try {
    const store = await openStore();
    return normalizeSettings(await store.get<Settings>(StoreName.settings, 'current'));
  } catch {
    return normalizeSettings(undefined);
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  try {
    const store = await openStore();
    await store.put(StoreName.settings, 'current', normalizeSettings(settings));
  } catch {
    // Best-effort: the run continues with the in-memory settings.
  }
}
