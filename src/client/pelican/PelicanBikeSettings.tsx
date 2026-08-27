/**
 * The 鹈鹕骑行 settings card, rendered by the 壁纸 section under the selected
 * row: one persisted opacity slider ("壁纸浓度") feeding prefs.ts live — the
 * artwork behind (or above) the open panel updates as the slider moves.
 *
 * @module dsh-wallpapers/src/client/pelican/PelicanBikeSettings
 */

import { useEffect, useState } from 'react'
import { getPelicanPrefs, setPelicanPrefs, subscribePelicanPrefs } from './prefs.ts'
import css from './PelicanBikeSettings.module.css'

/** The settings card for the 鹈鹕骑行 wallpaper. */
export function PelicanBikeSettings() {
  const [opacity, setOpacityState] = useState(() => getPelicanPrefs().opacity)
  useEffect(() => subscribePelicanPrefs(() => { setOpacityState(getPelicanPrefs().opacity) }), [])

  return (
    <div className={css.card}>
      <span className={css.cap}>壁纸浓度</span>
      <div className={css.opline}>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={String(opacity)}
          onChange={(e) => { setPelicanPrefs({ opacity: Number(e.target.value) }) }}
        />
        <span className={css.val}>{Math.round(opacity * 100)}%</span>
      </div>
      <p className={css.tip}>
        浓度越低界面文字越清晰；「壁纸衬底」开启时壁纸整体垫在栏目后面，可适当调高。
      </p>
    </div>
  )
}
