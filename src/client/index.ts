/**
 * Browser half of dsh-wallpapers: the wallpaper registry (a page-local
 * service background layers register into) plus its Settings section, the
 * thinking-orb canvas, and the GARGANTUA black-hole layer. Selection persists
 * in localStorage; wallpapers that register while not selected are hidden
 * through their own `show`/`hide` callbacks (a hidden layer pauses its
 * render loop), so no slot shadowing is involved.
 *
 * @module dsh-wallpapers/client
 */

import { createElement } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: merges the settings slot and shell overlay declarations into SlotMap.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { BlackholeWallpaper, visibility as blackholeVisibility } from './BlackholeWallpaper.tsx'
import { OrbBackdrop, visibility as orbsVisibility } from './OrbBackdrop.tsx'
import { createWallpaperRegistry } from './registry.ts'
import type { WallpaperRegistry } from './registry.ts'
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
}
