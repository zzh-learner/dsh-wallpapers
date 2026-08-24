/**
 * The Kerr-Newman WebGL2 render engine: geodesic ray-marched main pass into
 * an offscreen HDR target with temporal accumulation, five-level bloom
 * pyramid, and a composite pass (chromatic aberration, ACES tonemap,
 * vignette, grain). The physics lives in shaders.ts; this module owns the
 * GL plumbing, the quality ladder, the pausable render loop, and the stats
 * feed. Ported from the validated playground/kerr-newman.html prototype.
 *
 * @module dsh-wallpapers/src/client/kerrnewman/engine
 */

import { VERT as VERT_SRC, SCENE as SCENE_FRAG, BLEND as BLEND_FRAG, BRIGHT as BRIGHT_FRAG, DOWN as DOWN_FRAG, UP as UP_FRAG, COMPOSITE as COMPOSITE_FRAG } from './shaders.ts'

/** Wallpaper-tunable parameters; persisted as one object by the component. */
export interface KnParams {
  spin: number
  charge: number
  diskIn: number
  diskOut: number
  diskH: number
  temp: number
  tempExp: number
  bright: number
  brightExp: number
  dens: number
  densExp: number
  turb: number
  turbScale: number
  doppler: number
  orbit: number
  extinct: number
  camDist: number
  camTilt: number
  fov: number
  rotSpeed: number
  starDens: number
  starBright: number
  nebula: number
  bloom: number
  bloomThr: number
  ca: number
  exposure: number
  vignette: number
  dim: number
  cssOpacity: number
}

/** One quality step: internal resolution scale, step budget, step-size gain. */
export interface KnQuality { readonly scale: number; readonly steps: number; readonly stepC: number }

/** Periodic stats for the panel readout. */
export interface KnStats { readonly fps: string; readonly res: string; readonly steps: string }

/** Engine callbacks; every one is optional. */
export interface KnCallbacks {
  onStats?: (stats: KnStats) => void
  onQuality?: (index: number) => void
  onFatal?: (message: string) => void
}

/** The engine's public face. */
export interface KnEngine {
  setParams(params: Partial<KnParams>): void
  setQuality(index: number, locked: boolean): void
  setAutoRotate(on: boolean): void
  setInteractive(on: boolean): void
  capture(): void
  pause(): void
  resume(): void
  dispose(): void
}

const QUALITIES: readonly KnQuality[] = [
  { scale: 0.45, steps: 300, stepC: 0.9 },
  { scale: 0.6, steps: 500, stepC: 0.78 },
  { scale: 0.78, steps: 760, stepC: 0.65 },
  { scale: 1.0, steps: 1150, stepC: 0.55 },
]
const FALLBACK_QUALITY: KnQuality = QUALITIES[1] ?? { scale: 0.6, steps: 500, stepC: 0.78 }
const BLOOM_LEVELS = 5
const AUTO_DROP_FPS = 22
const AUTO_DROP_WINDOW_MS = 2600

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x))
const qualityAt = (i: number): KnQuality => QUALITIES[i] ?? FALLBACK_QUALITY

/** Dead API handed back when WebGL2 is unavailable; every method is a no-op. */
const deadEngine = (report: (m: string) => void, message: string): KnEngine => ({
  setParams() { report(message) },
  setQuality() { report(message) },
  setAutoRotate() { report(message) },
  setInteractive() { report(message) },
  capture() { report(message) },
  pause() {},
  resume() { report(message) },
  dispose() {},
})

interface Target { readonly tex: WebGLTexture; readonly fbo: WebGLFramebuffer; readonly w: number; readonly h: number }

interface Prog {
  readonly p: WebGLProgram
  readonly uni: Readonly<Record<string, WebGLUniformLocation | null>>
}

/** Uniform names the scene pass uploads (drives defensive lookups). */
const SCENE_UNIFORMS = ['uRes', 'uTime', 'uCamPos', 'uCamRight', 'uCamUp', 'uCamFwd', 'uFovTan', 'uJitter', 'uSpin', 'uCharge',
  'uSteps', 'uStepC', 'uFar', 'uDiskIn', 'uDiskOut', 'uDiskH', 'uTemp', 'uTempExp', 'uBright', 'uBrightExp', 'uDens', 'uDensExp',
  'uTurb', 'uTurbScale', 'uDoppler', 'uOrbit', 'uExtinct', 'uStarDens', 'uStarBright', 'uNebula'] as const

/**
 * Create the engine against one canvas.
 * @param canvasParam - the canvas to render into (WebGL2 context is taken here).
 * @param cbs - stats / quality / fatal callbacks.
 * @returns the engine API.
 */
export function createKnEngine(canvasParam: HTMLCanvasElement | null, cbs: KnCallbacks = {}): KnEngine {
  if (canvasParam === null) return deadEngine(cbs.onFatal ?? (() => {}), '画布不可用')
  const canvas: HTMLCanvasElement = canvasParam
  const glMaybe = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance',
  })
  if (glMaybe === null) return deadEngine(cbs.onFatal ?? (() => {}), '此浏览器不支持 WebGL2，无法渲染 Kerr-Newman 壁纸。')
  if (glMaybe.getExtension('EXT_color_buffer_float') === null) {
    return deadEngine(cbs.onFatal ?? (() => {}), '缺少 EXT_color_buffer_float 扩展（浮点渲染目标），无法渲染。')
  }
  const gl: WebGL2RenderingContext = glMaybe

  const report = (m: string): void => { cbs.onFatal?.(m) }

  function compile(type: number, src: string): WebGLShader {
    const s = gl.createShader(type)
    /* v8 ignore next -- a null shader object only appears on context loss. */
    if (s === null) throw new Error('着色器创建失败')
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('着色器编译失败：' + String(gl.getShaderInfoLog(s)))
    }
    return s
  }
  function makeProgram(fragSrc: string, names: readonly string[]): Prog {
    const p = gl.createProgram()
    /* v8 ignore next -- null only on context loss. */
    if (p === null) throw new Error('程序创建失败')
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT_SRC))
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragSrc))
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('着色器链接失败：' + String(gl.getProgramInfoLog(p)))
    const uni: Record<string, WebGLUniformLocation | null> = {}
    for (const n of names) uni[n] = gl.getUniformLocation(p, n)
    return { p, uni }
  }

  let progScene: Prog
  let progBlend: Prog
  let progBright: Prog
  let progDown: Prog
  let progUp: Prog
  let progComp: Prog
  try {
    progScene = makeProgram(SCENE_FRAG, SCENE_UNIFORMS)
    progBlend = makeProgram(BLEND_FRAG, ['uPrev', 'uCur', 'uMix'])
    progBright = makeProgram(BRIGHT_FRAG, ['uSrc', 'uThr'])
    progDown = makeProgram(DOWN_FRAG, ['uSrc', 'uTexel'])
    progUp = makeProgram(UP_FRAG, ['uSrc', 'uPrev', 'uTexel'])
    progComp = makeProgram(COMPOSITE_FRAG, ['uScene', 'uBloom', 'uBloomStr', 'uCA', 'uExposure', 'uVignette', 'uTime', 'uRes'])
  } catch (err) {
    report(err instanceof Error ? err.message : String(err))
    return deadEngine(() => {}, '初始化失败')
  }
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)

  function makeTarget(w: number, h: number): Target {
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, w, h)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const fbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return { tex, fbo: fbo as WebGLFramebuffer, w, h }
  }
  function delTarget(t: Target | null): void {
    if (t === null) return
    gl.deleteTexture(t.tex)
    gl.deleteFramebuffer(t.fbo)
  }
  function draw(target: Target | null): void {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target === null ? null : target.fbo)
    const w = target === null ? gl.drawingBufferWidth : target.w
    const h = target === null ? gl.drawingBufferHeight : target.h
    gl.viewport(0, 0, w, h)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  /* ---------------- state ---------------- */
  const params: KnParams = {
    spin: 0.9, charge: 0.45,
    diskIn: 2.4, diskOut: 13, diskH: 0.28,
    temp: 8200, tempExp: 0.14, bright: 1.0, brightExp: 0.16, dens: 1.3, densExp: 0.18,
    turb: 0.55, turbScale: 1.1, doppler: 1.0, orbit: 1.0, extinct: 0.85,
    camDist: 15, camTilt: 7, fov: 55, rotSpeed: 0.6,
    starDens: 0.7, starBright: 1.0, nebula: 0.5,
    bloom: 0.7, bloomThr: 0.8, ca: 1.1, exposure: 1.05, vignette: 0.5,
    dim: 0.0, cssOpacity: 0.9,
  }
  let qualityIdx = 1
  let qualityLocked = false
  let autoRotate = true
  let interactive = false
  let camAzim = -1.15
  let dragging = false
  let lastX = 0
  let lastY = 0
  let velAz = 0
  let velTilt = 0

  let W = 0
  let H = 0
  let rtScene: Target | null = null
  let accum: [Target | null, Target | null] = [null, null]
  let accumIdx = 0
  let bloom: Target[] = []
  let blendFull = 1

  function resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const cw = Math.max(2, Math.round(canvas.clientWidth * dpr))
    const ch = Math.max(2, Math.round(canvas.clientHeight * dpr))
    if (canvas.width !== cw) canvas.width = cw
    if (canvas.height !== ch) canvas.height = ch
    const q = qualityAt(qualityIdx)
    const w = Math.max(2, Math.round(cw * q.scale))
    const h = Math.max(2, Math.round(ch * q.scale))
    if (w === W && h === H && rtScene !== null) return
    W = w
    H = h
    delTarget(rtScene)
    delTarget(accum[0])
    delTarget(accum[1])
    for (const b of bloom) delTarget(b)
    rtScene = makeTarget(W, H)
    accum = [makeTarget(W, H), makeTarget(W, H)]
    bloom = []
    let bw = Math.max(2, W >> 1)
    let bh = Math.max(2, H >> 1)
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      bloom.push(makeTarget(bw, bh))
      bw = Math.max(2, bw >> 1)
      bh = Math.max(2, bh >> 1)
    }
    blendFull = 1
  }

  /* ---------------- pointer input (interactive mode) ---------------- */
  const onPointerDown = (e: PointerEvent): void => {
    if (!interactive) return
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
    canvas.setPointerCapture(e.pointerId)
  }
  const onPointerUp = (): void => { dragging = false }
  const onPointerMove = (e: PointerEvent): void => {
    if (!interactive || !dragging) return
    velAz = (e.clientX - lastX) * 0.005
    velTilt = (e.clientY - lastY) * 0.22
    camAzim += velAz
    params.camTilt = clamp(params.camTilt + velTilt, -85, 85)
    lastX = e.clientX
    lastY = e.clientY
    blendFull = 1
  }
  const onWheel = (e: WheelEvent): void => {
    if (!interactive) return
    e.preventDefault()
    params.camDist = clamp(params.camDist * (1 + Math.sign(e.deltaY) * 0.07), 4, 40)
    blendFull = 1
  }
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('wheel', onWheel, { passive: false })

  /* ---------------- render loop ---------------- */
  let raf = 0
  let running = false
  let disposed = false
  let lastT = 0
  let fpsAcc = 0
  let fpsN = 0
  let lowSince = 0

  function frame(tms: number): void {
    if (disposed || !running) return
    raf = requestAnimationFrame(frame)
    const t = tms * 0.001
    const dt = lastT === 0 ? 0.016 : Math.min(0.1, t - lastT)
    lastT = t
    resize()

    if (!dragging) {
      if (autoRotate) camAzim += params.rotSpeed * (Math.PI / 180) * dt
      if (Math.abs(velAz) > 1e-5) {
        camAzim += velAz * 0.6
        velAz *= 0.85
      }
    }
    const moving = (autoRotate && params.rotSpeed > 0.001) || Math.abs(velAz) > 1e-4
    const mixVal = blendFull >= 1 ? 1 : moving ? 0.45 : 0.14

    /* camera pose (static observer) */
    const tilt = params.camTilt * Math.PI / 180
    const dist = params.camDist
    const cx = Math.cos(camAzim) * Math.cos(tilt)
    const cy = Math.sin(camAzim) * Math.cos(tilt)
    const cz = Math.sin(tilt)
    const camPos = [dist * cx, dist * cy, dist * cz]
    const fwd = [-cx, -cy, -cz]
    const right = [Math.sin(camAzim), -Math.cos(camAzim), 0]
    const up = [
      fwd[1] * right[2] - fwd[2] * right[1],
      fwd[2] * right[0] - fwd[0] * right[2],
      fwd[0] * right[1] - fwd[1] * right[0],
    ]
    const fovTan = Math.tan(params.fov * Math.PI / 360)
    const q = qualityAt(qualityIdx)
    const jit = [Math.random() * 2 - 1, Math.random() * 2 - 1]

    /* scene */
    const u = progScene.uni
    gl.useProgram(progScene.p)
    const setF = (n: string, v: number): void => { const loc = u[n]; if (loc !== null) gl.uniform1f(loc, v) }
    const set2f = (n: string, v: readonly number[]): void => { const loc = u[n]; if (loc !== null) gl.uniform2f(loc, v[0], v[1]) }
    const set3f = (n: string, v: readonly number[]): void => { const loc = u[n]; if (loc !== null) gl.uniform3f(loc, v[0], v[1], v[2]) }
    set2f('uRes', [W, H])
    setF('uTime', t)
    set3f('uCamPos', camPos)
    set3f('uCamRight', right)
    set3f('uCamUp', up)
    set3f('uCamFwd', fwd)
    setF('uFovTan', fovTan)
    set2f('uJitter', jit)
    setF('uSpin', params.spin)
    setF('uCharge', params.charge)
    { const loc = u.uSteps; if (loc !== null) gl.uniform1i(loc, q.steps) }
    setF('uStepC', q.stepC)
    setF('uFar', Math.max(dist * 1.6, 42))
    setF('uDiskIn', params.diskIn)
    setF('uDiskOut', params.diskOut)
    setF('uDiskH', params.diskH)
    setF('uTemp', params.temp)
    setF('uTempExp', params.tempExp)
    setF('uBright', params.bright)
    setF('uBrightExp', params.brightExp)
    setF('uDens', params.dens)
    setF('uDensExp', params.densExp)
    setF('uTurb', params.turb)
    setF('uTurbScale', params.turbScale)
    setF('uDoppler', params.doppler)
    setF('uOrbit', params.orbit)
    setF('uExtinct', params.extinct)
    setF('uStarDens', params.starDens)
    setF('uStarBright', params.starBright)
    setF('uNebula', params.nebula)
    draw(rtScene)

    /* temporal blend */
    const src = accumIdx
    const dst = 1 - accumIdx
    const cur = accum[dst]
    const prev = accum[src]
    if (cur === null || prev === null || rtScene === null) return
    gl.useProgram(progBlend.p)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, prev.tex)
    { const loc = progBlend.uni.uPrev; if (loc !== null) gl.uniform1i(loc, 0) }
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, rtScene.tex)
    { const loc = progBlend.uni.uCur; if (loc !== null) gl.uniform1i(loc, 1) }
    { const loc = progBlend.uni.uMix; if (loc !== null) gl.uniform1f(loc, mixVal) }
    draw(cur)
    accumIdx = dst

    /* bloom pyramid */
    gl.useProgram(progBright.p)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, cur.tex)
    { const loc = progBright.uni.uSrc; if (loc !== null) gl.uniform1i(loc, 0) }
    { const loc = progBright.uni.uThr; if (loc !== null) gl.uniform1f(loc, params.bloomThr) }
    draw(bloom[0] ?? null)
    for (let i = 1; i < bloom.length; i++) {
      gl.useProgram(progDown.p)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, bloom[i - 1].tex)
      { const loc = progDown.uni.uSrc; if (loc !== null) gl.uniform1i(loc, 0) }
      { const loc = progDown.uni.uTexel; if (loc !== null) gl.uniform2f(loc, 1 / bloom[i - 1].w, 1 / bloom[i - 1].h) }
      draw(bloom[i])
    }
    for (let i = bloom.length - 2; i >= 0; i--) {
      gl.useProgram(progUp.p)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, bloom[i + 1].tex)
      { const loc = progUp.uni.uSrc; if (loc !== null) gl.uniform1i(loc, 0) }
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, bloom[i].tex)
      { const loc = progUp.uni.uPrev; if (loc !== null) gl.uniform1i(loc, 1) }
      { const loc = progUp.uni.uTexel; if (loc !== null) gl.uniform2f(loc, 1 / bloom[i + 1].w, 1 / bloom[i + 1].h) }
      draw(bloom[i])
    }

    /* composite */
    gl.useProgram(progComp.p)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, cur.tex)
    { const loc = progComp.uni.uScene; if (loc !== null) gl.uniform1i(loc, 0) }
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, bloom[0]?.tex ?? null)
    { const loc = progComp.uni.uBloom; if (loc !== null) gl.uniform1i(loc, 1) }
    { const loc = progComp.uni.uBloomStr; if (loc !== null) gl.uniform1f(loc, params.bloom) }
    { const loc = progComp.uni.uCA; if (loc !== null) gl.uniform1f(loc, params.ca) }
    { const loc = progComp.uni.uExposure; if (loc !== null) gl.uniform1f(loc, params.exposure) }
    { const loc = progComp.uni.uVignette; if (loc !== null) gl.uniform1f(loc, params.vignette) }
    { const loc = progComp.uni.uTime; if (loc !== null) gl.uniform1f(loc, t) }
    { const loc = progComp.uni.uRes; if (loc !== null) gl.uniform2f(loc, gl.drawingBufferWidth, gl.drawingBufferHeight) }
    draw(null)
    if (mixVal < 1) blendFull = 0

    /* stats + auto quality */
    fpsAcc += dt
    fpsN++
    if (fpsAcc > 0.5) {
      const fps = fpsN / fpsAcc
      cbs.onStats?.({ fps: fps.toFixed(0), res: W + '×' + H, steps: String(q.steps) })
      if (!qualityLocked && qualityIdx > 0) {
        if (fps < AUTO_DROP_FPS) {
          if (lowSince === 0) lowSince = performance.now()
          else if (performance.now() - lowSince > AUTO_DROP_WINDOW_MS) {
            qualityIdx -= 1
            W = 0
            lowSince = 0
            cbs.onQuality?.(qualityIdx)
          }
        } else lowSince = 0
      }
      fpsAcc = 0
      fpsN = 0
    }
  }

  function pause(): void {
    running = false
    if (raf !== 0) cancelAnimationFrame(raf)
    raf = 0
  }
  function resume(): void {
    if (disposed || running) return
    running = true
    lastT = 0
    raf = requestAnimationFrame(frame)
  }
  resize()
  resume()

  return {
    setParams(next) { Object.assign(params, next); blendFull = 1 },
    setQuality(i, locked) {
      qualityIdx = clamp(i, 0, QUALITIES.length - 1)
      qualityLocked = locked
      W = 0
    },
    setAutoRotate(on) { autoRotate = on },
    setInteractive(on) { interactive = on },
    capture() {
      canvas.toBlob((blob) => {
        if (blob === null) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'kerr-newman.png'
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 4000)
      })
    },
    pause,
    resume,
    dispose() {
      disposed = true
      pause()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('wheel', onWheel)
      delTarget(rtScene)
      delTarget(accum[0])
      delTarget(accum[1])
      for (const b of bloom) delTarget(b)
      gl.deleteProgram(progScene.p)
      gl.deleteProgram(progBlend.p)
      gl.deleteProgram(progBright.p)
      gl.deleteProgram(progDown.p)
      gl.deleteProgram(progUp.p)
      gl.deleteProgram(progComp.p)
    },
  }
}
