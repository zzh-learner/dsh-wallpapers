/**
 * Node half of the dsh-wallpapers plugin: registers the `orbActivity`
 * session projection (in-flight tool names, streaming bit, turn outcomes
 * folded from the durable log) that the browser wallpapers render from, and —
 * when the composition provides a web server — the local-media routes the
 * 「本地媒体」 wallpaper picks files and folders through. The UI itself is
 * the browser half under ./client.
 *
 * @module dsh-wallpapers
 */

import type { Context } from '@deepseek-ai/cordis'
import { registerLocalMediaRoutes } from './media.ts'
import { orbActivityProjectionDefinition } from './projection.ts'

export type * from './types.ts'

/** Cordis plugin name. */
export const name = 'dsh-wallpapers'
/** The projection registry is required; the web-server routes attach opportunistically. */
export const inject = ['sessionProjections']

/**
 * Register the `orbActivity` unit and (in web compositions) the
 * `/dsh-wallpapers/local` routes; both are effects on this plugin's fiber,
 * so unloading removes them.
 * @param ctx - registrant context carrying the projection registry.
 */
export function apply(ctx: Context): void {
  ctx.sessionProjections.register(orbActivityProjectionDefinition)
  registerLocalMediaRoutes(ctx)
}
