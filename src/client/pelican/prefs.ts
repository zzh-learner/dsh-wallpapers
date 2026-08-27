/**
 * The 鹈鹕骑行 wallpaper's persisted preferences: one localStorage object
 * holding the layer opacity ("壁纸浓度"), with change notification — the same
 * framework-free shared-store shape as localmedia/store.ts so the settings
 * card and the layer stay in sync live.
 *
 * @module dsh-wallpapers/src/client/pelican/prefs
 */

/** Everything the layer and the settings card read and write. */
export interface PelicanPrefs {
  /** Layer opacity, 0 (invisible) through 1 (opaque artwork). */
  readonly opacity: number
}

/** localStorage key for the persisted preferences. */
export const PELICAN_PREFS_STORAGE_KEY = 'dsh.wallpaper.pelican.v1'

/** Defaults: translucent enough to read the UI above the artwork. */
export const DEFAULT_PELICAN_PREFS: PelicanPrefs = { opacity: 0.35 }

/** Clamp an incoming opacity into the valid range; non-finite falls back. */
function clampOpacity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_PELICAN_PREFS.opacity
  return Math.min(1, Math.max(0, value))
}

function load(): PelicanPrefs {
  try {
    const raw = localStorage.getItem(PELICAN_PREFS_STORAGE_KEY)
    if (raw === null) return DEFAULT_PELICAN_PREFS
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PELICAN_PREFS
    return { opacity: clampOpacity((parsed as { opacity?: unknown }).opacity) }
  } catch {
    return DEFAULT_PELICAN_PREFS
  }
}

function save(prefs: PelicanPrefs): void {
  try {
    localStorage.setItem(PELICAN_PREFS_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* Private-mode storage: preferences stay session-local. */
  }
}

let current = load()
const listeners = new Set<() => void>()

/** Read the current preferences. */
export function getPelicanPrefs(): PelicanPrefs {
  return current
}

/**
 * Merge a patch into the preferences, persist it, and notify readers.
 * @param patch - fields to change.
 */
export function setPelicanPrefs(patch: Partial<PelicanPrefs>): void {
  current = { ...current, ...(patch.opacity !== undefined ? { opacity: clampOpacity(patch.opacity) } : {}) }
  save(current)
  for (const fn of listeners) fn()
}

/**
 * Subscribe to preference changes.
 * @param fn - listener invoked after every change.
 * @returns its disposer.
 */
export function subscribePelicanPrefs(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
