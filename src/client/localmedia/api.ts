/**
 * Browser-side client of the host-side `/dsh-wallpapers/local` routes: one
 * typed fetch for directory listings and the URL builder wallpaper media
 * elements load from. The prefix must stay in lockstep with src/media.ts, and
 * the wire shapes mirror its DTOs one-to-one.
 *
 * @module dsh-wallpapers/src/client/localmedia/api
 */

/** The two playable media kinds. */
export type MediaKind = 'image' | 'video'

/** One listed filesystem entry; 'file' marks a file outside the media whitelist. */
export interface MediaEntry {
  readonly name: string
  readonly kind: 'dir' | MediaKind | 'file'
  readonly size: number
  readonly mtime: number
  readonly path: string
}

/** One listing response: a directory's contents, a single file's identity, or a miss. */
export interface ListResult {
  readonly path: string
  readonly kind: 'dir' | MediaKind | 'file' | 'missing'
  readonly parent: string | null
  readonly entries: readonly MediaEntry[]
  readonly entry?: MediaEntry
  readonly roots?: readonly string[]
  readonly truncated?: boolean
}

/** Route prefix shared with the host half (src/media.ts LOCAL_MEDIA_ROUTE). */
const BASE = '/dsh-wallpapers/local'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * List one absolute path (empty string = the host home directory). Never
 * throws for missing paths — those come back as `kind: 'missing'` so callers
 * can render an inline hint; only transport failures reject.
 * @param target - absolute filesystem path, or '' for the home directory.
 * @returns the classified listing.
 */
export async function listMedia(target: string): Promise<ListResult> {
  let res: Response
  try {
    res = await fetch(`${BASE}/list?path=${encodeURIComponent(target)}`, {
      headers: { accept: 'application/json' },
    })
  } catch {
    throw new Error('无法连接本地文件服务（本模式需要 Web 桌面配置）')
  }
  if (!res.ok) throw new Error(`本地文件服务返回 HTTP ${res.status}`)
  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new Error('本地文件服务返回了无法解析的内容')
  }
  if (!isRecord(data) || typeof data.path !== 'string') throw new Error('本地文件服务返回了未知结构')
  return data as unknown as ListResult
}

/**
 * Build the URL one media element loads from; the size+mtime revision both
 * cache-busts edited files and lets the route send long-lived cache headers.
 * @param entry - the listed entry (or any path with its stats).
 * @returns a same-origin URL serving the file bytes.
 */
export function mediaUrl(entry: Pick<MediaEntry, 'path' | 'size' | 'mtime'>): string {
  return `${BASE}/file?path=${encodeURIComponent(entry.path)}&rev=${entry.size}-${entry.mtime}`
}
