/**
 * The Kerr-Newman wallpaper component: full-screen WebGL2 canvas plus the
 * collapsible right-hand control panel (presets, spacetime / accretion disk /
 * sky / camera / post sliders, quality, FPS stats, screenshot). Panel state
 * is React state persisted to localStorage; visibility is driven by the
 * wallpaper registry through a module-level bridge (the registry may hide
 * the layer before this component ever mounts). Physics: strict Kerr-Newman
 * metric in ingoing Kerr-Schild Cartesian form, Hamiltonian photon tracing
 * with RK4 and null-constraint re-projection, adaptive natural affine steps,
 * horizon detection via redshift divergence, volumetric turbulent accretion
 * disk with Doppler + gravitational shift, antiverse sky inversion past the
 * ring singularity.
 *
 * @module dsh-wallpapers/src/client/KerrNewmanWallpaper
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { KnEngine, KnParams, KnStats } from './kerrnewman/engine.ts'
import { createKnEngine } from './kerrnewman/engine.ts'
import css from './KerrNewmanWallpaper.module.css'

/** All panel-tunable values; persisted as one object. */
export type PanelParams = KnParams

const DEFAULTS: PanelParams = {
  spin: 0.9, charge: 0.45,
  diskIn: 2.4, diskOut: 13, diskH: 0.28,
  temp: 8200, tempExp: 0.14, bright: 1.0, brightExp: 0.16, dens: 1.3, densExp: 0.18,
  turb: 0.55, turbScale: 1.1, doppler: 1.0, orbit: 1.0, extinct: 0.85,
  camDist: 15, camTilt: 7, fov: 55, rotSpeed: 0.6,
  starDens: 0.7, starBright: 1.0, nebula: 0.5,
  bloom: 0.7, bloomThr: 0.8, ca: 1.1, exposure: 1.05, vignette: 0.5,
  dim: 0.0, cssOpacity: 0.9,
}

const PRESETS: Record<string, Partial<PanelParams>> = {
  movie: { spin: 0.8, charge: 0.2, doppler: 0.35, temp: 5600, bloom: 0.9, ca: 0.7, nebula: 0.35 },
  extremal: { spin: 0.995, charge: 0.1, doppler: 1.1, temp: 9000 },
  naked: { spin: 1.25, charge: 0, camDist: 11, densExp: 0.14, diskIn: 2.2 },
  antiverse: { spin: 1.3, charge: 0.62, camDist: 9, fov: 70, nebula: 0.8 },
  hot: { temp: 14500, tempExp: 0.2, doppler: 1.3, bright: 1.4, extinct: 1.2 },
}

interface Section { readonly title: string; readonly rows: readonly Row[] }
interface Row {
  readonly label: string
  readonly unit: string
  readonly key: keyof PanelParams
  readonly min: number
  readonly max: number
  readonly step: number
  readonly dec: number
}

const SECTIONS: readonly Section[] = [
  {
    title: '时空',
    rows: [
      { label: '自旋', unit: 'a/M', key: 'spin', min: -1.5, max: 1.5, step: 0.01, dec: 2 },
      { label: '电荷', unit: 'Q/M', key: 'charge', min: 0, max: 1.5, step: 0.01, dec: 2 },
    ],
  },
  {
    title: '吸积盘',
    rows: [
      { label: '内半径', unit: 'M', key: 'diskIn', min: 1.2, max: 8, step: 0.05, dec: 2 },
      { label: '外半径', unit: 'M', key: 'diskOut', min: 6, max: 26, step: 0.25, dec: 2 },
      { label: '厚度', unit: '', key: 'diskH', min: 0.05, max: 1.1, step: 0.01, dec: 2 },
      { label: '温度', unit: 'K', key: 'temp', min: 2000, max: 20000, step: 100, dec: 0 },
      { label: '温度衰减', unit: '', key: 'tempExp', min: 0.02, max: 0.5, step: 0.005, dec: 3 },
      { label: '亮度', unit: '', key: 'bright', min: 0.05, max: 4, step: 0.05, dec: 2 },
      { label: '亮度衰减', unit: '', key: 'brightExp', min: 0.02, max: 0.6, step: 0.005, dec: 3 },
      { label: '密度', unit: '', key: 'dens', min: 0.1, max: 4, step: 0.05, dec: 2 },
      { label: '密度衰减', unit: '', key: 'densExp', min: 0.02, max: 0.6, step: 0.005, dec: 3 },
      { label: '湍流', unit: '', key: 'turb', min: 0, max: 1, step: 0.01, dec: 2 },
      { label: '湍流尺度', unit: '', key: 'turbScale', min: 0.3, max: 3, step: 0.05, dec: 2 },
      { label: '多普勒', unit: '', key: 'doppler', min: 0, max: 1.5, step: 0.05, dec: 2 },
      { label: '轨道流速', unit: '', key: 'orbit', min: 0, max: 3, step: 0.05, dec: 2 },
      { label: '消光·红化', unit: '', key: 'extinct', min: 0, max: 3, step: 0.05, dec: 2 },
    ],
  },
  {
    title: '相机与星空',
    rows: [
      { label: '距离', unit: 'M', key: 'camDist', min: 4, max: 40, step: 0.25, dec: 2 },
      { label: '倾角', unit: '°', key: 'camTilt', min: -85, max: 85, step: 1, dec: 0 },
      { label: '视场', unit: '°', key: 'fov', min: 25, max: 90, step: 1, dec: 0 },
      { label: '环绕速度', unit: '', key: 'rotSpeed', min: 0, max: 4, step: 0.05, dec: 2 },
      { label: '星星密度', unit: '', key: 'starDens', min: 0, max: 1.5, step: 0.05, dec: 2 },
      { label: '星星亮度', unit: '', key: 'starBright', min: 0, max: 3, step: 0.05, dec: 2 },
      { label: '星云', unit: '', key: 'nebula', min: 0, max: 1.5, step: 0.05, dec: 2 },
    ],
  },
  {
    title: '后处理',
    rows: [
      { label: '泛光', unit: '', key: 'bloom', min: 0, max: 2, step: 0.05, dec: 2 },
      { label: '泛光阈值', unit: '', key: 'bloomThr', min: 0, max: 2, step: 0.05, dec: 2 },
      { label: '色散', unit: '', key: 'ca', min: 0, max: 4, step: 0.05, dec: 2 },
      { label: '曝光', unit: '', key: 'exposure', min: 0.2, max: 3, step: 0.05, dec: 2 },
      { label: '暗角', unit: '', key: 'vignette', min: 0, max: 1.5, step: 0.05, dec: 2 },
    ],
  },
]

const STORAGE_KEY = 'dsh.ui-kerrnewman.params.v1'

function loadParams(): PanelParams {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return DEFAULTS
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return DEFAULTS
    return { ...DEFAULTS, ...(parsed as Partial<PanelParams>) }
  } catch {
    return DEFAULTS
  }
}

function saveParams(p: PanelParams): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)) } catch { /* session-only then */ }
}

/** Registry → component visibility bridge; set on mount, read at registration time. */
export const visibility = { apply: null as ((on: boolean) => void) | null, desired: true }

/** One labeled range slider row. */
function SliderRow(props: {
  p: PanelParams
  row: Row
  onChange: (key: keyof PanelParams, value: number) => void
}) {
  const { row, p } = props
  return (
    <div className={css.row}>
      <div className={css.labline}>
        <span>{row.label}{row.unit !== '' && <em>&nbsp;{row.unit}</em>}</span>
        <span className={css.val}>{p[row.key].toFixed(row.dec)}</span>
      </div>
      <input
        type="range"
        min={String(row.min)}
        max={String(row.max)}
        step={String(row.step)}
        value={String(p[row.key])}
        onChange={(e) => { props.onChange(row.key, Number(e.target.value)) }}
      />
    </div>
  )
}

/** The Kerr-Newman wallpaper entry. */
export function KerrNewmanWallpaper() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const engineRef = useRef<KnEngine | null>(null)
  const [p, setP] = useState<PanelParams>(loadParams)
  const [stats, setStats] = useState<KnStats>({ fps: '--', res: '--', steps: '--' })
  const [quality, setQualityState] = useState(1)
  const [autoRotate, setAutoRotate] = useState(true)
  const [interactive, setInteractive] = useState(false)
  const [collapsed, setCollapsed] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const api = createKnEngine(canvasRef.current, {
      onStats: setStats,
      onQuality: (i) => { setQualityState(i) },
      onFatal: (m) => { setError(m) },
    })
    engineRef.current = api

    visibility.apply = (on: boolean): void => {
      if (hostRef.current !== null) hostRef.current.style.display = on ? '' : 'none'
      if (on) api.resume()
      else api.pause()
    }
    visibility.apply(visibility.desired)

    return () => {
      visibility.apply = null
      api.dispose()
      engineRef.current = null
    }
  }, [])

  useEffect(() => {
    engineRef.current?.setParams(p)
    saveParams(p)
  }, [p])

  useEffect(() => { engineRef.current?.setAutoRotate(autoRotate) }, [autoRotate])
  useEffect(() => { engineRef.current?.setInteractive(interactive) }, [interactive])

  const upd = (key: keyof PanelParams, value: number): void => {
    setP(prev => ({ ...prev, [key]: value }))
  }
  const applyPreset = (id: string): void => {
    const preset = PRESETS[id]
    /* v8 ignore next -- the preset buttons pass fixed ids that all exist in PRESETS */
    if (preset !== undefined) setP(prev => ({ ...prev, ...preset }))
  }

  const slider = (row: Row): ReactElement => <SliderRow key={row.key} row={row} p={p} onChange={upd} />

  return (
    <div
      ref={hostRef}
      className={css.host}
      aria-hidden="true"
      data-collapsed={collapsed ? '' : undefined}
      data-interactive={interactive ? '' : undefined}
    >
      <canvas ref={canvasRef} className={css.canvas} style={{ opacity: p.cssOpacity }} />
      <div className={css.veil} style={{ opacity: p.dim }} />
      <button className={css.open} title="展开面板" onClick={() => { setCollapsed(false) }}>⟨</button>
      <aside className={css.panel}>
        <button className={css.toggle} title="收起面板" onClick={() => { setCollapsed(true) }}>⟩</button>
        <header className={css.head}>
          <h1>KERR–NEWMAN</h1>
          <p className={css.sub}>带电旋转黑洞 · 哈密顿光子追踪</p>
        </header>
        {error !== ''
          ? <div className={css.fatal}>{error}</div>
          : (
            <div className={css.stats}>
              <div className={css.stat}><b>{stats.fps}</b>FPS</div>
              <div className={css.stat}><b>{stats.res}</b>分辨率</div>
              <div className={css.stat}><b>{stats.steps}</b>积分步</div>
            </div>
          )}
        <div className={css.presets}>
          <button onClick={() => { applyPreset('movie') }}>电影</button>
          <button onClick={() => { applyPreset('extremal') }}>极端</button>
          <button onClick={() => { applyPreset('naked') }}>裸奇环</button>
          <button onClick={() => { applyPreset('antiverse') }}>反宇宙</button>
          <button onClick={() => { applyPreset('hot') }}>炽热</button>
          <button onClick={() => { setP(DEFAULTS) }}>默认</button>
        </div>
        <section className={css.sec}>
          <h2>壁纸</h2>
          <SliderRow p={p} row={{ label: '壁纸浓度', unit: '', key: 'cssOpacity', min: 0, max: 1, step: 0.05, dec: 2 }} onChange={upd} />
          <SliderRow p={p} row={{ label: '背景暗化', unit: '', key: 'dim', min: 0, max: 0.8, step: 0.05, dec: 2 }} onChange={upd} />
          <div className={`${css.row} ${css.checkline}`}>
            <label>
              <input type="checkbox" checked={interactive} onChange={(e) => { setInteractive(e.target.checked) }} />
              交互模式（拖拽旋转 · 滚轮缩放）
            </label>
          </div>
        </section>
        {SECTIONS.map(s => (
          <section className={css.sec} key={s.title}>
            <h2>{s.title}</h2>
            {s.rows.map(slider)}
          </section>
        ))}
        <section className={css.sec}>
          <h2>渲染</h2>
          <div className={css.row}>
            <div className={css.labline}><span>画质</span></div>
            <select
              value={String(quality)}
              onChange={(e) => {
                const i = Number(e.target.value)
                setQualityState(i)
                engineRef.current?.setQuality(i, true)
              }}
            >
              <option value="0">低（性能优先）</option>
              <option value="1">中（推荐）</option>
              <option value="2">高</option>
              <option value="3">极致</option>
            </select>
          </div>
          <div className={`${css.row} ${css.checkline}`}>
            <label>
              <input type="checkbox" checked={autoRotate} onChange={(e) => { setAutoRotate(e.target.checked) }} />
              自动环绕
            </label>
            <button className={css.mini} onClick={() => { engineRef.current?.capture() }}>保存截图</button>
          </div>
        </section>
        <footer className={css.foot}>
          ingoing Kerr–Schild 度规 · RK4 哈密顿积分 · 仿射参数自然取值<br />
          视界由红移发散间接判定；a²+Q² &gt; 1 为裸奇环，奇环另一侧为反宇宙（天空补色）
        </footer>
      </aside>
    </div>
  )
}
