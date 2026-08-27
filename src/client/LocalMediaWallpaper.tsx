/**
 * The 本地媒体 wallpaper layer: renders one configured local image or video,
 * or rotates every image/video in a configured folder. The host-side routes
 * (src/media.ts) provide listings and byte streams, the shared store
 * (./localmedia/store.ts) holds the configuration, and visibility is driven
 * by the wallpaper registry through the module-level bridge — while hidden
 * the layer unmounts its media and stops the slideshow timer entirely.
 *
 * @module dsh-wallpapers/src/client/LocalMediaWallpaper
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { listMedia, mediaUrl } from './localmedia/api.ts'
import type { MediaEntry } from './localmedia/api.ts'
import { getLocalMediaConfig, subscribeLocalMediaConfig } from './localmedia/store.ts'
import type { LocalMediaConfig } from './localmedia/store.ts'
import css from './LocalMediaWallpaper.module.css'

/** One rendered slide: a stable key plus its listed entry. */
interface Slide {
  readonly key: string
  readonly entry: MediaEntry
}

/** Inline status chip tone. */
interface Status {
  readonly tone: 'load' | 'error'
  readonly text: string
}

/** Registry → component visibility bridge; set on mount, read at registration time. */
export const visibility = { apply: null as ((on: boolean) => void) | null, desired: false }

/** Fisher–Yates over a copy; slideshow-only, so Math.random is fine. */
function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** One stacked media element (the outgoing slide renders without handlers). */
function MediaLayer(props: {
  readonly slide: Slide
  readonly fit: LocalMediaConfig['fit']
  readonly front: boolean
  readonly single: boolean
  readonly onEnded?: () => void
  readonly onError?: () => void
  readonly onLoaded?: () => void
}) {
  const { slide, fit } = props
  const className = props.front ? `${css.layer} ${css.front}` : css.layer
  if (slide.entry.kind === 'video') {
    return (
      <video
        key={slide.key}
        className={className}
        src={mediaUrl(slide.entry)}
        style={{ objectFit: fit }}
        autoPlay
        muted
        playsInline
        loop={props.single}
        disablePictureInPicture
        preload="auto"
        onEnded={props.onEnded}
        onError={props.onError}
        onLoadedData={props.onLoaded}
      />
    )
  }
  return (
    <img
      key={slide.key}
      className={className}
      src={mediaUrl(slide.entry)}
      style={{ objectFit: fit }}
      alt=""
      draggable={false}
      onError={props.onError}
      onLoad={props.onLoaded}
    />
  )
}

/** The 本地媒体 wallpaper entry. */
export function LocalMediaWallpaper() {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const itemsRef = useRef<readonly MediaEntry[] | null>(null)
  const topRef = useRef<Slide | null>(null)
  const errStreakRef = useRef(0)
  const [config, setConfigState] = useState<LocalMediaConfig>(getLocalMediaConfig)
  const [shown, setShown] = useState(visibility.desired)
  const [items, setItems] = useState<readonly MediaEntry[] | null>(null)
  const [index, setIndex] = useState(0)
  const [top, setTop] = useState<Slide | null>(null)
  const [under, setUnder] = useState<Slide | null>(null)
  const [status, setStatus] = useState<Status | null>(null)

  // Registry visibility: toggle display through the bridge AND gate media
  // mounting on `shown`, so a hidden layer holds no decoded media.
  useEffect(() => {
    visibility.apply = (on: boolean): void => {
      if (hostRef.current !== null) {
        hostRef.current.style.display = on ? '' : 'none'
        // Inline beats the shell's ".overlayLayer > * {pointer-events:auto}":
        // photos must never swallow clicks meant for the UI.
        hostRef.current.style.pointerEvents = 'none'
      }
      setShown(on)
    }
    visibility.apply(visibility.desired)
    return () => { visibility.apply = null }
  }, [])

  useEffect(() => subscribeLocalMediaConfig(() => { setConfigState(getLocalMediaConfig()) }), [])

  useEffect(() => { itemsRef.current = items }, [items])

  // Resolve the configured path into the playable slide list.
  useEffect(() => {
    const reset = (): void => {
      setItems(null)
      setIndex(0)
      setTop(null)
      setUnder(null)
      topRef.current = null
    }
    if (!shown) {
      reset()
      setStatus(null)
      return
    }
    if (config.path === '') {
      reset()
      setStatus({ tone: 'load', text: '本地媒体壁纸：请在 设置 → 壁纸 中选择图片、视频或文件夹' })
      return
    }
    let cancelled = false
    reset()
    setStatus({ tone: 'load', text: '正在读取本地媒体…' })
    listMedia(config.path).then((result) => {
      if (cancelled) return
      if (result.kind === 'dir') {
        const slides = result.entries.filter(e => e.kind === 'image' || e.kind === 'video')
        if (slides.length === 0) {
          setStatus({ tone: 'error', text: `文件夹中没有图片或视频：${result.path}` })
          return
        }
        // The host already caps listings, so a huge folder simply rotates a prefix.
        errStreakRef.current = 0
        setItems(config.shuffle ? shuffled(slides) : slides)
        setIndex(0)
        setStatus(null)
        return
      }
      if (result.kind === 'image' || result.kind === 'video') {
        if (result.entry === undefined) {
          setStatus({ tone: 'error', text: '本地文件服务返回了不完整的数据' })
          return
        }
        errStreakRef.current = 0
        setItems([result.entry])
        setIndex(0)
        setStatus(null)
        return
      }
      if (result.kind === 'missing') {
        setStatus({ tone: 'error', text: `路径不存在：${result.path}` })
        return
      }
      setStatus({ tone: 'error', text: `不是受支持的图片或视频文件：${result.path}` })
    }).catch((error: unknown) => {
      if (cancelled) return
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : String(error) })
    })
    return () => { cancelled = true }
    // shuffle re-lists so a rotation can be re-rolled from the same folder.
  }, [shown, config.path, config.shuffle])

  const entry = items !== null && index < items.length ? items[index] : null
  const slideKey = entry === null ? '' : `${index}-${entry.path}-${entry.size}-${entry.mtime}`

  // Push the current slide onto the stack; keep the previous one beneath for
  // the crossfade window, then drop it.
  useEffect(() => {
    if (entry === null) {
      topRef.current = null
      setTop(null)
      setUnder(null)
      return
    }
    const next: Slide = { key: slideKey, entry }
    if (topRef.current !== null && topRef.current.key !== next.key) setUnder(topRef.current)
    topRef.current = next
    setTop(next)
    const timer = setTimeout(() => { setUnder(null) }, 1100)
    return () => { clearTimeout(timer) }
    // entry is derived from items/index; slideKey changes exactly when they do.
  }, [slideKey])

  const advance = useCallback(() => {
    const len = itemsRef.current?.length ?? 0
    if (len > 1) setIndex(i => (i + 1) % len)
  }, [])

  // Slideshow countdown: restarted on every slide change (which also lets a
  // finished video advance early without waiting out the interval).
  useEffect(() => {
    if (!shown || items === null || items.length < 2) return
    const timer = setTimeout(advance, Math.max(1, config.intervalSec) * 1000)
    return () => { clearTimeout(timer) }
  }, [shown, items, config.intervalSec, slideKey, advance])

  // One broken file skips to the next slide; a fully broken rotation stops
  // instead of cycling errors forever (a load resets the streak).
  const handleMediaLoad = useCallback(() => { errStreakRef.current = 0 }, [])
  const handleMediaError = useCallback(() => {
    const len = itemsRef.current?.length ?? 0
    errStreakRef.current += 1
    if (len > 1 && errStreakRef.current < len) {
      advance()
      return
    }
    setStatus({ tone: 'error', text: `无法加载媒体文件：${topRef.current?.entry.name ?? config.path}` })
  }, [advance, config.path])

  const single = (items?.length ?? 0) === 1

  return (
    <div ref={hostRef} className={css.host} aria-hidden="true">
      {shown && (top !== null || status !== null) && (
        <>
          {under !== null && <MediaLayer slide={under} fit={config.fit} front={false} single={single} />}
          {top !== null && (
            <div style={{ opacity: config.opacity }} className={css.mediaWrap}>
              <MediaLayer
                slide={top}
                fit={config.fit}
                front
                single={single}
                onEnded={advance}
                onError={handleMediaError}
                onLoaded={handleMediaLoad}
              />
            </div>
          )}
          {status !== null && (
            <div className={status.tone === 'error' ? `${css.status} ${css.error}` : css.status}>
              {status.text}
            </div>
          )}
        </>
      )}
    </div>
  )
}
