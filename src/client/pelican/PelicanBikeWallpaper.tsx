/**
 * The 鹈鹕骑行 wallpaper component: the generated pure-CSS SVG animation (a
 * pelican pedaling a bicycle, IK-solved legs baked into keyframes) mounted as
 * a background layer. Artwork markup and the scoped stylesheet come from the
 * generator output `art.ts`; regenerate with
 * `python pelican-bike/build_pelican.py`.
 *
 * Visibility follows the wallpaper registry through the same module-level
 * bridge as the other layers (the registry may hide this layer before the
 * component ever mounts); hiding sets display:none, which also stops every
 * CSS animation inside at zero cost. Layer opacity ("壁纸浓度") persists
 * through prefs.ts and defaults translucent so the conversation stays
 * readable whether this layer paints above the UI (stock harness) or beneath
 * it (underlay mode).
 *
 * @module dsh-wallpapers/src/client/pelican/PelicanBikeWallpaper
 */

import { useEffect, useRef, useState } from 'react'
import { PELICAN_CSS, PELICAN_SCOPE, PELICAN_SVG } from './art.ts'
import { getPelicanPrefs, subscribePelicanPrefs } from './prefs.ts'
import css from './PelicanBikeWallpaper.module.css'

/** Registry → component visibility bridge; set on mount, read at registration time. */
export const visibility = { apply: null as ((on: boolean) => void) | null, desired: true }

/** The 鹈鹕骑行 wallpaper entry. */
export function PelicanBikeWallpaper() {
  const hostRef = useRef<HTMLDivElement | null>(null)
  // Seeded synchronously so the first paint already carries the stored opacity.
  const [opacity, setOpacity] = useState(() => getPelicanPrefs().opacity)

  useEffect(() => {
    visibility.apply = (on: boolean): void => {
      if (hostRef.current !== null) {
        hostRef.current.style.display = on ? '' : 'none'
        // Inline beats the shell's ".overlayLayer > * {pointer-events:auto}":
        // decorative artwork must never swallow clicks meant for the UI.
        hostRef.current.style.pointerEvents = 'none'
      }
    }
    visibility.apply(visibility.desired)
    return () => { visibility.apply = null }
  }, [])

  useEffect(() => subscribePelicanPrefs(() => { setOpacity(getPelicanPrefs().opacity) }), [])

  return (
    <div ref={hostRef} className={css.host} aria-hidden="true">
      <style>{PELICAN_CSS}</style>
      <div
        className={`${css.artRoot} ${PELICAN_SCOPE}`}
        /* Generator-emitted static markup, not user input. */
        dangerouslySetInnerHTML={{ __html: PELICAN_SVG }}
        style={{ opacity }}
      />
      {/* Grounding strip: keeps a bright sky from erasing the input edge. */}
      <div className={css.fade} />
    </div>
  )
}
