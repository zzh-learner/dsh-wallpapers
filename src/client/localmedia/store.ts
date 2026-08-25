/**
 * The 本地媒体 wallpaper's persisted configuration: one localStorage object
 * (chosen path, slideshow interval, shuffle, fit) with change notification,
 * framework-free like the wallpaper registry so the settings card and the
 * layer share one source of truth.
 *
 * @module dsh-wallpapers/src/client/localmedia/store
 */

/** Everything the layer and the settings card read and write. */
export interface LocalMediaConfig {
  /** Chosen absolute path: a media file, a folder to rotate, or '' (unset). */
  readonly path: string
  /** Seconds one slideshow item stays on screen (minimum 1). */
  readonly intervalSec: number
  /** Shuffle folder items instead of name order. */
  readonly shuffle: boolean
  /** How media fills the viewport: crop-to-fill or letterbox. */
  readonly fit: 'cover' | 'contain'
}

/** localStorage key for the persisted configuration. */
export const LOCAL_MEDIA_STORAGE_KEY = 'dsh.wallpaper.local.v1'

/** Defaults: nothing picked yet, 30s per slide, name order, crop-to-fill. */
export const DEFAULT_LOCAL_MEDIA_CONFIG: LocalMediaConfig = {
  path: '',
  intervalSec: 30,
  shuffle: false,
  fit: 'cover',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** A mutable patch shape (Partial keeps the readonly modifiers). */
type ConfigPatch = {
  path?: string
  intervalSec?: number
  shuffle?: boolean
  fit?: 'cover' | 'contain'
}

function load(): LocalMediaConfig {
  try {
    const raw = localStorage.getItem(LOCAL_MEDIA_STORAGE_KEY)
    if (raw === null) return DEFAULT_LOCAL_MEDIA_CONFIG
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return DEFAULT_LOCAL_MEDIA_CONFIG
    const patch: ConfigPatch = {}
    if (typeof parsed.path === 'string') patch.path = parsed.path
    if (typeof parsed.intervalSec === 'number' && Number.isFinite(parsed.intervalSec)) {
      patch.intervalSec = Math.max(1, Math.round(parsed.intervalSec))
    }
    if (typeof parsed.shuffle === 'boolean') patch.shuffle = parsed.shuffle
    if (parsed.fit === 'cover' || parsed.fit === 'contain') patch.fit = parsed.fit
    return { ...DEFAULT_LOCAL_MEDIA_CONFIG, ...patch }
  } catch {
    return DEFAULT_LOCAL_MEDIA_CONFIG
  }
}

function save(config: LocalMediaConfig): void {
  try {
    localStorage.setItem(LOCAL_MEDIA_STORAGE_KEY, JSON.stringify(config))
  } catch {
    /* Private-mode storage: the configuration stays session-local. */
  }
}

let current = load()
const listeners = new Set<() => void>()

/** Read the current configuration. */
export function getLocalMediaConfig(): LocalMediaConfig {
  return current
}

/**
 * Merge a patch into the configuration, persist it, and notify readers —
 * the wallpaper layer re-lists its path immediately.
 * @param patch - fields to change.
 */
export function setLocalMediaConfig(patch: Partial<LocalMediaConfig>): void {
  current = { ...current, ...patch }
  save(current)
  for (const fn of listeners) fn()
}

/**
 * Subscribe to configuration changes.
 * @param fn - listener invoked after every change.
 * @returns its disposer.
 */
export function subscribeLocalMediaConfig(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
