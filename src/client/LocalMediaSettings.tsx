/**
 * The 本地媒体 settings card, rendered by the 壁纸 section under the selected
 * row: the current source path, an embedded one-pane folder browser backed by
 * the host listing route (navigate, pick one media file, or rotate the
 * folder), a manual absolute-path input, and the rotation options (interval,
 * shuffle, fit). Every change goes straight through the shared store, so the
 * wallpaper layer behind the open panel previews it live.
 *
 * @module dsh-wallpapers/src/client/LocalMediaSettings
 */

import { useEffect, useState } from 'react'
import { listMedia } from './localmedia/api.ts'
import type { ListResult, MediaEntry } from './localmedia/api.ts'
import { getLocalMediaConfig, setLocalMediaConfig, subscribeLocalMediaConfig } from './localmedia/store.ts'
import type { LocalMediaConfig } from './localmedia/store.ts'
import css from './LocalMediaSettings.module.css'

/** Offered slideshow intervals, in seconds. */
const INTERVALS: readonly { readonly value: number; readonly label: string }[] = [
  { value: 5, label: '5 秒' },
  { value: 15, label: '15 秒' },
  { value: 30, label: '30 秒' },
  { value: 60, label: '1 分钟' },
  { value: 300, label: '5 分钟' },
  { value: 600, label: '10 分钟' },
]

/** The embedded folder browser: lists one directory, navigates, picks. */
function LocalMediaBrowser(props: { readonly onClose: () => void }) {
  // Start where the configuration points; a configured file hops to its
  // folder once listed, and '' starts at the host home directory.
  const [cwd, setCwd] = useState<string>(() => getLocalMediaConfig().path)
  const [nonce, setNonce] = useState(0)
  const [result, setResult] = useState<ListResult | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [manual, setManual] = useState('')

  useEffect(() => {
    let cancelled = false
    setBusy(true)
    setError('')
    setResult(null)
    listMedia(cwd).then((r) => {
      if (cancelled) return
      setBusy(false)
      if (r.kind === 'missing') {
        setError('路径不存在')
        return
      }
      if (r.kind !== 'dir') {
        if (r.parent !== null) setCwd(r.parent)
        else setError('无法浏览该路径')
        return
      }
      setResult(r)
    }).catch((e: unknown) => {
      if (cancelled) return
      setBusy(false)
      setError(e instanceof Error ? e.message : String(e))
    })
    return () => { cancelled = true }
  }, [cwd, nonce])

  const pick = (entry: MediaEntry): void => {
    if (entry.kind === 'dir') {
      setCwd(entry.path)
      return
    }
    setLocalMediaConfig({ path: entry.path })
    props.onClose()
  }

  const mediaCount = result === null
    ? 0
    : result.entries.filter(e => e.kind === 'image' || e.kind === 'video').length

  const goManual = (): void => {
    const target = manual.trim()
    if (target !== '') setCwd(target)
  }

  return (
    <div className={css.browser}>
      <div className={css.toolbar}>
        <button
          type="button"
          disabled={result === null || result.parent === null}
          onClick={() => { if (result?.parent != null) setCwd(result.parent) }}
        >
          ↑ 上一级
        </button>
        <button type="button" onClick={() => { setNonce(n => n + 1) }}>刷新</button>
        <span className={css.cwd} title={result?.path ?? cwd}>
          {result?.path ?? (busy ? '读取中…' : cwd)}
        </span>
      </div>
      {result !== null && result.parent === null && result.roots !== undefined && (
        <div className={css.roots}>
          {result.roots.map(root => (
            <button key={root} type="button" onClick={() => { setCwd(root) }}>{root}</button>
          ))}
        </div>
      )}
      <div className={css.list}>
        {result?.entries.map(entry => (
          <button key={entry.path} type="button" className={css.entry} onClick={() => { pick(entry) }}>
            <span className={css.icon} aria-hidden="true">
              {entry.kind === 'dir' ? '📁' : entry.kind === 'video' ? '🎬' : '🖼️'}
            </span>
            <span className={css.name}>{entry.name}</span>
          </button>
        ))}
        {!busy && error === '' && result !== null && result.entries.length === 0 && (
          <div className={css.empty}>此文件夹中没有可用的子文件夹或媒体文件</div>
        )}
        {busy && <div className={css.empty}>读取中…</div>}
        {error !== '' && <div className={css.errline}>{error}</div>}
      </div>
      <div className={css.browserFoot}>
        <span className={css.count}>{result === null ? '' : `${mediaCount} 个媒体文件`}</span>
        <button
          type="button"
          className={css.primary}
          disabled={result === null || mediaCount === 0}
          onClick={() => {
            if (result === null) return
            setLocalMediaConfig({ path: result.path })
            props.onClose()
          }}
        >
          轮播此文件夹
        </button>
      </div>
      <div className={css.manual}>
        <input
          value={manual}
          placeholder="或输入绝对路径，如 D:\Wallpapers"
          onChange={(e) => { setManual(e.target.value) }}
          onKeyDown={(e) => { if (e.key === 'Enter') goManual() }}
        />
        <button type="button" disabled={manual.trim() === ''} onClick={goManual}>转到</button>
      </div>
    </div>
  )
}

/** The settings card for the 本地媒体 wallpaper. */
export function LocalMediaSettings() {
  const [config, setConfigState] = useState<LocalMediaConfig>(getLocalMediaConfig)
  useEffect(() => subscribeLocalMediaConfig(() => { setConfigState(getLocalMediaConfig()) }), [])
  const [browsing, setBrowsing] = useState(false)

  return (
    <div className={css.card}>
      <div>
        <span className={css.cap}>壁纸来源（图片 · 视频 · 文件夹）</span>
        <span className={css.path} title={config.path}>
          {config.path === '' ? '未选择 — 点击「浏览」挑选一个文件或文件夹' : config.path}
        </span>
      </div>
      <div className={css.actions}>
        <button type="button" className={css.primary} onClick={() => { setBrowsing(v => !v) }}>
          {browsing ? '收起浏览' : '浏览…'}
        </button>
        {config.path !== '' && (
          <button type="button" onClick={() => { setLocalMediaConfig({ path: '' }) }}>清除</button>
        )}
      </div>
      {browsing && <LocalMediaBrowser onClose={() => { setBrowsing(false) }} />}
      <div className={css.opts}>
        <label className={css.opline}>
          壁纸浓度
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={String(config.opacity)}
            onChange={(e) => { setLocalMediaConfig({ opacity: Number(e.target.value) }) }}
          />
          <span className={css.val}>{Math.round(config.opacity * 100)}%</span>
        </label>
        <label>
          轮播间隔
          <select
            value={String(config.intervalSec)}
            onChange={(e) => { setLocalMediaConfig({ intervalSec: Number(e.target.value) }) }}
          >
            {INTERVALS.some(opt => opt.value === config.intervalSec) ? null : (
              <option value={String(config.intervalSec)}>{config.intervalSec} 秒</option>
            )}
            {INTERVALS.map(opt => (
              <option key={opt.value} value={String(opt.value)}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label>
          适配方式
          <select
            value={config.fit}
            onChange={(e) => { setLocalMediaConfig({ fit: e.target.value === 'contain' ? 'contain' : 'cover' }) }}
          >
            <option value="cover">填满裁切</option>
            <option value="contain">完整显示</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={config.shuffle}
            onChange={(e) => { setLocalMediaConfig({ shuffle: e.target.checked }) }}
          />
          随机顺序
        </label>
      </div>
      <p className={css.tip}>
        图片：jpg / png / gif / webp / avif / bmp / svg；视频：mp4 / webm / mov / mkv 等（静音播放，个别编码浏览器可能不支持）。
        文件夹取其顶层文件按名称顺序轮播；设置保存在本机浏览器。
      </p>
    </div>
  )
}
