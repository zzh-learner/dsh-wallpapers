/**
 * Host half of the local-media wallpaper: two read-only routes on the shared
 * web server (present only in web compositions, hence a runtime ctx.inject
 * rather than a required dependency). `GET /dsh-wallpapers/local/list`
 * classifies one directory (dirs first, media files by extension whitelist)
 * or reports a single file / a missing path as JSON; `GET
 * /dsh-wallpapers/local/file` streams one whitelisted media file with single
 * Range support so <video> can seek. Everything else 404/405s, and only
 * absolute paths are accepted — the route serves what the operator picked,
 * nothing more.
 *
 * @module dsh-wallpapers/src/media
 */

import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'

/** Shared prefix of both routes; also the client half's fetch base. */
export const LOCAL_MEDIA_ROUTE = '/dsh-wallpapers/local'

/** Cap on one listing so a huge directory cannot stall the response. */
const MAX_ENTRIES = 4000

/** Image extensions this mode serves, with their MIME types. */
const IMAGE_MIME = new Map<string, string>([
  ['avif', 'image/avif'], ['bmp', 'image/bmp'], ['gif', 'image/gif'],
  ['jpeg', 'image/jpeg'], ['jpg', 'image/jpeg'], ['png', 'image/png'],
  ['svg', 'image/svg+xml'], ['webp', 'image/webp'],
])

/** Video extensions this mode serves, with their MIME types. */
const VIDEO_MIME = new Map<string, string>([
  ['m4v', 'video/x-m4v'], ['mkv', 'video/x-matroska'], ['mov', 'video/quicktime'],
  ['mp4', 'video/mp4'], ['ogv', 'video/ogg'], ['webm', 'video/webm'],
])

/** Directory junk never worth listing in a wallpaper picker. */
const JUNK_NAMES = new Set(['$RECYCLE.BIN', 'System Volume Information', 'Thumbs.db', 'desktop.ini'])

/** One listed entry as sent to the browser ('file' = outside the media whitelist). */
interface MediaEntryDto {
  readonly name: string
  readonly kind: 'dir' | 'image' | 'video' | 'file'
  readonly size: number
  readonly mtime: number
  readonly path: string
}

/** One listing response as sent to the browser. */
interface ListResponseDto {
  readonly path: string
  readonly kind: 'dir' | 'image' | 'video' | 'file' | 'missing'
  readonly parent: string | null
  readonly entries: readonly MediaEntryDto[]
  readonly entry?: MediaEntryDto
  readonly roots?: readonly string[]
  readonly truncated?: boolean
}

/** Minimal shape of the shared web-server service (dsh-host-webserver). */
interface WebServerLike {
  register(route: {
    readonly kind: 'exact' | 'prefix'
    readonly path: string
    readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Provided by web compositions only; the local-media routes attach when present. */
    webServer?: WebServerLike
  }
}

/** Classify one file name for the media whitelists. */
export function classifyMedia(name: string): { kind: 'image' | 'video'; mime: string } | null {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  const image = IMAGE_MIME.get(ext)
  if (image !== undefined) return { kind: 'image', mime: image }
  const video = VIDEO_MIME.get(ext)
  if (video !== undefined) return { kind: 'video', mime: video }
  return null
}

/** Absolute-path gate: relative paths, and anything with NUL, are refused. */
function normalizeTarget(raw: string): string | null {
  if (raw === '' || raw.includes('\0')) return null
  if (!path.isAbsolute(raw)) return null
  return path.resolve(raw)
}

/** Parent directory, or null at a filesystem root (dirname(p) === p). */
function parentOf(target: string): string | null {
  const parent = path.dirname(target)
  return parent === target ? null : parent
}

/** Entries a picker would trip over: dotfiles and OS metadata. */
function isJunk(name: string): boolean {
  return name.startsWith('.') || JUNK_NAMES.has(name)
}

/** Natural-order compare so img2 sorts before img10. */
function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

/** Existing filesystem roots: every present drive letter on Windows, '/' elsewhere. */
async function listRoots(): Promise<string[]> {
  if (process.platform !== 'win32') return ['/']
  const roots: string[] = []
  for (let code = 65; code <= 90; code++) {
    const drive = `${String.fromCharCode(code)}:\\`
    try {
      if ((await stat(drive)).isDirectory()) roots.push(drive)
    } catch {
      /* Absent drive letter. */
    }
  }
  return roots
}

/** One entry's stat fields, size 0 / mtime 0 when stat fails (broken link etc.). */
async function entryStats(target: string): Promise<{ size: number; mtime: number }> {
  try {
    const st = await stat(target)
    return { size: st.size, mtime: Math.floor(st.mtimeMs) }
  } catch {
    return { size: 0, mtime: 0 }
  }
}

/** Serve the listing: classify the target, or describe why it cannot be a wallpaper. */
async function serveList(url: URL, res: ServerResponse): Promise<void> {
  const raw = url.searchParams.get('path') ?? ''
  const target = raw === '' ? homedir() : normalizeTarget(raw)
  const send = (dto: ListResponseDto): void => {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(dto))
  }
  if (target === null) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
    res.end('dsh-wallpapers: path must be absolute')
    return
  }

  let st
  try {
    st = await stat(target)
  } catch {
    send({ path: target, kind: 'missing', parent: parentOf(target), entries: [] })
    return
  }

  if (st.isFile()) {
    const media = classifyMedia(target)
    // A non-media file reports kind 'file': the client shows a friendly error.
    send({
      path: target,
      kind: media?.kind ?? 'file',
      parent: parentOf(target),
      entries: [],
      entry: {
        name: path.basename(target),
        kind: media?.kind ?? 'file',
        size: st.size,
        mtime: Math.floor(st.mtimeMs),
        path: target,
      },
    })
    return
  }

  let dirents
  try {
    dirents = await readdir(target, { withFileTypes: true })
  } catch {
    send({ path: target, kind: 'missing', parent: parentOf(target), entries: [] })
    return
  }

  const dirs: MediaEntryDto[] = []
  const mediaFiles: MediaEntryDto[] = []
  let truncated = false
  for (const dirent of dirents) {
    if (isJunk(dirent.name)) continue
    if (dirs.length + mediaFiles.length >= MAX_ENTRIES) { truncated = true; break }
    const child = path.join(target, dirent.name)
    if (dirent.isDirectory()) {
      dirs.push({ name: dirent.name, kind: 'dir', size: 0, mtime: 0, path: child })
      continue
    }
    if (!dirent.isFile()) continue
    const media = classifyMedia(dirent.name)
    if (media === null) continue
    const stats = await entryStats(child)
    mediaFiles.push({ name: dirent.name, kind: media.kind, ...stats, path: child })
  }
  dirs.sort((a, b) => compareNames(a.name, b.name))
  mediaFiles.sort((a, b) => compareNames(a.name, b.name))

  const parent = parentOf(target)
  const dto: ListResponseDto = {
    path: target,
    kind: 'dir',
    parent,
    entries: [...dirs, ...mediaFiles],
  }
  if (truncated) {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify({ ...dto, truncated: true }))
    return
  }
  // Roots ride along only at a filesystem root, where "up" can no longer move.
  if (parent === null) {
    const roots = await listRoots()
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify({ ...dto, roots }))
    return
  }
  send(dto)
}

/** Parse one `bytes=start-end` header against a known size; null = whole file. */
function parseRange(header: string | undefined, size: number): { start: number; end: number } | null | 'invalid' {
  if (header === undefined) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (match === null) return 'invalid'
  const [, rawStart, rawEnd] = match
  if (rawStart === '') {
    if (rawEnd === '') return null
    const suffix = Number(rawEnd)
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return 'invalid'
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(rawStart)
  if (!Number.isSafeInteger(start) || start < 0 || start >= size) return 'invalid'
  let end = rawEnd === '' ? size - 1 : Number(rawEnd)
  if (!Number.isSafeInteger(end) || end < start) return 'invalid'
  if (end >= size) end = size - 1
  return { start, end }
}

/** Serve one media file: whitelist, stat, then stream with single-Range support. */
async function serveFile(req: IncomingMessage, url: URL, res: ServerResponse): Promise<void> {
  const target = normalizeTarget(url.searchParams.get('path') ?? '')
  if (target === null) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
    res.end('dsh-wallpapers: path must be absolute')
    return
  }
  const media = classifyMedia(target)
  if (media === null) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
    res.end('dsh-wallpapers: not a supported media file')
    return
  }
  let st
  try {
    st = await stat(target)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
    res.end('dsh-wallpapers: file not found')
    return
  }
  if (!st.isFile()) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
    res.end('dsh-wallpapers: not a file')
    return
  }

  const range = parseRange(req.headers.range, st.size)
  if (range === 'invalid') {
    res.writeHead(416, { 'content-range': `bytes */${st.size}`, 'cache-control': 'no-store' })
    res.end()
    return
  }
  const start = range?.start ?? 0
  const end = range?.end ?? st.size - 1
  const headers: Record<string, string | number> = {
    'content-type': media.mime,
    'content-length': end - start + 1,
    'accept-ranges': 'bytes',
    // The URL carries the size+mtime revision, so an hour of private caching
    // is safe and keeps slideshow advances off the disk.
    'cache-control': 'private, max-age=3600',
  }
  if (range !== null) headers['content-range'] = `bytes ${start}-${end}/${st.size}`

  const stream = createReadStream(target, { start, end })
  stream.on('error', () => {
    if (res.headersSent) res.destroy()
    else {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
      res.end('dsh-wallpapers: read failed')
    }
  })
  res.writeHead(range === null ? 200 : 206, headers)
  if (req.method === 'HEAD') {
    stream.destroy()
    res.end()
    return
  }
  stream.pipe(res)
}

/** Route dispatcher for the shared prefix. */
async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' })
    res.end('dsh-wallpapers: method not allowed')
    return
  }
  let url: URL
  try {
    url = new URL(req.url ?? '/', 'http://localhost')
  } catch {
    res.writeHead(400).end()
    return
  }
  try {
    if (url.pathname === `${LOCAL_MEDIA_ROUTE}/list`) await serveList(url, res)
    else if (url.pathname === `${LOCAL_MEDIA_ROUTE}/file`) await serveFile(req, url, res)
    else {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('dsh-wallpapers: not found')
    }
  } catch {
    if (!res.headersSent) res.writeHead(500).end()
    else res.destroy()
  }
}

/**
 * Attach the local-media routes to the shared web server when (and only when)
 * a web composition provides it; headless profiles simply skip the feature.
 * @param ctx - plugin context whose fiber owns the registration.
 */
export function registerLocalMediaRoutes(ctx: Context): void {
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => {
      const server = webCtx.webServer
      if (server === undefined) throw new Error('dsh-wallpapers: webServer service vanished before registration')
      return server.register({ kind: 'prefix', path: LOCAL_MEDIA_ROUTE, handler: handle })
    }, 'dsh-wallpapers: local-media routes')
  })
}
