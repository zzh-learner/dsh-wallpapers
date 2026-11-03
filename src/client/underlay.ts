/**
 * Underlay mode: lift the harness app columns above the shell-overlay layer
 * so registered wallpapers can act as the TRUE page backdrop instead of a
 * translucent sheet printed over the UI.
 *
 * Why JS lives here: the harness marks its overlay container with
 * `data-shell-overlay`, but the surrounding frame/columns are hashed CSS
 * classes (stable across a version, opaque across versions). We inject one
 * stylesheet keyed off stable attributes, then have a MutationObserver stamp
 * generated attributes onto the frame and its column children once mounted;
 * every rule below hangs off those attributes. If the structure ever stops
 * matching, the scan self-disables and the page falls back to the stock
 * layout — decoration, never correctness, depends on this module.
 *
 * @module dsh-wallpapers/src/client/underlay
 */

/** Id of the injected underlay stylesheet. */
const STYLE_ID = 'dsh-wallpapers-underlay'

/** Attribute stamped on the frame (the opaque ancestor). */
const FRAME_ATTR = 'data-dsh-underlay-frame'

/** Attribute stamped on frame children that should rise above the overlay. */
const COL_ATTR = 'data-dsh-underlay-col'

const UNDERLAY_CSS = [
  `#${STYLE_ID}[data-off]{display:none}`,
  `${'[data-shell-overlay]'}{z-index:0 !important}`,
  `[${FRAME_ATTR}]{background:transparent !important}`,
  `[${COL_ATTR}]{position:relative;z-index:5}`,
  // Surface slimming: with a wallpaper behind the UI, the theme's near-opaque
  // menu/composer fill (#303136f0, 94%) reads as a big black slab over bright
  // wallpapers. While underlay is on, thin the dark-theme surface fill and
  // soften its blur so the wallpaper shows through; light theme already uses
  // a pale fill and needs no change. Keyed off the theme's own custom
  // properties — no hashed class names involved.
  `body[data-ds-dark-theme]{--dsw-specific-menu:#30313666;--dsw-menu-backdrop-filter:blur(28px) saturate(150%)}`,
].join('\n')

let observer: MutationObserver | null = null
let rafHandle = 0
/** Consecutive scans that found nothing; two in a row means the DOM drifted. */
let misses = 0

/** Walk up from the overlay to the nearest positioned ancestor (the frame). */
function findFrame(overlay: Element): HTMLElement | null {
  let node: HTMLElement | null = overlay instanceof HTMLElement ? overlay : overlay.parentElement
  for (let hop = 0; node !== null && hop < 6; hop += 1) {
    if (getComputedStyle(node).position !== 'static') return node
    node = node.parentElement
  }
  return null
}

/** Stamp the frame + column attributes; idempotent, cheap to re-run. */
function scan(): void {
  rafHandle = 0
  const overlay = document.querySelector('[data-shell-overlay]')
  if (overlay === null) return // page still mounting; the observer re-fires
  const frame = findFrame(overlay)
  if (frame === null) {
    misses += 1
    if (misses >= 2) disableUnderlay() // structure drift: fail closed
    return
  }
  misses = 0
  if (!frame.hasAttribute(FRAME_ATTR)) frame.setAttribute(FRAME_ATTR, '')
  for (const child of Array.from(frame.children)) {
    if (child === overlay) continue
    const el = child as HTMLElement
    if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT') continue
    if (!el.hasAttribute(COL_ATTR)) el.setAttribute(COL_ATTR, '')
  }
}

/** Coalesced scan: mutation bursts collapse into one frame of work. */
function scheduleScan(): void {
  if (rafHandle !== 0 || typeof requestAnimationFrame !== 'function') {
    if (rafHandle === 0) scan()
    return
  }
  rafHandle = requestAnimationFrame(scan)
}

/**
 * Turn underlay mode on: inject the stylesheet (with `data-off` cleared),
 * start observing for the frame, and run the first scan immediately.
 */
export function enableUnderlay(): void {
  try {
    let tag = document.getElementById(STYLE_ID)
    if (tag === null) {
      tag = document.createElement('style')
      tag.id = STYLE_ID
      tag.dataset.plugin = 'dsh-wallpapers'
      tag.textContent = UNDERLAY_CSS
      document.head.appendChild(tag)
    } else {
      delete tag.dataset.off
    }
    misses = 0
    scheduleScan()
    if (observer === null && typeof MutationObserver === 'function') {
      observer = new MutationObserver(scheduleScan)
      observer.observe(document.body, { childList: true, subtree: true })
    }
  } catch {
    /* No DOM yet or hostile environment: underlay simply stays off. */
  }
}

/** Turn underlay mode off: hide (not drop) the stylesheet and undo stamps. */
export function disableUnderlay(): void {
  try {
    const tag = document.getElementById(STYLE_ID)
    if (tag !== null) tag.dataset.off = ''
    for (const el of document.querySelectorAll(`[${FRAME_ATTR}],[${COL_ATTR}]`)) {
      el.removeAttribute(FRAME_ATTR)
      el.removeAttribute(COL_ATTR)
    }
    if (observer !== null) {
      observer.disconnect()
      observer = null
    }
  } catch {
    /* Nothing left to unwind. */
  }
}
