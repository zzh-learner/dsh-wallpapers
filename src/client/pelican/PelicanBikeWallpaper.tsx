/**
 * The pelican-bike wallpaper component: the generated pure-CSS SVG animation
 * (a pelican pedaling a bicycle, IK-solved legs baked into keyframes) mounted
 * as a static background layer. Artwork markup and the scoped stylesheet come
 * from the generator output `art.ts`; regenerate with
 * `python pelican-bike/build_pelican.py`. Visibility follows the wallpaper
 * registry through the same module-level bridge as the other layers (the
 * registry may hide this layer before the component ever mounts); hiding sets
 * display:none, which also stops all CSS animations.
 *
 * @module dsh-wallpapers/src/client/pelican/PelicanBikeWallpaper
 */

import { useEffect, useRef } from 'react'
import { PELICAN_CSS, PELICAN_SCOPE, PELICAN_SVG } from './art.ts'
import css from './PelicanBikeWallpaper.module.css'

/** Registry → component visibility bridge; set on mount, read at registration time. */
export const visibility = { apply: null as ((on: boolean) => void) | null, desired: true }

/** The pelican-bike wallpaper entry. */
export function PelicanBikeWallpaper() {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    visibility.apply = (on: boolean): void => {
      // display:none suspends every CSS animation inside at zero cost.
      if (hostRef.current !== null) hostRef.current.style.display = on ? '' : 'none'
    }
    visibility.apply(visibility.desired)
    return () => {
      visibility.apply = null
    }
  }, [])

  return (
    <div ref={hostRef} className={css.host} aria-hidden="true">
      {/* Keyframes are pb_-prefixed; every selector hangs off the scope class. */}
      <style>{PELICAN_CSS}</style>
      <div
        className={`${css.artRoot} ${PELICAN_SCOPE}`}
        /* Generator-emitted static markup, not user input. */
        dangerouslySetInnerHTML={{ __html: PELICAN_SVG }}
      />
    </div>
  )
}
