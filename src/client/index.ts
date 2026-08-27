/**
 * Browser half of dsh-wallpapers: the wallpaper registry (a page-local
 * service background layers register into) plus its Settings section, the
 * thinking-orb canvas, the GARGANTUA black-hole layer, the Kerr-Newman
 * black-hole layer, the generated pure-CSS 鹈鹕骑行 layer (IK-pedal SVG
 * artwork), and the 本地媒体 layer (one local image/video, or a folder
 * rotation served by the host-half routes). Selection persists in localStorage;
 * wallpapers that register while not selected are hidden through their own
 * `show`/`hide` callbacks (a hidden layer pauses its render loop), so no
 * slot shadowing is involved.
 *
 * @module dsh-wallpapers/client
 */

import { createElement } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: merges the settings slot and shell overlay declarations into SlotMap.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { BlackholeWallpaper, visibility as blackholeVisibility } from './BlackholeWallpaper.tsx'
import { KerrNewmanWallpaper, visibility as kerrNewmanVisibility } from './KerrNewmanWallpaper.tsx'
import { PelicanBikeWallpaper, visibility as pelicanBikeVisibility } from './pelican/PelicanBikeWallpaper.tsx'
import { PelicanBikeSettings } from './pelican/PelicanBikeSettings.tsx'
import { LocalMediaWallpaper, visibility as localMediaVisibility } from './LocalMediaWallpaper.tsx'
import { LocalMediaSettings } from './LocalMediaSettings.tsx'
import { OrbBackdrop, visibility as orbsVisibility } from './OrbBackdrop.tsx'
import { createWallpaperRegistry } from './registry.ts'
import type { WallpaperRegistry } from './registry.ts'
import { disableUnderlay, enableUnderlay } from './underlay.ts'
import { WallpaperSection } from './WallpaperSection.tsx'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Wallpaper registry: selection + registration of background layers. */
    'wallpaper.registry': WallpaperRegistry
  }
}

/** Required services: the slot registry. The wallpaper registry is provided below. */
export const inject = ['slots']

/** The share the settings shell passes every section (only `close` is used). */
interface SectionProps {
  readonly close: () => void
}

/**
 * Client plugin body: provide the wallpaper registry and its Settings
 * section, then register the thinking-orb and GARGANTUA layers into the
 * shell overlay and the registry.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const registry = createWallpaperRegistry()
  const stopProvide = ctx.provide('wallpaper.registry', registry)
  ctx.slots.inject('settings.section', () => ctx.slots.register(
    { name: 'settings.section', id: 'wallpaper', order: 20, label: '壁纸' },
    (props: SectionProps) => createElement(WallpaperSection, { registry, close: props.close }),
  ))
  ctx.effect(() => stopProvide)

  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    { name: 'shell.overlay', id: 'orbs-backdrop', order: -1000, label: '思考球体' },
    OrbBackdrop,
  ))
  const stopOrbs = registry.register({
    id: 'orbs',
    label: '思考球体',
    note: '会话活动球体 · 可配置',
    show: () => {
      orbsVisibility.desired = true
      orbsVisibility.apply?.(true)
    },
    hide: () => {
      orbsVisibility.desired = false
      orbsVisibility.apply?.(false)
    },
  })
  ctx.effect(() => stopOrbs)

  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    { name: 'shell.overlay', id: 'gargantua-wallpaper', order: -2000, label: 'GARGANTUA 黑洞壁纸' },
    BlackholeWallpaper,
  ))
  const stopBlackhole = registry.register({
    id: 'gargantua',
    label: 'GARGANTUA 黑洞',
    note: '引力透镜光线追踪 · WebGL2',
    show: () => {
      blackholeVisibility.desired = true
      blackholeVisibility.apply?.(true)
    },
    hide: () => {
      blackholeVisibility.desired = false
      blackholeVisibility.apply?.(false)
    },
  })
  ctx.effect(() => stopBlackhole)

  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    { name: 'shell.overlay', id: 'kerr-newman-wallpaper', order: -1900, label: 'Kerr–Newman 黑洞壁纸' },
    KerrNewmanWallpaper,
  ))
  const stopKerrNewman = registry.register({
    id: 'kerr-newman',
    label: 'Kerr–Newman 黑洞',
    note: 'KN 度规哈密顿光追 · 体积吸积盘',
    show: () => {
      kerrNewmanVisibility.desired = true
      kerrNewmanVisibility.apply?.(true)
    },
    hide: () => {
      kerrNewmanVisibility.desired = false
      kerrNewmanVisibility.apply?.(false)
    },
  })
  ctx.effect(() => stopKerrNewman)

  // Underlay mode: full-bleed wallpapers (鹈鹕骑行 / 本地媒体) want to sit
  // BEHIND the app columns; enable the DOM lift while one of them is selected.
  // The subscription effect re-runs the check on every registry change.
  {
    const applyUnderlay = (): void => {
      const id = registry.current()
      if (id === 'pelican-bike' || id === 'local-media') enableUnderlay()
      else disableUnderlay()
    }
    applyUnderlay() // honor the persisted selection at plugin start
    ctx.effect(() => registry.subscribe(applyUnderlay))
  }

  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    { name: 'shell.overlay', id: 'pelican-bike-wallpaper', order: -1800, label: '鹈鹕骑行壁纸' },
    PelicanBikeWallpaper,
  ))
  const stopPelicanBike = registry.register({
    id: 'pelican-bike',
    label: '鹈鹕骑行',
    note: 'SVG 两连杆逆解踩踏 · 纯 CSS 动画',
    show: () => {
      pelicanBikeVisibility.desired = true
      pelicanBikeVisibility.apply?.(true)
    },
    hide: () => {
      pelicanBikeVisibility.desired = false
      pelicanBikeVisibility.apply?.(false)
    },
    renderSettings: () => createElement(PelicanBikeSettings),
  })
  ctx.effect(() => stopPelicanBike)

  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    { name: 'shell.overlay', id: 'local-media-wallpaper', order: -1500, label: '本地媒体壁纸' },
    LocalMediaWallpaper,
  ))
  const stopLocalMedia = registry.register({
    id: 'local-media',
    label: '本地媒体',
    note: '本地图片 / 视频 / 文件夹轮播',
    show: () => {
      localMediaVisibility.desired = true
      localMediaVisibility.apply?.(true)
    },
    hide: () => {
      localMediaVisibility.desired = false
      localMediaVisibility.apply?.(false)
    },
    renderSettings: () => createElement(LocalMediaSettings),
  })
  ctx.effect(() => stopLocalMedia)
}
