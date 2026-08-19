/**
 * Node half of the dsh-wallpapers plugin: registers the `orbActivity`
 * session projection (in-flight tool names, streaming bit, turn outcomes
 * folded from the durable log) that the browser wallpapers render from. The
 * UI itself is the browser half under ./client; nothing else mounts host-side.
 *
 * @module dsh-wallpapers
 */

import type { Context } from '@deepseek-ai/cordis'
import { orbActivityProjectionDefinition } from './projection.ts'

export type * from './types.ts'

/** Cordis plugin name. */
export const name = 'dsh-wallpapers'
/** The projection registry is the plugin's whole purpose; without it the fiber stays pending. */
export const inject = ['sessionProjections']

/**
 * Register the `orbActivity` unit; the registration is an effect on this
 * plugin's fiber, so unloading removes the key.
 * @param ctx - registrant context carrying the projection registry.
 */
export function apply(ctx: Context): void {
  ctx.sessionProjections.register(orbActivityProjectionDefinition)
}
