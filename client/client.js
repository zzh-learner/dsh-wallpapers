window.__ModuleLoader__.load({
	id: "dsh-wallpapers",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/shaders.ts
		/**
		* GLSL sources (WebGL2 / GLSL ES 3.00), ported verbatim from the standalone
		* GARGANTUA project: Schwarzschild geodesic ray tracing, bloom extraction,
		* separable Gaussian blur, and the wallpaper composite whose alpha is driven
		* by luminance (premultiplied output — empty space stays transparent, the
		* disk and stars stay solid) with `uDim` as an optional darkening veil.
		*
		* @module dsh-wallpapers/src/client/shaders
		*/
		/** Fullscreen big-triangle vertex shader. */
		const VERT_SRC = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUV;
void main(){
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
		/** Main scene: null-geodesic integration a = -1.5·rs·h²·r/|r|⁵, thin accretion disk, procedural sky. */
		const SCENE_FRAG = `#version 300 es
precision highp float;
precision highp int;

uniform vec2  uRes;
uniform float uTime;
uniform vec3  uCamPos;
uniform mat3  uCamMat;
uniform float uFovTan;
uniform int   uSteps;

uniform float uRs;
uniform float uDiskIn;
uniform float uDiskOut;
uniform float uTemp;
uniform float uBright;
uniform float uSpin;
uniform float uTurb;
uniform float uLens;
uniform float uDoppler;
uniform float uStarDens;
uniform float uStarBright;
uniform float uNebula;
uniform float uExposure;

out vec4 fragColor;

const int MAXSTEPS = 384;

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p){
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p){
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i),                   hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)),  hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float a = 0.5, s = 0.0;
  for(int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
float vnoise3(vec3 p){
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i),                      hash13(i + vec3(1.0, 0.0, 0.0)), u.x),
        mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x), u.y),
    mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x),
        mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x), u.y),
    u.z);
}
float fbm3(vec3 p){
  float a = 0.5, s = 0.0;
  for(int i = 0; i < 3; i++){ s += a * vnoise3(p); p = p * 2.07 + 19.19; a *= 0.5; }
  return s;
}
vec2 rot2(vec2 v, float a){
  float c = cos(a), s = sin(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

const mat3 SR1 = mat3( 0.76484, 0.0, -0.64422,   0.0, 1.0, 0.0,   0.64422, 0.0, 0.76484);
const mat3 SR2 = mat3( 1.0, 0.0, 0.0,   0.0, 0.62161, 0.78333,   0.0, -0.78333, 0.62161);
const mat3 SR3 = mat3( 0.69671, 0.71736, 0.0,  -0.71736, 0.69671, 0.0,   0.0, 0.0, 1.0);

vec3 starLayer(vec3 d, float S, mat3 R, float sizeK, float intens){
  if(uStarDens <= 0.001) return vec3(0.0);
  vec3 q = R * d * S;
  vec3 id = floor(q);
  if(hash13(id) > uStarDens * 0.6) return vec3(0.0);
  vec3 f = q - id;
  vec3 sp = vec3(0.25) + 0.5 * hash33(id + 7.1);
  vec3 dv = f - sp;
  float b = hash13(id + 3.3);
  float mag = 0.2 + 1.8 * b * b * b * b;
  float star = exp(-dot(dv, dv) * sizeK);
  float th = hash13(id + 9.7);
  vec3 tint = mix(vec3(1.0, 0.80, 0.60), vec3(1.0), clamp(th * 2.0, 0.0, 1.0));
  tint = mix(tint, vec3(0.70, 0.80, 1.0), clamp(th * 2.0 - 1.0, 0.0, 1.0));
  return tint * (star * mag * intens);
}

vec3 background(vec3 d){
  vec3 col = starLayer(d, 22.0, SR1,  40.0, 1.7)
           + starLayer(d, 48.0, SR2,  95.0, 1.0)
           + starLayer(d, 82.0, SR3, 150.0, 0.6);
  vec3 bn = normalize(vec3(0.32, 0.86, 0.40));
  float bd = dot(d, bn);
  float band = exp(-bd * bd * 12.0);
  float mw = fbm3(d * 4.0 + 7.0);
  col *= 0.5 + 1.6 * band * (0.35 + 0.75 * mw);
  float neb1 = fbm3(d * 2.3 + 3.7);
  float neb2 = fbm3(d * 5.1 - 1.9);
  vec3 nebCol = mix(vec3(0.10, 0.16, 0.40), vec3(0.45, 0.22, 0.12), fbm3(d * 1.7 + 11.0));
  col += nebCol * (neb1 * neb2 * band * 3.0 * uNebula);
  return col * uStarBright;
}

vec3 bbColor(float t){
  vec3 c = mix(vec3(0.45, 0.06, 0.005), vec3(1.00, 0.35, 0.06), smoothstep(0.00, 0.35, t));
  c = mix(c, vec3(1.00, 0.78, 0.45), smoothstep(0.35, 0.70, t));
  c = mix(c, vec3(1.00, 0.96, 0.88), smoothstep(0.70, 0.95, t));
  c = mix(c, vec3(0.82, 0.90, 1.00), smoothstep(0.95, 1.25, t));
  return c;
}

vec4 diskShade(vec3 hit, vec3 pdir){
  float r = length(hit.xz);
  float t01 = (r - uDiskIn) / max(uDiskOut - uDiskIn, 0.001);

  float period = 16.0;
  float tt = uTime * max(uSpin, 0.0);
  float t1 = mod(tt, period);
  float t2 = mod(tt + period * 0.5, period);
  float w = abs(t1 / period * 2.0 - 1.0);
  float omega = 1.4 * pow(max(r / uRs, 0.01), -1.5);
  float base = mix(fbm(rot2(hit.xz, omega * t1) * 0.9),
                   fbm(rot2(hit.xz, omega * t2) * 0.9), w);
  float ring = 0.55 + 0.45 * fbm(vec2(r * (2.1 / uRs) + base * 1.5, 2.7));
  float n = pow(max(base * ring, 0.0), mix(0.85, 2.2, uTurb)) * (1.0 + uTurb * 1.5);

  float temp = uTemp * pow(clamp(uDiskIn / r, 0.0, 1.0), 0.75);

  float rr = max(r, uRs * 1.0001);
  float beta = clamp(sqrt(0.5 * uRs / rr) / sqrt(max(1.0 - uRs / rr, 0.05)), 0.0, 0.85);
  vec3 bdir = normalize(vec3(hit.z, 0.0, -hit.x));
  float gam = inversesqrt(1.0 - beta * beta);
  float dopp = 1.0 / (gam * (1.0 - dot(bdir * beta, -pdir)));
  float grav = sqrt(max(1.0 - uRs / rr, 0.0));
  float g = mix(1.0, dopp * mix(1.0, grav, 0.75), uDoppler);
  float e = pow(clamp(g, 0.05, 4.0), 3.0);
  temp *= mix(1.0, clamp(g, 0.3, 2.2), 0.6);

  vec3 col = bbColor(clamp(temp * (0.5 + 0.9 * n), 0.0, 1.25));
  float lum = uBright * pow(max(temp, 0.0), 1.2) * (0.22 + 1.9 * n);
  float fade = smoothstep(0.0, 0.05, t01) * (1.0 - smoothstep(0.6, 1.0, t01));
  float alpha = clamp(fade * (0.4 + 1.4 * n), 0.0, 1.0);
  return vec4(col * (lum * fade * e), alpha);
}

vec3 aces(vec3 x){
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  uv.x *= uRes.x / uRes.y;
  vec3 rd = normalize(uCamMat * normalize(vec3(uv * uFovTan, 1.0)));

  vec3 p = uCamPos;
  vec3 v = rd;
  vec3 L = cross(p, v);
  float h2 = dot(L, L);
  float curv = 1.5 * uRs * uLens;

  float camDist = length(uCamPos);
  float Rfar = max(40.0, camDist * 1.4);
  float escapeB = max(uDiskOut * 1.05, uRs * 12.0);

  vec3 col = vec3(0.0);
  float tr = 1.0;
  bool captured = false;

  if(dot(p, rd) > 0.0 && length(cross(p, rd)) > escapeB){
    col = background(rd);
    fragColor = vec4(pow(aces(col * uExposure), vec3(1.0 / 2.2)), 1.0);
    return;
  }

  float Rfar2 = Rfar * Rfar;
  float rs2 = uRs * uRs;
  for(int i = 0; i < MAXSTEPS; i++){
    if(i >= uSteps) break;
    float r2 = dot(p, p);
    if(r2 > Rfar2) break;
    float r = sqrt(r2);
    float dt = clamp(0.06 * (r - 0.7 * uRs), 0.02, 1.0);
    v += (-curv * h2 / (r2 * r2 * r)) * p * dt;
    vec3 np = p + v * dt;
    if(dot(np, np) < rs2){ captured = true; break; }
    if(p.y * np.y < 0.0){
      vec3 hit = mix(p, np, p.y / (p.y - np.y));
      float hr = length(hit.xz);
      if(hr > uDiskIn && hr < uDiskOut){
        vec4 dc = diskShade(hit, normalize(v));
        col += tr * dc.rgb;
        tr *= 1.0 - dc.a;
        if(tr < 0.02) break;
      }
    }
    p = np;
  }
  if(!captured) col += tr * background(normalize(v));
  vec3 c = pow(aces(col * uExposure), vec3(1.0 / 2.2));
  fragColor = vec4(c, 1.0);
}`;
		/** Bloom pass 1: brightness extraction. */
		const BRIGHT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uTex;
in vec2 vUV;
out vec4 fragColor;
void main(){
  vec3 c = texture(uTex, vUV).rgb;
  float l = max(c.r, max(c.g, c.b));
  fragColor = vec4(c * smoothstep(0.5, 0.85, l), 1.0);
}`;
		/** Bloom pass 2: separable Gaussian. */
		const BLUR_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uDir;
in vec2 vUV;
out vec4 fragColor;
void main(){
  const float w0 = 0.227027, w1 = 0.1945946, w2 = 0.1216216, w3 = 0.054054, w4 = 0.016216;
  vec2 o = uDir;
  vec3 s = texture(uTex, vUV).rgb * w0
    + (texture(uTex, vUV + o      ).rgb + texture(uTex, vUV - o      ).rgb) * w1
    + (texture(uTex, vUV + o * 2.0).rgb + texture(uTex, vUV - o * 2.0).rgb) * w2
    + (texture(uTex, vUV + o * 3.0).rgb + texture(uTex, vUV - o * 3.0).rgb) * w3
    + (texture(uTex, vUV + o * 4.0).rgb + texture(uTex, vUV - o * 4.0).rgb) * w4;
  fragColor = vec4(s, 1.0);
}`;
		/** Wallpaper composite: luminance-driven premultiplied alpha plus the `uDim` veil. */
		const COMPOSITE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;
uniform float uDim;
uniform vec2 uRes;
in vec2 vUV;
out vec4 fragColor;
void main(){
  vec3 c = texture(uScene, vUV).rgb;
  c += texture(uBloom, vUV).rgb * uBloomStrength;
  vec2 q = vUV * 2.0 - 1.0;
  q.x *= uRes.x / uRes.y;
  c *= 1.0 - 0.24 * smoothstep(0.55, 1.7, length(q));
  float lum = max(c.r, max(c.g, c.b));
  float a = clamp(uDim + (1.0 - uDim) * smoothstep(0.02, 0.16, lum), 0.0, 1.0);
  fragColor = vec4(c * a, a);
}`;
		//#endregion
		//#region src/client/engine.ts
		/**
		* The WebGL2 render engine, ported from the standalone GARGANTUA project:
		* ray-traced main pass into an offscreen target, quarter-resolution bloom
		* (extract + two H/V Gaussian rounds), and the wallpaper composite onto the
		* visible canvas. The loop is pausable — the wallpaper registry hides the
		* layer by pausing it, which stops all GPU work.
		*
		* @module dsh-wallpapers/src/client/engine
		*/
		const QUALITIES = [
			{
				scale: .5,
				steps: 130
			},
			{
				scale: .75,
				steps: 220
			},
			{
				scale: 1,
				steps: 320
			}
		];
		const FALLBACK_QUALITY = {
			scale: .75,
			steps: 220
		};
		const FOV_TAN = Math.tan(31 * Math.PI / 180);
		/** Scene-pass uniform names (drives the LS mapped type). */
		const SCENE_UNIFORMS = [
			"uRes",
			"uTime",
			"uCamPos",
			"uCamMat",
			"uFovTan",
			"uSteps",
			"uRs",
			"uDiskIn",
			"uDiskOut",
			"uTemp",
			"uBright",
			"uSpin",
			"uTurb",
			"uLens",
			"uDoppler",
			"uStarDens",
			"uStarBright",
			"uNebula",
			"uExposure"
		];
		/** Composite-pass uniform names (drives the LC mapped type). */
		const COMPOSITE_UNIFORMS = [
			"uScene",
			"uBloom",
			"uBloomStrength",
			"uRes",
			"uDim"
		];
		const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
		/* v8 ignore next -- qualityIdx is only written via clamp(i, 0, 2), so the index always lands inside QUALITIES */
		const qualityAt = (i) => QUALITIES[i] ?? FALLBACK_QUALITY;
		/** Dead API handed back when WebGL2 is unavailable; every method is a no-op. */
		const deadEngine = (report, message) => ({
			setParams() {
				report(message);
			},
			setQuality() {
				report(message);
			},
			setAutoRotate() {
				report(message);
			},
			capture() {
				report(message);
			},
			pause() {},
			resume() {
				report(message);
			},
			dispose() {}
		});
		/**
		* Create the engine against one canvas.
		* @param canvasParam - the canvas to render into (WebGL2 context is taken here).
		* @param cbs - stats/quality/fatal callbacks.
		* @returns the engine API.
		*/
		function createEngine(canvasParam, cbs) {
			const P = {
				diskIn: 3,
				diskOut: 14,
				temp: .85,
				bright: 1,
				spin: 1,
				turb: .55,
				rs: 1,
				lens: 1,
				doppler: .7,
				starDens: .5,
				starBright: 1,
				nebula: .35,
				bloom: .7,
				exposure: 1.15,
				dim: 0
			};
			const report = (m) => {
				cbs.onFatal?.(m);
			};
			if (canvasParam === null) return deadEngine(report, "画布未就绪。");
			const canvas = canvasParam;
			const glRaw = canvas.getContext("webgl2", {
				antialias: false,
				depth: false,
				stencil: false,
				alpha: true,
				powerPreference: "high-performance"
			});
			if (glRaw === null) return deadEngine(report, "当前浏览器不支持 WebGL2，无法渲染黑洞壁纸。");
			const gl = glRaw;
			let qualityIdx = 1;
			let qualityLocked = false;
			let shotScale = 0;
			let shotPending = false;
			let autoRotate = true;
			let disposed = false;
			let running = false;
			let rafH = null;
			let last = 0;
			let ftEMA = 16;
			let frames = 0;
			const onLost = (e) => {
				e.preventDefault();
				running = false;
				stopLoop();
				report("显卡上下文丢失，壁纸已停止。");
			};
			canvas.addEventListener("webglcontextlost", onLost);
			function compile(type, src) {
				const sh = gl.createShader(type);
				if (sh === null) throw new Error("gl.createShader returned null");
				gl.shaderSource(sh, src);
				gl.compileShader(sh);
				if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
					const log = gl.getShaderInfoLog(sh) ?? "unknown shader error";
					report("着色器编译失败：" + log);
					throw new Error(log);
				}
				return sh;
			}
			function program(vsSrc, fsSrc) {
				const p = gl.createProgram();
				if (p === null) throw new Error("gl.createProgram returned null");
				gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
				gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
				gl.linkProgram(p);
				if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link failed");
				return p;
			}
			function locs(prog, names) {
				const o = {};
				for (const n of names) o[n] = gl.getUniformLocation(prog, n);
				return o;
			}
			let LS;
			let LB;
			let LBl;
			let LC;
			let progBright;
			let progBlur;
			let progComp;
			let progScene;
			let vao;
			try {
				progScene = program(VERT_SRC, SCENE_FRAG);
				progBright = program(VERT_SRC, BRIGHT_FRAG);
				progBlur = program(VERT_SRC, BLUR_FRAG);
				progComp = program(VERT_SRC, COMPOSITE_FRAG);
				LS = locs(progScene, SCENE_UNIFORMS);
				LB = locs(progBright, ["uTex"]);
				LBl = locs(progBlur, ["uTex", "uDir"]);
				LC = locs(progComp, COMPOSITE_UNIFORMS);
				vao = gl.createVertexArray();
				gl.bindVertexArray(vao);
				const vb = gl.createBuffer();
				gl.bindBuffer(gl.ARRAY_BUFFER, vb);
				gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
					-1,
					-1,
					3,
					-1,
					-1,
					3
				]), gl.STATIC_DRAW);
				gl.enableVertexAttribArray(0);
				gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
				gl.bindVertexArray(null);
			} catch {
				return deadEngine(report, "WebGL2 初始化失败。");
			}
			function makeTarget(w, h) {
				const tex = gl.createTexture();
				gl.bindTexture(gl.TEXTURE_2D, tex);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
				const fb = gl.createFramebuffer();
				gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
				gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
				gl.bindFramebuffer(gl.FRAMEBUFFER, null);
				return {
					tex,
					fb,
					w,
					h
				};
			}
			function delTarget(t) {
				if (t !== null) {
					gl.deleteTexture(t.tex);
					gl.deleteFramebuffer(t.fb);
				}
			}
			let sceneT = null;
			let bloomA = null;
			let bloomB = null;
			let RW = 2;
			let RH = 2;
			function resize() {
				const dpr = Math.min(window.devicePixelRatio || 1, 2);
				const s = shotScale > 0 ? shotScale : qualityAt(qualityIdx).scale;
				RW = Math.max(2, Math.round(canvas.clientWidth * dpr * s));
				RH = Math.max(2, Math.round(canvas.clientHeight * dpr * s));
				if (canvas.width !== RW || canvas.height !== RH) {
					canvas.width = RW;
					canvas.height = RH;
				}
				delTarget(sceneT);
				delTarget(bloomA);
				delTarget(bloomB);
				sceneT = makeTarget(RW, RH);
				const bw = Math.max(2, RW >> 2), bh = Math.max(2, RH >> 2);
				bloomA = makeTarget(bw, bh);
				bloomB = makeTarget(bw, bh);
			}
			const cam = {
				yaw: .6,
				pitch: .14,
				dist: 15,
				vyaw: 0,
				vpitch: 0
			};
			const camPos = /* @__PURE__ */ new Float32Array(3);
			const camMat = /* @__PURE__ */ new Float32Array(9);
			function updateCamera(dt) {
				if (autoRotate && pointers.size === 0) cam.yaw += dt * .06;
				if (pointers.size === 0) {
					cam.yaw += cam.vyaw * dt;
					cam.pitch += cam.vpitch * dt;
					const d = Math.exp(-3.2 * dt);
					cam.vyaw *= d;
					cam.vpitch *= d;
				}
				cam.pitch = clamp(cam.pitch, -1.45, 1.45);
				cam.dist = clamp(cam.dist, 2.2, 70);
				const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
				const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
				camPos[0] = cam.dist * cp * sy;
				camPos[1] = cam.dist * sp;
				camPos[2] = cam.dist * cp * cy;
				const fx = -camPos[0] / cam.dist, fy = -camPos[1] / cam.dist, fz = -camPos[2] / cam.dist;
				/* v8 ignore next -- pitch is clamped to ±1.45 (< π/2) and dist ≥ 2.2 before this line, so hypot(fz, fx) = cos(pitch)·dist is never 0 */
				const rl = Math.hypot(fz, fx) || 1e-6;
				const rx = -fz / rl, rz = fx / rl;
				const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
				camMat[0] = rx;
				camMat[1] = 0;
				camMat[2] = rz;
				camMat[3] = ux;
				camMat[4] = uy;
				camMat[5] = uz;
				camMat[6] = fx;
				camMat[7] = fy;
				camMat[8] = fz;
			}
			const pointers = /* @__PURE__ */ new Map();
			let pinchDist = 0;
			const onDown = (e) => {
				try {
					canvas.setPointerCapture(e.pointerId);
				} catch {}
				pointers.set(e.pointerId, {
					x: e.clientX,
					y: e.clientY
				});
				if (pointers.size === 2) {
					const a = [...pointers.values()];
					const p0 = a[0], p1 = a[1];
					/* v8 ignore next -- a two-entry Map spread always yields defined [0]/[1]; the guard only narrows the noUncheckedIndexedAccess type */
					if (p0 !== void 0 && p1 !== void 0) pinchDist = Math.hypot(p0.x - p1.x, p0.y - p1.y);
				}
				cam.vyaw = 0;
				cam.vpitch = 0;
			};
			const onMove = (e) => {
				const pt = pointers.get(e.pointerId);
				if (pt === void 0) return;
				const dx = e.clientX - pt.x, dy = e.clientY - pt.y;
				pt.x = e.clientX;
				pt.y = e.clientY;
				if (pointers.size === 1) {
					cam.yaw -= dx * .0042;
					cam.pitch += dy * .0042;
					cam.vyaw = cam.vyaw * .5 - dx * .0042 * 30;
					cam.vpitch = cam.vpitch * .5 + dy * .0042 * 30;
				} else if (pointers.size === 2) {
					const a = [...pointers.values()];
					const p0 = a[0], p1 = a[1];
					/* v8 ignore next -- a two-entry Map spread always yields defined [0]/[1]; the guard only narrows the noUncheckedIndexedAccess type */
					if (p0 !== void 0 && p1 !== void 0) {
						const d = Math.hypot(p0.x - p1.x, p0.y - p1.y);
						if (pinchDist > 0 && d > 0) cam.dist *= pinchDist / d;
						pinchDist = d;
					}
				}
			};
			const onUp = (e) => {
				pointers.delete(e.pointerId);
				pinchDist = 0;
			};
			const onWheel = (e) => {
				e.preventDefault();
				cam.dist *= Math.exp(e.deltaY * .0011);
			};
			canvas.addEventListener("pointerdown", onDown);
			canvas.addEventListener("pointermove", onMove);
			canvas.addEventListener("pointerup", onUp);
			canvas.addEventListener("pointercancel", onUp);
			canvas.addEventListener("wheel", onWheel, { passive: false });
			function blurPass(src, dst, dx, dy, mult) {
				gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
				gl.viewport(0, 0, dst.w, dst.h);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, src.tex);
				gl.uniform1i(LBl.uTex, 0);
				gl.uniform2f(LBl.uDir, dx * mult / dst.w, dy * mult / dst.h);
				gl.drawArrays(gl.TRIANGLES, 0, 3);
			}
			function renderAll(time) {
				if (sceneT === null || bloomA === null || bloomB === null) return;
				gl.bindVertexArray(vao);
				gl.useProgram(progScene);
				gl.bindFramebuffer(gl.FRAMEBUFFER, sceneT.fb);
				gl.viewport(0, 0, RW, RH);
				gl.uniform2f(LS.uRes, RW, RH);
				gl.uniform1f(LS.uTime, time);
				gl.uniform3fv(LS.uCamPos, camPos);
				gl.uniformMatrix3fv(LS.uCamMat, false, camMat);
				gl.uniform1f(LS.uFovTan, FOV_TAN);
				gl.uniform1i(LS.uSteps, qualityAt(qualityIdx).steps);
				gl.uniform1f(LS.uRs, P.rs);
				gl.uniform1f(LS.uDiskIn, P.diskIn * P.rs);
				gl.uniform1f(LS.uDiskOut, P.diskOut * P.rs);
				gl.uniform1f(LS.uTemp, P.temp);
				gl.uniform1f(LS.uBright, P.bright);
				gl.uniform1f(LS.uSpin, P.spin);
				gl.uniform1f(LS.uTurb, P.turb);
				gl.uniform1f(LS.uLens, P.lens);
				gl.uniform1f(LS.uDoppler, P.doppler);
				gl.uniform1f(LS.uStarDens, P.starDens);
				gl.uniform1f(LS.uStarBright, P.starBright);
				gl.uniform1f(LS.uNebula, P.nebula);
				gl.uniform1f(LS.uExposure, P.exposure);
				gl.drawArrays(gl.TRIANGLES, 0, 3);
				if (P.bloom > .01) {
					gl.useProgram(progBright);
					gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fb);
					gl.viewport(0, 0, bloomA.w, bloomA.h);
					gl.activeTexture(gl.TEXTURE0);
					gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
					gl.uniform1i(LB.uTex, 0);
					gl.drawArrays(gl.TRIANGLES, 0, 3);
					gl.useProgram(progBlur);
					blurPass(bloomA, bloomB, 1, 0, 1);
					blurPass(bloomB, bloomA, 0, 1, 1);
					blurPass(bloomA, bloomB, 1, 0, 2.3);
					blurPass(bloomB, bloomA, 0, 1, 2.3);
				} else {
					gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fb);
					gl.viewport(0, 0, bloomA.w, bloomA.h);
					gl.clearColor(0, 0, 0, 1);
					gl.clear(gl.COLOR_BUFFER_BIT);
				}
				gl.bindFramebuffer(gl.FRAMEBUFFER, null);
				gl.viewport(0, 0, canvas.width, canvas.height);
				gl.useProgram(progComp);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_2D, bloomA.tex);
				gl.uniform1i(LC.uScene, 0);
				gl.uniform1i(LC.uBloom, 1);
				gl.uniform1f(LC.uBloomStrength, P.bloom);
				gl.uniform1f(LC.uDim, P.dim);
				gl.uniform2f(LC.uRes, canvas.width, canvas.height);
				gl.drawArrays(gl.TRIANGLES, 0, 3);
			}
			function doCapture() {
				try {
					const a = document.createElement("a");
					a.download = "gargantua-" + (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19) + ".png";
					a.href = canvas.toDataURL("image/png");
					a.click();
				} catch (err) {
					report("截图失败：" + String(err));
				}
			}
			const nowMs = () => performance.now();
			function setQuality(i, locked) {
				qualityIdx = clamp(i, 0, 2);
				if (locked) qualityLocked = true;
				resize();
				cbs.onQuality?.(qualityIdx);
				if (!running) pump();
			}
			function step(t) {
				const now = t;
				const dt = Math.min((now - last) / 1e3, .1);
				last = now;
				if (shotPending) {
					shotScale = Math.min(1, qualityAt(qualityIdx).scale);
					resize();
				}
				updateCamera(dt);
				renderAll(now / 1e3);
				if (shotPending) {
					doCapture();
					shotPending = false;
					shotScale = 0;
					resize();
				}
				ftEMA += (dt * 1e3 - ftEMA) * .04;
				frames++;
				if (frames % 90 === 0) {
					const fps = 1e3 / ftEMA;
					cbs.onStats?.({
						fps: String(Math.round(fps)),
						res: `${RW}\u00d7${RH}`,
						steps: String(qualityAt(qualityIdx).steps)
					});
					if (!qualityLocked && qualityIdx > 0 && fps < 26) setQuality(qualityIdx - 1, false);
				}
				if (observer === null && frames % 30 === 0) layoutPoll();
			}
			function tick(t) {
				if (disposed) return;
				step(t);
				if (running) rafH = requestAnimationFrame(tick);
			}
			function startLoop() {
				last = nowMs();
				rafH = requestAnimationFrame(tick);
			}
			function stopLoop() {
				if (rafH !== null) cancelAnimationFrame(rafH);
				rafH = null;
			}
			function pump() {
				step(nowMs());
			}
			let observer = null;
			let lastCW = 0;
			let lastCH = 0;
			function layoutPoll() {
				const w = canvas.clientWidth, h = canvas.clientHeight;
				if (Math.abs(w - lastCW) > 2 || Math.abs(h - lastCH) > 2) {
					lastCW = w;
					lastCH = h;
					resize();
				}
			}
			observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
				lastCW = canvas.clientWidth;
				lastCH = canvas.clientHeight;
				resize();
			}) : null;
			observer?.observe(canvas);
			const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
			if (reduced) autoRotate = false;
			resize();
			if (reduced) pump();
			else {
				running = true;
				startLoop();
			}
			return {
				setParams(params) {
					Object.assign(P, params);
					if (!running) pump();
				},
				setQuality,
				setAutoRotate(on) {
					autoRotate = on;
				},
				capture() {
					shotPending = true;
					if (!running) pump();
				},
				pause() {
					if (disposed || !running) return;
					running = false;
					stopLoop();
				},
				resume() {
					if (disposed || running) return;
					if (reduced) {
						pump();
						return;
					}
					running = true;
					startLoop();
				},
				dispose() {
					if (disposed) return;
					disposed = true;
					running = false;
					stopLoop();
					canvas.removeEventListener("webglcontextlost", onLost);
					canvas.removeEventListener("pointerdown", onDown);
					canvas.removeEventListener("pointermove", onMove);
					canvas.removeEventListener("pointerup", onUp);
					canvas.removeEventListener("pointercancel", onUp);
					canvas.removeEventListener("wheel", onWheel);
					observer?.disconnect();
					observer = null;
					delTarget(sceneT);
					delTarget(bloomA);
					delTarget(bloomB);
					sceneT = bloomA = bloomB = null;
					gl.getExtension("WEBGL_lose_context")?.loseContext();
				}
			};
		}
		//#endregion
		//#region \0dsh-css:src/client/BlackholeWallpaper.module.css.mjs
		const css$3 = ".BlackholeWallpaper-module_host{z-index:-1;pointer-events:none;position:fixed;inset:0;overflow:hidden}.BlackholeWallpaper-module_canvas{touch-action:none;width:100%;height:100%;display:block;position:absolute;inset:0}.BlackholeWallpaper-module_host[data-interactive] .BlackholeWallpaper-module_canvas{pointer-events:auto;cursor:grab}.BlackholeWallpaper-module_host[data-interactive] .BlackholeWallpaper-module_canvas:active{cursor:grabbing}.BlackholeWallpaper-module_panel{z-index:2;pointer-events:auto;-webkit-backdrop-filter:blur(16px)saturate(1.25);color:#e8ecf4;text-align:left;box-sizing:border-box;background:#0a0d149e;border:1px solid #ffffff14;border-radius:14px;width:296px;padding:18px 16px 12px;font-family:Segoe UI,Microsoft YaHei,system-ui,-apple-system,sans-serif;transition:transform .35s cubic-bezier(.4,0,.2,1);position:fixed;top:14px;bottom:14px;right:14px;overflow:hidden auto}.BlackholeWallpaper-module_host[data-collapsed] .BlackholeWallpaper-module_panel{transform:translate(calc(100% + 22px))}.BlackholeWallpaper-module_panel::-webkit-scrollbar{width:6px}.BlackholeWallpaper-module_panel::-webkit-scrollbar-thumb{background:#ffffff24;border-radius:3px}.BlackholeWallpaper-module_toggle{color:#9aa3b5;cursor:pointer;background:#ffffff0f;border:1px solid #ffffff14;border-radius:8px;width:26px;height:26px;padding:0;font-size:14px;line-height:1;position:absolute;top:12px;right:12px}.BlackholeWallpaper-module_toggle:hover{color:#ff9a4d;border-color:#ff9a4dcc}.BlackholeWallpaper-module_open{z-index:2;pointer-events:auto;-webkit-backdrop-filter:blur(12px);color:#9aa3b5;cursor:pointer;background:#0a0d149e;border:1px solid #ffffff14;border-radius:10px;width:34px;height:34px;padding:0;font-size:15px;display:none;position:fixed;top:14px;right:14px}.BlackholeWallpaper-module_host[data-collapsed] .BlackholeWallpaper-module_open{display:block}.BlackholeWallpaper-module_open:hover{color:#ff9a4d;border-color:#ff9a4dcc}.BlackholeWallpaper-module_head h1{letter-spacing:.32em;color:#e8ecf4;margin:0;font-size:19px;font-weight:600}.BlackholeWallpaper-module_sub{color:#9aa3b5;letter-spacing:.14em;margin:4px 0 0;font-size:11px}.BlackholeWallpaper-module_stats{gap:6px;margin-top:14px;display:flex}.BlackholeWallpaper-module_stat{text-align:center;color:#9aa3b5;font-variant-numeric:tabular-nums;background:#ffffff0b;border:1px solid #ffffff14;border-radius:8px;flex:1;padding:7px 2px;font-size:10px}.BlackholeWallpaper-module_stat b{color:#e8ecf4;margin-bottom:2px;font-size:13px;display:block}.BlackholeWallpaper-module_presets{gap:6px;margin-top:12px;display:flex}.BlackholeWallpaper-module_presets button{color:#ff9a4d;cursor:pointer;background:#ff9a4d14;border:1px solid #ff9a4d59;border-radius:8px;flex:1;padding:7px 0;font-size:12px;transition:background .15s}.BlackholeWallpaper-module_presets button:hover{background:#ff9a4d33}.BlackholeWallpaper-module_sec{border-top:1px solid #ffffff14;margin-top:14px;padding-top:11px}.BlackholeWallpaper-module_sec h2{letter-spacing:.22em;color:#ff9a4dcc;margin:0 0 9px;font-size:11px;font-weight:600}.BlackholeWallpaper-module_row{margin-bottom:10px}.BlackholeWallpaper-module_labline{color:#9aa3b5;justify-content:space-between;align-items:baseline;margin-bottom:5px;font-size:12px;display:flex}.BlackholeWallpaper-module_labline em{opacity:.7;font-size:10px;font-style:normal}.BlackholeWallpaper-module_val{color:#ff9a4d;font-family:Consolas,monospace;font-size:12px}.BlackholeWallpaper-module_panel input[type=range]{-webkit-appearance:none;appearance:none;box-sizing:border-box;background:linear-gradient(90deg,#ff9a4d66,#ffffff24);border-radius:2px;outline:none;width:100%;height:4px;margin:0}.BlackholeWallpaper-module_panel input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;cursor:pointer;background:#ffb066;border-radius:50%;width:14px;height:14px;box-shadow:0 0 8px #ff9a4da6}.BlackholeWallpaper-module_panel input[type=range]::-moz-range-thumb{cursor:pointer;background:#ffb066;border:none;border-radius:50%;width:14px;height:14px;box-shadow:0 0 8px #ff9a4da6}.BlackholeWallpaper-module_panel select{color:#e8ecf4;box-sizing:border-box;background:#141926;border:1px solid #ffffff14;border-radius:8px;outline:none;width:100%;padding:6px 8px;font-size:12px}.BlackholeWallpaper-module_checkline{justify-content:space-between;align-items:center;display:flex}.BlackholeWallpaper-module_checkline label{color:#9aa3b5;cursor:pointer;align-items:center;gap:6px;font-size:12px;display:flex}.BlackholeWallpaper-module_checkline input[type=checkbox]{accent-color:#ff9a4d}.BlackholeWallpaper-module_mini{color:#e8ecf4;cursor:pointer;background:#ffffff0f;border:1px solid #ffffff14;border-radius:8px;padding:5px 12px;font-size:12px}.BlackholeWallpaper-module_mini:hover{color:#ff9a4d;border-color:#ff9a4dcc}.BlackholeWallpaper-module_foot{color:#9aa3b5;opacity:.8;border-top:1px solid #ffffff14;margin-top:12px;padding-top:10px;font-size:11px;line-height:1.7}.BlackholeWallpaper-module_fatal{color:#ffb0b0;white-space:pre-wrap;background:#78141440;border:1px solid #ff5a5a66;border-radius:8px;margin-top:12px;padding:10px;font-size:12px}@media (width<=640px){.BlackholeWallpaper-module_panel{width:min(300px,82vw)}}";
		const tagId$3 = "dsh-wallpapers/BlackholeWallpaper.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$3) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-wallpapers";
			tag.dataset.pluginCss = tagId$3;
			tag.textContent = css$3;
			document.head.appendChild(tag);
		}
		var BlackholeWallpaper_module_css_default = {
			"canvas": "BlackholeWallpaper-module_canvas",
			"checkline": "BlackholeWallpaper-module_checkline",
			"fatal": "BlackholeWallpaper-module_fatal",
			"foot": "BlackholeWallpaper-module_foot",
			"head": "BlackholeWallpaper-module_head",
			"host": "BlackholeWallpaper-module_host",
			"labline": "BlackholeWallpaper-module_labline",
			"mini": "BlackholeWallpaper-module_mini",
			"open": "BlackholeWallpaper-module_open",
			"panel": "BlackholeWallpaper-module_panel",
			"presets": "BlackholeWallpaper-module_presets",
			"row": "BlackholeWallpaper-module_row",
			"sec": "BlackholeWallpaper-module_sec",
			"stat": "BlackholeWallpaper-module_stat",
			"stats": "BlackholeWallpaper-module_stats",
			"sub": "BlackholeWallpaper-module_sub",
			"toggle": "BlackholeWallpaper-module_toggle",
			"val": "BlackholeWallpaper-module_val"
		};
		//#endregion
		//#region src/client/BlackholeWallpaper.tsx
		/**
		* The GARGANTUA wallpaper component: the full-screen WebGL2 canvas plus the
		* collapsible right-hand control panel (presets, accretion-disk / spacetime /
		* sky / render sliders, FPS stats, screenshot). Panel state is React state
		* persisted to localStorage; visibility is driven by the wallpaper registry
		* through a module-level bridge (the registry may hide the layer before the
		* component ever mounts).
		*
		* @module dsh-wallpapers/src/client/BlackholeWallpaper
		*/
		const DEFAULTS = {
			diskIn: 3,
			diskOut: 14,
			temp: .85,
			bright: 1,
			spin: 1,
			turb: .55,
			rs: 1,
			lens: 1,
			doppler: .7,
			starDens: .5,
			starBright: 1,
			nebula: .35,
			bloom: .7,
			exposure: 1.15,
			dim: 0,
			cssOpacity: .25
		};
		const PRESETS = {
			movie: {
				rs: 1,
				lens: 1,
				doppler: .55,
				temp: .85,
				bright: 1,
				spin: 1,
				turb: .5,
				bloom: .7,
				exposure: 1.15
			},
			real: {
				rs: 1,
				lens: 1,
				doppler: 1.5,
				temp: 1,
				bright: 1.1,
				spin: 1.2,
				turb: .6,
				bloom: .6,
				exposure: 1.1
			},
			hot: {
				rs: 1,
				lens: 1,
				doppler: 1.1,
				temp: 1.25,
				bright: 1.2,
				spin: 1.5,
				turb: .65,
				bloom: .9,
				exposure: 1
			}
		};
		const SECTIONS = [
			{
				title: "吸积盘",
				rows: [
					{
						label: "内径",
						unit: "Rs",
						key: "diskIn",
						min: 1.5,
						max: 10,
						step: .1,
						dec: 1
					},
					{
						label: "外径",
						unit: "Rs",
						key: "diskOut",
						min: 5,
						max: 30,
						step: .5,
						dec: 1
					},
					{
						label: "色温",
						unit: "",
						key: "temp",
						min: .3,
						max: 1.3,
						step: .01,
						dec: 2
					},
					{
						label: "亮度",
						unit: "",
						key: "bright",
						min: .2,
						max: 3,
						step: .05,
						dec: 2
					},
					{
						label: "旋转速度",
						unit: "",
						key: "spin",
						min: 0,
						max: 3,
						step: .05,
						dec: 2
					},
					{
						label: "湍流强度",
						unit: "",
						key: "turb",
						min: 0,
						max: 1,
						step: .05,
						dec: 2
					}
				]
			},
			{
				title: "时空与引力",
				rows: [
					{
						label: "黑洞尺度",
						unit: "Rs",
						key: "rs",
						min: .5,
						max: 2,
						step: .05,
						dec: 2
					},
					{
						label: "引力透镜强度",
						unit: "",
						key: "lens",
						min: 0,
						max: 1.5,
						step: .05,
						dec: 2
					},
					{
						label: "多普勒效应",
						unit: "",
						key: "doppler",
						min: 0,
						max: 2,
						step: .05,
						dec: 2
					}
				]
			},
			{
				title: "星空背景",
				rows: [
					{
						label: "星星密度",
						unit: "",
						key: "starDens",
						min: 0,
						max: 1,
						step: .05,
						dec: 2
					},
					{
						label: "星星亮度",
						unit: "",
						key: "starBright",
						min: 0,
						max: 2.5,
						step: .05,
						dec: 2
					},
					{
						label: "星云强度",
						unit: "",
						key: "nebula",
						min: 0,
						max: 1.5,
						step: .05,
						dec: 2
					}
				]
			}
		];
		const STORAGE_KEY$1 = "dsh.ui-blackhole.params.v1";
		function loadParams() {
			try {
				const raw = localStorage.getItem(STORAGE_KEY$1);
				if (raw === null) return DEFAULTS;
				const parsed = JSON.parse(raw);
				if (typeof parsed !== "object" || parsed === null) return DEFAULTS;
				return {
					...DEFAULTS,
					...parsed
				};
			} catch {
				return DEFAULTS;
			}
		}
		function saveParams(p) {
			try {
				localStorage.setItem(STORAGE_KEY$1, JSON.stringify(p));
			} catch {}
		}
		/** Registry → component visibility bridge; set on mount, read at registration time. */
		const visibility$1 = {
			apply: null,
			desired: true
		};
		/** One labeled range slider row. */
		function SliderRow(props) {
			const { row, p } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: BlackholeWallpaper_module_css_default.row,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: BlackholeWallpaper_module_css_default.labline,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [row.label, row.unit !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("em", { children: ["\xA0", row.unit] })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: BlackholeWallpaper_module_css_default.val,
						children: p[row.key].toFixed(row.dec)
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					type: "range",
					min: String(row.min),
					max: String(row.max),
					step: String(row.step),
					value: String(p[row.key]),
					onChange: (e) => {
						props.onChange(row.key, Number(e.target.value));
					}
				})]
			});
		}
		/** The GARGANTUA wallpaper entry. */
		function BlackholeWallpaper() {
			const canvasRef = (0, react.useRef)(null);
			const hostRef = (0, react.useRef)(null);
			const engineRef = (0, react.useRef)(null);
			const [p, setP] = (0, react.useState)(loadParams);
			const [stats, setStats] = (0, react.useState)({
				fps: "--",
				res: "--",
				steps: "--"
			});
			const [quality, setQualityState] = (0, react.useState)(1);
			const [autoRotate, setAutoRotate] = (0, react.useState)(true);
			const [interactive, setInteractive] = (0, react.useState)(false);
			const [collapsed, setCollapsed] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			(0, react.useEffect)(() => {
				const api = createEngine(canvasRef.current, {
					onStats: setStats,
					onQuality: (i) => {
						setQualityState(i);
					},
					onFatal: (m) => {
						setError(m);
					}
				});
				engineRef.current = api;
				visibility$1.apply = (on) => {
					if (hostRef.current !== null) hostRef.current.style.display = on ? "" : "none";
					if (engineRef.current !== null) {
						if (on) engineRef.current.resume();
						else engineRef.current.pause();
					}
				};
				visibility$1.apply(visibility$1.desired);
				return () => {
					visibility$1.apply = null;
					api.dispose();
					engineRef.current = null;
				};
			}, []);
			(0, react.useEffect)(() => {
				engineRef.current?.setParams(p);
				saveParams(p);
			}, [p]);
			(0, react.useEffect)(() => {
				engineRef.current?.setAutoRotate(autoRotate);
			}, [autoRotate]);
			const upd = (key, value) => {
				setP((prev) => ({
					...prev,
					[key]: value
				}));
			};
			const applyPreset = (id) => {
				const preset = PRESETS[id];
				/* v8 ignore next -- the three preset buttons pass fixed ids that all exist in PRESETS */
				if (preset !== void 0) setP((prev) => ({
					...prev,
					...preset
				}));
			};
			const slider = (row) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SliderRow, {
				row,
				p,
				onChange: upd
			}, row.key);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: hostRef,
				className: BlackholeWallpaper_module_css_default.host,
				"aria-hidden": "true",
				"data-collapsed": collapsed ? "" : void 0,
				"data-interactive": interactive ? "" : void 0,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("canvas", {
						ref: canvasRef,
						className: BlackholeWallpaper_module_css_default.canvas,
						style: { opacity: p.cssOpacity }
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: BlackholeWallpaper_module_css_default.open,
						title: "展开面板",
						onClick: () => {
							setCollapsed(false);
						},
						children: "⟨"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
						className: BlackholeWallpaper_module_css_default.panel,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: BlackholeWallpaper_module_css_default.toggle,
								title: "收起面板",
								onClick: () => {
									setCollapsed(true);
								},
								children: "⟩"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
								className: BlackholeWallpaper_module_css_default.head,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", { children: "GARGANTUA" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: BlackholeWallpaper_module_css_default.sub,
									children: "卡冈图雅 · 黑洞壁纸"
								})]
							}),
							error !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: BlackholeWallpaper_module_css_default.fatal,
								children: error
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: BlackholeWallpaper_module_css_default.stats,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: BlackholeWallpaper_module_css_default.stat,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: stats.fps }), "FPS"]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: BlackholeWallpaper_module_css_default.stat,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: stats.res }), "分辨率"]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: BlackholeWallpaper_module_css_default.stat,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: stats.steps }), "积分步"]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: BlackholeWallpaper_module_css_default.presets,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										onClick: () => {
											applyPreset("movie");
										},
										children: "电影模式"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										onClick: () => {
											applyPreset("real");
										},
										children: "物理真实"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										onClick: () => {
											applyPreset("hot");
										},
										children: "炽热蓝盘"
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: BlackholeWallpaper_module_css_default.sec,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: "壁纸" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SliderRow, {
										p,
										row: {
											label: "壁纸浓度",
											unit: "",
											key: "cssOpacity",
											min: 0,
											max: 1,
											step: .05,
											dec: 2
										},
										onChange: upd
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SliderRow, {
										p,
										row: {
											label: "背景暗化",
											unit: "",
											key: "dim",
											min: 0,
											max: .8,
											step: .05,
											dec: 2
										},
										onChange: upd
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: `${BlackholeWallpaper_module_css_default.row} ${BlackholeWallpaper_module_css_default.checkline}`,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: interactive,
											onChange: (e) => {
												setInteractive(e.target.checked);
											}
										}), "交互模式（拖拽旋转 · 滚轮缩放）"] })
									})
								]
							}),
							SECTIONS.map((s) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: BlackholeWallpaper_module_css_default.sec,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: s.title }), s.rows.map(slider)]
							}, s.title)),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: BlackholeWallpaper_module_css_default.sec,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: "渲染" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: BlackholeWallpaper_module_css_default.row,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: BlackholeWallpaper_module_css_default.labline,
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "画质" })
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
											value: String(quality),
											onChange: (e) => {
												const i = Number(e.target.value);
												setQualityState(i);
												engineRef.current?.setQuality(i, true);
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "0",
													children: "低（性能优先）"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "1",
													children: "中（推荐）"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "2",
													children: "高（效果优先）"
												})
											]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SliderRow, {
										p,
										row: {
											label: "泛光强度",
											unit: "",
											key: "bloom",
											min: 0,
											max: 2,
											step: .05,
											dec: 2
										},
										onChange: upd
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SliderRow, {
										p,
										row: {
											label: "曝光",
											unit: "",
											key: "exposure",
											min: .3,
											max: 2.5,
											step: .05,
											dec: 2
										},
										onChange: upd
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: `${BlackholeWallpaper_module_css_default.row} ${BlackholeWallpaper_module_css_default.checkline}`,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: autoRotate,
											onChange: (e) => {
												setAutoRotate(e.target.checked);
											}
										}), "自动旋转"] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: BlackholeWallpaper_module_css_default.mini,
											onClick: () => {
												engineRef.current?.capture();
											},
											children: "保存截图"
										})]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
								className: BlackholeWallpaper_module_css_default.foot,
								children: [
									"开启交互模式后：拖拽旋转 · 滚轮/双指缩放",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
									"关闭交互模式即恢复界面正常操作；透镜强度拉到 0 可对比平直时空"
								]
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/orbs/engine.ts
		/** Source time multipliers per mode (the 64px tuning table). */
		const ORB_SPEEDS = {
			orbits: 1.885,
			globe: 2.015,
			wave: 4.388,
			web: 3.315,
			braid: 1.625,
			ribbon: 2.34,
			ring: 3.24,
			rubik: 1.82,
			morph: 2.405
		};
		/** Idle rotation order: morph fronts the sequence, then the curated tour. */
		const ORB_ROTATION = [
			"morph",
			"orbits",
			"globe",
			"rubik",
			"ribbon",
			"wave",
			"web",
			"braid",
			"ring"
		];
		/** The hand-tuned knobs per mode (source: thinking-orbs 64px table). */
		const ORB_OPTIONS = {
			orbits: {
				orbitN: 12,
				ghostN: 40,
				ghostR: .9,
				ghostA: .5,
				particles: 3,
				partR: 1.2,
				partRDepth: 1.6,
				rsPow: .6,
				rMin: .3
			},
			globe: {
				latRings: 17,
				lonDensity: 44,
				rBase: .6,
				rDepth: 1.7,
				rBoost: 1,
				inkFar: .62,
				inkSpan: .54,
				rsPow: .6,
				rMin: .3,
				scanMul: 4.08,
				dimBase: .45
			},
			wave: {
				rings: 15,
				lonDensity: 40,
				rBase: .6,
				rDepth: 1.7,
				rsPow: .6,
				rMin: .3
			},
			web: {
				nodeN: 30,
				thr: .72,
				signals: 5,
				nodeR: 1.4,
				nodeRDepth: 1.8,
				lineW: .8,
				rsPow: .6,
				rMin: .3
			},
			braid: {
				strandN: 52,
				turns: 3,
				ghostN: 150,
				rBase: 1.2,
				rDepth: 1.8,
				rsPow: .6,
				rMin: .3
			},
			ribbon: {
				lanes: 3,
				segs: 44,
				ghostN: 38,
				rBase: .94,
				rDepth: 1.45,
				rsPow: .6,
				rMin: .3,
				spin: 0,
				bandMul: 3.9,
				wobMul: 1
			},
			ring: {
				lanes: 3,
				segs: 44,
				ghostN: 0,
				rBase: 1.05,
				rDepth: 1.63,
				rsPow: .6,
				rMin: .3,
				spin: 0,
				bandMul: 3.627,
				wobMul: .368,
				faceOn: 1
			},
			rubik: {
				latRings: 15,
				lonDensity: 40,
				moveCount: 14,
				rBase: .6,
				rDepth: 1.7,
				rActive: .3,
				inkFar: .62,
				inkSpan: .54,
				rsPow: .6,
				rMin: .3
			},
			morph: {
				rDot: .0083,
				rMin: .25,
				spread: 1.45
			}
		};
		/** Seeded rng (source constant pair). */
		function ze(a, b) {
			const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
			return n - Math.floor(n);
		}
		/**
		* Element read for indices the loops keep in range by construction (modular
		* arithmetic, walked segments); asserting beats re-checking every hot-loop
		* access the caller cannot make out-of-range. Exported for the component's
		* rotation walk, which shares the same modular-index guarantee.
		* @param xs - source array.
		* @param i - in-range index.
		* @returns the element.
		*/
		function pick$1(xs, i) {
			return xs[i];
		}
		/** Fractional part. */
		function frac(x) {
			return x - Math.floor(x);
		}
		/** Fibonacci-sphere point i of n. */
		function wu(i, n) {
			const g = Math.PI * (3 - Math.sqrt(5));
			const r = 1 - 2 * (i + .5) / n;
			const l = Math.sqrt(1 - r * r);
			const o = i * g;
			return [
				l * Math.cos(o),
				r,
				l * Math.sin(o)
			];
		}
		/** Radius scale: dot radii grow superlinearly with the orb's canvas size. */
		function vt(size, p) {
			return (size / 300) ** p;
		}
		/** Signed angular difference. */
		function angDiff(a, b) {
			return Math.atan2(Math.sin(a - b), Math.cos(a - b));
		}
		/**
		* Orthographic camera: yaw `e` and tilt `t`, center (n, r), depth scale `l`.
		* @returns projector from 3D unit-ish space to [x, y, z].
		*/
		function cam(e, t, n, r, l) {
			const o = Math.sin(t);
			const u = Math.cos(t);
			const i = Math.sin(e);
			const s = Math.cos(e);
			return (f, v, h) => {
				const p = f * s + h * i;
				const y = -f * i + h * s;
				const g = v * u - y * o;
				const w = v * o + y * u;
				return [
					n + p * l,
					r - g * l,
					w
				];
			};
		}
		/** Depth-normalized 0..1 from a projected z against its sphere radius. */
		function depthOf(z, radius) {
			return (z / radius + 1) / 2;
		}
		/** Filter sub-visible dots and depth-sort (painter's order). */
		function finish(dots, lines, rMin) {
			const out = dots.filter((d) => (d.a ?? 1) >= .02);
			for (const d of out) d.r = Math.max(rMin, d.r);
			out.sort((a, b) => a.z - b.z);
			return {
				dots: out,
				lines: lines.filter((l) => l.a >= .02)
			};
		}
		function genOrbits(size, t, n) {
			const half = size / 2;
			const reach = half * .82;
			const project = cam(t * .12, .3, half, half, 1);
			const scale = vt(size, n.rsPow);
			const dots = [];
			const orbitN = n.orbitN;
			const ghostN = n.ghostN;
			const particles = n.particles;
			for (let p = 0; p < orbitN; p++) {
				const y = ze(p, 1.7);
				const g = ze(p, 5.2);
				const w = ze(p, 8.9);
				const radius = reach * (.45 + .52 * y);
				const yaw0 = y * 2 * Math.PI;
				const polar = Math.acos(2 * g - 1);
				const dx = Math.sin(polar) * Math.cos(yaw0);
				const my = Math.cos(polar);
				const dz = Math.sin(polar) * Math.sin(yaw0);
				let sx = -my;
				let ax = dx;
				const len = Math.max(1e-6, Math.hypot(sx, ax));
				sx /= len;
				ax /= len;
				const ez = 0;
				const bu = my * ez - dz * ax;
				const bv = dz * sx - dx * ez;
				const bw = dx * ax - my * sx;
				const speed = (.25 + .55 * w) * (w > .5 ? 1 : -1);
				for (let i = 0; i < ghostN; i++) {
					const a = i / ghostN * 2 * Math.PI;
					const [x, y2, z] = project((sx * Math.cos(a) + bu * Math.sin(a)) * radius, (ax * Math.cos(a) + bv * Math.sin(a)) * radius, (ez * Math.cos(a) + bw * Math.sin(a)) * radius);
					const d = depthOf(z, radius);
					dots.push({
						x,
						y: y2,
						z,
						r: n.ghostR * scale,
						white: .72,
						a: n.ghostA * (.4 + .6 * d)
					});
				}
				for (let i = 0; i < particles; i++) {
					const a = t * speed + i / particles * 2 * Math.PI + g * 6;
					const [x, y2, z] = project((sx * Math.cos(a) + bu * Math.sin(a)) * radius, (ax * Math.cos(a) + bv * Math.sin(a)) * radius, (ez * Math.cos(a) + bw * Math.sin(a)) * radius);
					const d = depthOf(z, radius);
					dots.push({
						x,
						y: y2,
						z,
						r: (n.partR + n.partRDepth * d) * scale,
						white: .3 - .22 * d
					});
				}
			}
			return finish(dots, [], n.rMin);
		}
		function genGlobe(size, t, n) {
			const half = size / 2;
			const reach = half * .82;
			const project = cam(t * .5, .4 + .06 * Math.sin(t * .35), half, half, reach);
			const scan = t * (.5 + 1.2 * n.scanMul);
			const scale = vt(size, n.rsPow);
			const dimBase = n.dimBase;
			const dots = [];
			const latRings = n.latRings;
			const lonDensity = n.lonDensity;
			for (let w = 0; w <= latRings; w++) {
				const lat = -Math.PI / 2 + w / latRings * Math.PI;
				const ringR = Math.cos(lat);
				const y = Math.sin(lat);
				const per = Math.max(1, Math.round(Math.abs(ringR) * lonDensity));
				for (let i = 0; i < per; i++) {
					const lon = i / per * 2 * Math.PI;
					const [x, y2, z] = project(ringR * Math.cos(lon), y, ringR * Math.sin(lon));
					const d = depthOf(z, 1);
					const off = angDiff(lon + t * .5, scan);
					const boost = Math.exp(-(off * off) / .18) * Math.max(0, z);
					dots.push({
						x,
						y: y2,
						z,
						r: (n.rBase + n.rDepth * d + n.rBoost * boost) * scale,
						white: n.inkFar - n.inkSpan * d,
						a: dimBase + (1 - dimBase) * Math.min(1, boost)
					});
				}
			}
			return finish(dots, [], n.rMin);
		}
		function genWave(size, t, n) {
			const half = size / 2;
			const reach = half * .874;
			const project = cam(t * .18, .38, half, half, 1);
			const scale = vt(size, n.rsPow);
			const dots = [];
			const rings = n.rings;
			const lonDensity = n.lonDensity;
			for (let h = 0; h <= rings; h++) {
				const lat = -Math.PI / 2 + h / rings * Math.PI;
				const ringR = Math.cos(lat);
				const y = Math.sin(lat);
				const breathe = .62 * Math.sin(t * 2.1 - h * .52) + .38 * Math.sin(t * 1.27 + h * .83);
				const radius = reach * (.88 + .105 * breathe);
				const per = Math.max(1, Math.round(Math.abs(ringR) * lonDensity));
				for (let i = 0; i < per; i++) {
					const lon = i / per * 2 * Math.PI;
					const [x, y2, z] = project(ringR * Math.cos(lon) * radius, y * radius, ringR * Math.sin(lon) * radius);
					const d = depthOf(z, reach);
					const lift = Math.max(0, breathe);
					dots.push({
						x,
						y: y2,
						z,
						r: (n.rBase + n.rDepth * d) * (1 + .4 * lift) * scale,
						white: .66 - .56 * d - .1 * lift
					});
				}
			}
			return finish(dots, [], n.rMin);
		}
		/** Bilinear value noise the web nodes drift on. */
		function noise2(e, t) {
			const n = Math.floor(e);
			const r = Math.floor(t);
			let l = e - n;
			let o = t - r;
			l = l * l * (3 - 2 * l);
			o = o * o * (3 - 2 * o);
			const u = ze(n, r);
			const i = ze(n + 1, r);
			const s = ze(n, r + 1);
			const f = ze(n + 1, r + 1);
			return u + (i - u) * l + (s - u) * o + (u - i - s + f) * l * o;
		}
		function genWeb(size, t, n) {
			const half = size / 2;
			const reach = half * .8;
			const project = cam(t * .12, .32, half, half, reach);
			const scale = vt(size, n.rsPow);
			const nodeN = n.nodeN;
			const threshold = n.thr;
			const dots = [];
			const lines = [];
			const pts = [];
			for (let i = 0; i < nodeN; i++) {
				const base = wu(i, nodeN);
				const x = base[0] + .3 * (noise2(i * .31 + 9, t * .24) - .5) * 2;
				const y = base[1] + .3 * (noise2(i * .53 + 27, t * .21) - .5) * 2;
				const z = base[2] + .3 * (noise2(i * .77 + 55, t * .27) - .5) * 2;
				const len = Math.hypot(x, y, z);
				pts.push([
					x / len,
					y / len,
					z / len
				]);
			}
			for (let i = 0; i < nodeN; i++) {
				const pi = pick$1(pts, i);
				for (let j = i + 1; j < nodeN; j++) {
					const pj = pick$1(pts, j);
					const dist = Math.hypot(pi[0] - pj[0], pi[1] - pj[1], pi[2] - pj[2]);
					if (dist >= threshold) continue;
					const p1 = project(pi[0], pi[1], pi[2]);
					const p2 = project(pj[0], pj[1], pj[2]);
					const d = ((p1[2] + p2[2]) / 2 + 1) / 2;
					lines.push({
						x1: p1[0],
						y1: p1[1],
						x2: p2[0],
						y2: p2[1],
						white: .42,
						a: (1 - dist / threshold) * (.3 + .55 * d),
						w: Math.max(.6, n.lineW * scale)
					});
				}
			}
			for (let i = 0; i < nodeN; i++) {
				const pt = pick$1(pts, i);
				const p = project(pt[0], pt[1], pt[2]);
				const d = depthOf(p[2], 1);
				const pulse = 1 + .25 * Math.sin(t * 1.4 + i * 2.7);
				dots.push({
					x: p[0],
					y: p[1],
					z: p[2],
					r: (n.nodeR + n.nodeRDepth * d) * pulse * scale,
					white: .55 - .45 * d
				});
			}
			const signals = n.signals;
			for (let i = 0; i < signals; i++) {
				const seed = Math.floor(t * .55 + i * 7.31);
				const from = Math.floor(ze(seed, i * 3.1 + 1.7) * nodeN);
				const to = Math.floor(ze(seed, i * 5.7 + 4.2) * nodeN);
				if (from === to) continue;
				const prog = frac(t * .55 + i * 7.31);
				const src = pick$1(pts, from);
				const dst = pick$1(pts, to);
				const mx = src[0] + (dst[0] - src[0]) * prog;
				const my = src[1] + (dst[1] - src[1]) * prog;
				const mz = src[2] + (dst[2] - src[2]) * prog;
				const len = Math.max(1e-6, Math.hypot(mx, my, mz));
				const p = project(mx / len, my / len, mz / len);
				const d = depthOf(p[2], 1);
				dots.push({
					x: p[0],
					y: p[1],
					z: p[2],
					r: (n.nodeR * 1.5 + n.nodeRDepth * d) * scale,
					white: .05,
					a: .5 + .5 * d
				});
			}
			return finish(dots, lines, n.rMin);
		}
		function genBraid(size, t, n) {
			const half = size / 2;
			const reach = half * .76;
			const project = cam(t * .4, .3, half, half, 1);
			const scale = vt(size, n.rsPow);
			const dots = [];
			const ghostN = n.ghostN;
			for (let i = 0; i < ghostN; i++) {
				const g = wu(i, ghostN);
				const p = project(g[0] * reach, g[1] * reach, g[2] * reach);
				const d = depthOf(p[2], reach);
				dots.push({
					x: p[0],
					y: p[1],
					z: p[2],
					r: .8 * scale,
					white: .78,
					a: .1 + .22 * d
				});
			}
			const strandN = n.strandN;
			const turns = n.turns;
			for (let strand = 0; strand < 3; strand++) {
				const offset = strand / 3 * 2 * Math.PI;
				for (let i = 0; i < strandN; i++) {
					const w = (frac(i / strandN + t * .045) * 2 - 1) * .96;
					const ringR = Math.sqrt(Math.max(0, 1 - w * w));
					const a = w * Math.PI * turns + offset;
					const bulge = 1 + .075 * Math.sin(w * Math.PI * turns * 2 + offset * 2 + t * .8);
					const radius = ringR * reach * bulge;
					const p = project(Math.cos(a) * radius, w * reach * bulge, Math.sin(a) * radius);
					const d = depthOf(p[2], reach);
					dots.push({
						x: p[0],
						y: p[1],
						z: p[2],
						r: (n.rBase + n.rDepth * d) * scale,
						white: .62 - .5 * d,
						a: .8
					});
				}
			}
			return finish(dots, [], n.rMin);
		}
		function genRibbonRing(size, t, n) {
			const half = size / 2;
			const reach = half * .78;
			const faceOn = n.faceOn === 1;
			const spin = n.spin;
			const project = cam(t * .1 * spin, .3, half, half, 1);
			const scale = vt(size, n.rsPow);
			const dots = [];
			const ghostN = n.ghostN;
			for (let i = 0; i < ghostN; i++) {
				const g = wu(i, ghostN);
				const p = project(g[0] * reach, g[1] * reach, g[2] * reach);
				const d = depthOf(p[2], reach);
				dots.push({
					x: p[0],
					y: p[1],
					z: p[2],
					r: .8 * scale,
					white: .78,
					a: .1 + .22 * d
				});
			}
			const p = t * .24 * spin;
			const yy = faceOn ? -.3 : .55 + .3 * Math.sin(t * .18) * spin;
			const g0 = Math.cos(p);
			const s0 = Math.sin(p);
			const cx = -s0 * Math.sin(yy);
			const ay = Math.cos(yy);
			const dz = g0 * Math.sin(yy);
			const mx = -s0 * ay;
			const ky = s0 * cx - g0 * dz;
			const sz = g0 * ay;
			const wobble = .23 * n.wobMul;
			const bandReach = faceOn ? reach / (1 + .85 * wobble) : reach;
			const lanes = n.lanes;
			const segs = n.segs;
			const bands = Math.max(1, Math.round(lanes * n.bandMul));
			for (let i = 0; i < bands; i++) {
				const lane = (i - (bands - 1) / 2) * .075;
				const edge = Math.abs(i - (bands - 1) / 2) / Math.max(1, (bands - 1) / 2);
				for (let j = 0; j < segs; j++) {
					const a = j / segs * 2 * Math.PI;
					const wob = (.16 * Math.sin(a * 3 - t * 1.7 + i * .22) + .07 * Math.sin(a * 5 + t * 1.1)) * n.wobMul;
					const mul = faceOn ? 1 + wob : 1;
					const laneOff = faceOn ? lane : lane + wob;
					const tx = g0 * Math.cos(a) + cx * Math.sin(a) + mx * laneOff;
					const ty = ay * Math.sin(a) + ky * laneOff;
					const tz = s0 * Math.cos(a) + dz * Math.sin(a) + sz * laneOff;
					const len = Math.hypot(tx, ty, tz);
					const radius = bandReach * mul;
					const proj = project(tx / len * radius, ty / len * radius, tz / len * radius);
					const d = depthOf(proj[2], reach);
					dots.push({
						x: proj[0],
						y: proj[1],
						z: proj[2],
						r: (n.rBase + n.rDepth * d) * (1 - .25 * edge) * scale,
						white: .52 - .44 * d + .18 * edge,
						a: .4 + .6 * d
					});
				}
			}
			return finish(dots, [], n.rMin);
		}
		const rubikMovesCache = /* @__PURE__ */ new Map();
		/** Seeded move schedule (source generator). */
		function rubikMoves(count) {
			const cached = rubikMovesCache.get(count);
			if (cached !== void 0) return cached;
			const moves = [];
			for (let i = 0; i < count; i++) {
				const axis = Math.min(2, Math.floor(ze(i, 2.3) * 3));
				const lo = -1 + .5 * Math.min(3, Math.floor(ze(i, 5.9) * 4));
				const sign = ze(i, 7.7) < .5 ? 1 : -1;
				moves.push({
					axis,
					lo,
					hi: lo + .5,
					ang: sign * Math.PI / 2
				});
			}
			rubikMovesCache.set(count, moves);
			return moves;
		}
		/** Eased twist amounts for each move at time t: how far each band has turned. */
		function rubikTwist(t, count, phase, gap) {
			const pos = t % (2 * count * phase + gap);
			const amounts = new Array(count).fill(0);
			let active = -1;
			if (pos < 2 * count * phase) {
				const slot = Math.floor(pos / phase);
				const frac2 = (pos - slot * phase) / phase;
				const eased = 1 - (1 - Math.min(1, frac2 / .7)) ** 3;
				if (slot < count) {
					for (let i = 0; i < slot; i++) amounts[i] = 1;
					amounts[slot] = eased;
					active = slot;
				} else {
					const back = 2 * count - 1 - slot;
					for (let i = 0; i < back; i++) amounts[i] = 1;
					amounts[back] = 1 - eased;
					active = back;
				}
			}
			return {
				amounts,
				active
			};
		}
		/** Apply every band twist whose coordinate band contains the point. */
		function rubikRotate(point, moves, twist) {
			let [x, y, z] = point;
			let onActive = false;
			for (let i = 0; i < moves.length; i++) {
				const amount = pick$1(twist.amounts, i);
				if (amount <= 0) continue;
				const move = pick$1(moves, i);
				const coord = move.axis === 0 ? x : move.axis === 1 ? y : z;
				if (coord < move.lo || coord >= move.hi) continue;
				if (i === twist.active) onActive = true;
				const angle = move.ang * amount;
				const cos = Math.cos(angle);
				const sin = Math.sin(angle);
				if (move.axis === 0) {
					const ny = y * cos - z * sin;
					z = y * sin + z * cos;
					y = ny;
				} else if (move.axis === 1) {
					const nx = x * cos + z * sin;
					z = -x * sin + z * cos;
					x = nx;
				} else {
					const nx = x * cos - y * sin;
					y = x * sin + y * cos;
					x = nx;
				}
			}
			return [
				x,
				y,
				z,
				onActive
			];
		}
		function genRubik(size, t, n) {
			const half = size / 2;
			const reach = half * .82;
			const project = cam(t * .55, .35 + .1 * Math.sin(t * .9), half, half, reach);
			const scale = vt(size, n.rsPow);
			const moves = rubikMoves(n.moveCount);
			const twist = rubikTwist(t, n.moveCount, .42, 1.2);
			const dots = [];
			const latRings = n.latRings;
			const lonDensity = n.lonDensity;
			for (let g = 0; g <= latRings; g++) {
				const lat = -Math.PI / 2 + g / latRings * Math.PI;
				const ringR = Math.cos(lat);
				const y = Math.sin(lat);
				const per = Math.max(1, Math.round(Math.abs(ringR) * lonDensity));
				for (let i = 0; i < per; i++) {
					const lon = i / per * 2 * Math.PI;
					const [rx, ry, rz, onActive] = rubikRotate([
						ringR * Math.cos(lon),
						y,
						ringR * Math.sin(lon)
					], moves, twist);
					const p = project(rx, ry, rz);
					const d = depthOf(p[2], 1);
					dots.push({
						x: p[0],
						y: p[1],
						z: p[2],
						r: (n.rBase + n.rDepth * d + (onActive ? n.rActive : 0)) * scale,
						white: n.inkFar - n.inkSpan * d - (onActive ? .14 : 0)
					});
				}
			}
			return finish(dots, [], n.rMin);
		}
		/** Smoothstep. */
		function smooth(x) {
			return x * x * (3 - 2 * x);
		}
		/** Arc-length sampler over a closed polyline. */
		function arcSampler(points) {
			const count = points.length;
			const lengths = [];
			let total = 0;
			for (let i = 0; i < count; i++) {
				const a = pick$1(points, i);
				const b = pick$1(points, (i + 1) % count);
				const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
				lengths.push(len);
				total += len;
			}
			return (at) => {
				let remain = at * total;
				let seg = 0;
				while (remain > pick$1(lengths, seg) && seg < count - 1) {
					remain -= pick$1(lengths, seg);
					seg++;
				}
				const a = pick$1(points, seg);
				const b = pick$1(points, (seg + 1) % count);
				const frac2 = Math.min(1, remain / pick$1(lengths, seg));
				return [a[0] + (b[0] - a[0]) * frac2, a[1] + (b[1] - a[1]) * frac2];
			};
		}
		/** The morph shapes: circle, triangle, square (source constants). */
		const SHAPES = [
			(e) => {
				const a = -Math.PI / 2 + e * 2 * Math.PI;
				return [Math.cos(a) * .24, Math.sin(a) * .24];
			},
			arcSampler([
				[0, -.26],
				[.24, .16],
				[-.24, .16]
			]),
			arcSampler([
				[0, -.2],
				[.2, -.2],
				[.2, .2],
				[-.2, .2],
				[-.2, -.2]
			])
		];
		/** Morph cycle: hold then blend (source constants). */
		const MORPH_HOLD = 1.4;
		const MORPH_BLEND = .9;
		const MORPH_CYCLE = 2.3;
		function genMorph(size, t, n) {
			const shapeCount = SHAPES.length;
			const cyclePos = t % (MORPH_CYCLE * shapeCount);
			const index = Math.floor(cyclePos / MORPH_CYCLE);
			const within = cyclePos - index * MORPH_CYCLE;
			const blend = within > MORPH_HOLD ? smooth((within - MORPH_HOLD) / MORPH_BLEND) : 0;
			const spread = n.spread;
			const from = pick$1(SHAPES, index);
			const to = pick$1(SHAPES, (index + 1) % shapeCount);
			const steps = 160;
			const outline = [];
			for (let i = 0; i < steps; i++) {
				const at = i / steps;
				const a = from(at);
				const b = to(at);
				outline.push([(a[0] + (b[0] - a[0]) * blend) * spread, (a[1] + (b[1] - a[1]) * blend) * spread]);
			}
			const lengths = [];
			let total = 0;
			for (let i = 0; i < steps; i++) {
				const a = pick$1(outline, i);
				const b = pick$1(outline, (i + 1) % steps);
				const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
				lengths.push(len);
				total += len;
			}
			const iconScale = Math.max(.35, size / 260);
			const dotCount = Math.max(6, Math.round(34 * iconScale));
			const radius = n.rDot * 1.35 * spread;
			const breathe = 1 + .02 * Math.sin(within * 3.1);
			const dots = [];
			const half = size / 2;
			let walked = 0;
			let seg = 0;
			for (let i = 0; i < dotCount; i++) {
				const target = i / dotCount * total;
				while (walked + pick$1(lengths, seg) < target && seg < 159) {
					walked += pick$1(lengths, seg);
					seg++;
				}
				const a = pick$1(outline, seg);
				const b = pick$1(outline, (seg + 1) % steps);
				const segLen = pick$1(lengths, seg);
				const frac2 = Math.min(1, (target - walked) / segLen);
				const x = (a[0] + (b[0] - a[0]) * frac2) * breathe;
				const y = (a[1] + (b[1] - a[1]) * frac2) * breathe;
				dots.push({
					x: half + x * size,
					y: half + y * size,
					z: 0,
					r: Math.max(.35, radius * size),
					white: .1
				});
			}
			return finish(dots, [], n.rMin);
		}
		/** Mode → generator dispatch (internal; the component drives it). */
		const GENERATORS = {
			orbits: genOrbits,
			globe: genGlobe,
			wave: genWave,
			web: genWeb,
			braid: genBraid,
			ribbon: genRibbonRing,
			ring: genRibbonRing,
			rubik: genRubik,
			morph: genMorph
		};
		/**
		* Build one orb's scene for a mode at animation time `t`.
		* @param mode - which playground mode to render.
		* @param size - square canvas side in CSS pixels.
		* @param t - mode-scaled animation time in seconds.
		* @param overrides - knobs to replace; the shipped hand-tuned table fills the rest.
		* @returns the depth-sorted ink scene.
		*/
		function orbScene(mode, size, t, overrides = {}) {
			return generate(mode, size, t, {
				...ORB_OPTIONS[mode],
				...overrides
			});
		}
		/** Per-mode dispatch with the generator's own options type. */
		function generate(mode, size, t, opts) {
			return GENERATORS[mode](size, t, opts);
		}
		//#endregion
		//#region src/client/orbs/paint.ts
		/**
		* Paint a scene with 2D canvas ink.
		* @param g - the canvas 2D context (transform already positioned at the orb).
		* @param scene - the scene to paint.
		* @param dark - true flips the ink toward light-on-dark.
		*/
		function paintScene(g, scene, dark) {
			for (const line of scene.lines) {
				const gray = Math.round((dark ? 1 - line.white : line.white) * 255);
				g.strokeStyle = `rgba(${gray},${gray},${gray},${line.a})`;
				g.lineWidth = line.w;
				g.beginPath();
				g.moveTo(line.x1, line.y1);
				g.lineTo(line.x2, line.y2);
				g.stroke();
			}
			for (const dot of scene.dots) {
				const gray = Math.round((dark ? 1 - dot.white : dot.white) * 255);
				g.fillStyle = `rgba(${gray},${gray},${gray},${dot.a ?? 1})`;
				g.beginPath();
				g.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
				g.fill();
			}
		}
		//#endregion
		//#region src/client/orbs/phase.ts
		/** Tool names that read as searching. */
		const SEARCH_TOOLS = /* @__PURE__ */ new Set(["web_search"]);
		/** Tool names that read as writing content into files. */
		const WRITE_TOOLS = /* @__PURE__ */ new Set(["write", "edit"]);
		/** Phase → mode (the 1:1 mapping; drift rotates through all modes). */
		const PHASE_MODE = {
			approval: "rubik",
			error: "rubik",
			settle: "ring",
			delegating: "ribbon",
			searching: "globe",
			weaving: "braid",
			tooling: "web",
			wave: "wave",
			pulse: "orbits",
			drift: "morph"
		};
		/**
		* Derive the animation phase. Precedence mirrors attention: an answer the
		* user owes outranks failures, failures outrank celebration, celebration
		* only shows once the loop went idle, and work-state classes outrank plain
		* streaming, which outranks thinking.
		* @param facts - live per-session and cross-session facts.
		* @param windows - caller-windowed outcome flags.
		* @returns the phase to render.
		*/
		function orbPhase(facts, windows) {
			if (facts.approval) return "approval";
			if (windows.error) return "error";
			if (windows.settle && !facts.running) return "settle";
			if (!(facts.running || facts.streaming || facts.openTools.length > 0) && facts.delegating === 0) return "drift";
			if (facts.delegating > 0) return "delegating";
			if (facts.openTools.some((name) => SEARCH_TOOLS.has(name))) return "searching";
			if (facts.openTools.some((name) => WRITE_TOOLS.has(name))) return "weaving";
			if (facts.openTools.length > 0) return "tooling";
			if (facts.streaming) return "wave";
			return "pulse";
		}
		/**
		* Animation speed multiplier from how much of the harness is concurrently
		* alive: one tick per running session, one more while tools dispatch. The
		* curve is tuned to a meditative pace — roughly half the playground's
		* reference tempo — so busyness still reads without agitation.
		* @param runningSessions - count of sessions whose running bit is set.
		* @param toolsOpen - whether the current session has tools in flight.
		* @returns the multiplier (0.6 idle baseline … 0.9 capped).
		*/
		function orbSpeed(runningSessions, toolsOpen) {
			return .5 + .1 * Math.min(4, Math.max(1, runningSessions) + (toolsOpen ? 1 : 0));
		}
		//#endregion
		//#region src/client/orbs/measure.ts
		/** The inline track format AppFrame writes: `<side>px minmax(0, 1fr) <details>px`. */
		const TRACKS = /^([\d.]+)px minmax\(0, ?1fr\) ([\d.]+)px$/;
		/**
		* Measure the conversation column from an element inside the shell overlay.
		* @param el - any descendant of the overlay layer (the orb canvas).
		* @returns the column box, or null when the shell shape is not recognized.
		*/
		function conversationBox(el) {
			let overlay = null;
			let node = el;
			while (node !== null) {
				if (node.getAttribute("data-shell-overlay") !== null) {
					overlay = node;
					break;
				}
				node = node.parentElement;
			}
			if (overlay === null) return null;
			const frame = overlay.parentElement;
			if (frame === null || frame.style.gridTemplateColumns === "") return null;
			const match = TRACKS.exec(frame.style.gridTemplateColumns);
			if (match === null) return null;
			const side = Number.parseFloat(pick(match, 1));
			const details = Number.parseFloat(pick(match, 2));
			const rect = frame.getBoundingClientRect();
			if (!(rect.width > 0)) return null;
			return {
				left: rect.left + side,
				width: Math.max(0, rect.width - side - details)
			};
		}
		/**
		* Theme darkness from the resolved base-background token: ink flips toward
		* light when the page paints dark. Checked on a cadence, not per frame.
		* @param el - any element inheriting the shell's theme variables.
		* @returns true when the effective base background is dark.
		*/
		function pageIsDark(el) {
			if (el === null) return false;
			const raw = getComputedStyle(el).getPropertyValue("--dsw-alias-bg-base").trim();
			if (raw === "") return false;
			const channels = parseChannels(raw);
			if (channels === null) return false;
			return (.299 * channels[0] + .587 * channels[1] + .114 * channels[2]) / 255 < .5;
		}
		/** Checked-free capture-group read: the caller has just matched the regex. */
		function pick(match, group) {
			return match[group];
		}
		/** Parse `#rgb`, `#rrggbb`, or `rgb(a, b, c)` into channel triple. */
		function parseChannels(raw) {
			if (raw.startsWith("#")) {
				const hex = raw.slice(1);
				if (hex.length === 3) return [
					Number.parseInt(hex.charAt(0) + hex.charAt(0), 16),
					Number.parseInt(hex.charAt(1) + hex.charAt(1), 16),
					Number.parseInt(hex.charAt(2) + hex.charAt(2), 16)
				];
				if (hex.length === 6) return [
					Number.parseInt(hex.slice(0, 2), 16),
					Number.parseInt(hex.slice(2, 4), 16),
					Number.parseInt(hex.slice(4, 6), 16)
				];
				return null;
			}
			const match = /^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(raw);
			if (match === null) return null;
			return [
				Number(pick(match, 1)),
				Number(pick(match, 2)),
				Number(pick(match, 3))
			];
		}
		//#endregion
		//#region src/client/orbs/config.ts
		/** Shipped defaults: no overrides, tour idle, unit multipliers. */
		const DEFAULT_CONFIG = {
			phaseModes: {},
			idleMode: "auto",
			density: 1,
			speed: 1,
			size: 1
		};
		/** Chinese labels for the panel's phase rows. */
		const PHASE_LABELS = {
			approval: "等待批准",
			error: "回合出错",
			settle: "回合完成",
			delegating: "子代理运行",
			searching: "搜索中",
			weaving: "写入文件",
			tooling: "工具调用",
			wave: "流式输出",
			pulse: "思考中",
			drift: "空闲"
		};
		/** Chinese labels for the panel's mode options. */
		const MODE_LABELS = {
			orbits: "轨道",
			globe: "扫描球仪",
			rubik: "魔方",
			wave: "呼吸波",
			web: "信号网络",
			braid: "编织",
			ribbon: "缎带",
			ring: "光环",
			morph: "形变"
		};
		/** Every selectable mode, in tour order. */
		const ALL_MODES = [
			"morph",
			"orbits",
			"globe",
			"rubik",
			"ribbon",
			"wave",
			"web",
			"braid",
			"ring"
		];
		const STORAGE_KEY = "dsh.ui-orbs.config.v1";
		/**
		* Load the persisted config, falling back to defaults on any damage.
		* @returns the persisted config, or the shipped defaults.
		*/
		function loadConfig() {
			try {
				const raw = localStorage.getItem(STORAGE_KEY);
				if (raw === null) return DEFAULT_CONFIG;
				const parsed = JSON.parse(raw);
				if (typeof parsed !== "object" || parsed === null) return DEFAULT_CONFIG;
				const p = parsed;
				const rawModes = p.phaseModes;
				const rawIdle = p.idleMode;
				return {
					phaseModes: typeof rawModes === "object" && rawModes !== null ? rawModes : {},
					idleMode: rawIdle === void 0 || rawIdle === null ? "auto" : rawIdle,
					density: typeof p.density === "number" && Number.isFinite(p.density) ? p.density : 1,
					speed: typeof p.speed === "number" && Number.isFinite(p.speed) ? p.speed : 1,
					size: typeof p.size === "number" && Number.isFinite(p.size) ? p.size : 1
				};
			} catch {
				return DEFAULT_CONFIG;
			}
		}
		/**
		* Persist the config; failures keep it session-local.
		* @param config - the config to persist.
		*/
		function saveConfig(config) {
			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
			} catch {}
		}
		/** Count knobs each mode scales under the density multiplier. */
		const COUNT_FIELDS = {
			orbits: [
				"orbitN",
				"ghostN",
				"particles"
			],
			globe: ["latRings", "lonDensity"],
			wave: ["rings", "lonDensity"],
			web: ["nodeN", "signals"],
			braid: ["strandN", "ghostN"],
			ribbon: ["segs", "ghostN"],
			ring: ["segs"],
			rubik: ["latRings", "lonDensity"],
			morph: []
		};
		/**
		* Engine overrides realizing the density multiplier for one mode.
		* @param mode - the mode being rendered.
		* @param density - the user multiplier.
		* @returns partial options scaled off the hand-tuned table.
		*/
		function densityOverrides(mode, density) {
			if (density === 1) return {};
			const scaled = {};
			const table = ORB_OPTIONS[mode];
			for (const field of COUNT_FIELDS[mode]) {
				const base = table[field];
				if (typeof base === "number") scaled[field] = Math.max(1, Math.round(base * density));
			}
			return scaled;
		}
		//#endregion
		//#region \0dsh-css:src/client/OrbBackdrop.module.css.mjs
		const css$2 = ".OrbBackdrop-module_host{z-index:-1;pointer-events:none;position:fixed;inset:0;overflow:hidden}.OrbBackdrop-module_canvas{opacity:.5;width:100%;height:100%;position:absolute;inset:0}.OrbBackdrop-module_wash{opacity:0;transition:opacity 1s;position:absolute;inset:0}.OrbBackdrop-module_wash[data-on]{opacity:1}.OrbBackdrop-module_washError{background:radial-gradient(70vmax 55vmax at 50% 46%, color-mix(in srgb, var(--dsw-alias-state-error-primary) 16%, transparent), transparent 68%)}.OrbBackdrop-module_washSettle{background:radial-gradient(70vmax 55vmax at 50% 46%, color-mix(in srgb, var(--dsw-alias-state-success-primary) 13%, transparent), transparent 68%)}@media (prefers-reduced-motion:reduce){.OrbBackdrop-module_canvas{opacity:.35}.OrbBackdrop-module_wash{transition:none}}";
		const tagId$2 = "dsh-wallpapers/OrbBackdrop.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-wallpapers";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var OrbBackdrop_module_css_default = {
			"canvas": "OrbBackdrop-module_canvas",
			"host": "OrbBackdrop-module_host",
			"wash": "OrbBackdrop-module_wash",
			"washError": "OrbBackdrop-module_washError",
			"washSettle": "OrbBackdrop-module_washSettle"
		};
		//#endregion
		//#region \0dsh-css:src/client/OrbsPanel.module.css.mjs
		const css$1 = ".OrbsPanel-module_panel{z-index:2;pointer-events:auto;-webkit-backdrop-filter:blur(16px)saturate(1.25);color:#e8ecf4;text-align:left;box-sizing:border-box;background:#0a0d149e;border:1px solid #ffffff14;border-radius:14px;width:272px;padding:18px 16px 12px;font-family:Segoe UI,Microsoft YaHei,system-ui,-apple-system,sans-serif;transition:transform .35s cubic-bezier(.4,0,.2,1);position:fixed;top:14px;bottom:14px;right:14px;overflow:hidden auto}.OrbsPanel-module_panel[data-collapsed]{transform:translate(calc(100% + 22px))}.OrbsPanel-module_panel::-webkit-scrollbar{width:6px}.OrbsPanel-module_panel::-webkit-scrollbar-thumb{background:#ffffff24;border-radius:3px}.OrbsPanel-module_toggle{color:#9aa3b5;cursor:pointer;background:#ffffff0f;border:1px solid #ffffff14;border-radius:8px;width:26px;height:26px;padding:0;font-size:14px;line-height:1;position:absolute;top:12px;right:12px}.OrbsPanel-module_toggle:hover{color:#8fd0ff;border-color:#8fd0ffcc}.OrbsPanel-module_open{z-index:2;pointer-events:auto;-webkit-backdrop-filter:blur(12px);color:#9aa3b5;cursor:pointer;background:#0a0d149e;border:1px solid #ffffff14;border-radius:10px;width:34px;height:34px;padding:0;font-size:15px;display:none;position:fixed;top:14px;right:14px}.OrbsPanel-module_open[data-show]{display:block}.OrbsPanel-module_open:hover{color:#8fd0ff;border-color:#8fd0ffcc}.OrbsPanel-module_head h1{letter-spacing:.32em;color:#e8ecf4;margin:0;font-size:17px;font-weight:600}.OrbsPanel-module_sub{color:#9aa3b5;letter-spacing:.14em;margin:4px 0 0;font-size:11px}.OrbsPanel-module_sec{border-top:1px solid #ffffff14;margin-top:14px;padding-top:11px}.OrbsPanel-module_sec h2{letter-spacing:.22em;color:#8fd0ffcc;margin:0 0 9px;font-size:11px;font-weight:600}.OrbsPanel-module_row{margin-bottom:10px}.OrbsPanel-module_labline{color:#9aa3b5;justify-content:space-between;align-items:baseline;margin-bottom:5px;font-size:12px;display:flex}.OrbsPanel-module_val{color:#8fd0ff;font-family:Consolas,monospace;font-size:12px}.OrbsPanel-module_select{color:#e8ecf4;box-sizing:border-box;background:#141926;border:1px solid #ffffff14;border-radius:8px;outline:none;width:100%;padding:6px 8px;font-size:12px}.OrbsPanel-module_panel input[type=range]{-webkit-appearance:none;appearance:none;box-sizing:border-box;background:linear-gradient(90deg,#8fd0ff66,#ffffff24);border-radius:2px;outline:none;width:100%;height:4px;margin:0}.OrbsPanel-module_panel input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;cursor:pointer;background:#9fd6ff;border-radius:50%;width:14px;height:14px;box-shadow:0 0 8px #8fd0ffa6}.OrbsPanel-module_panel input[type=range]::-moz-range-thumb{cursor:pointer;background:#9fd6ff;border:none;border-radius:50%;width:14px;height:14px;box-shadow:0 0 8px #8fd0ffa6}.OrbsPanel-module_checkline{justify-content:space-between;align-items:center;display:flex}.OrbsPanel-module_mini{color:#e8ecf4;cursor:pointer;background:#ffffff0f;border:1px solid #ffffff14;border-radius:8px;padding:5px 12px;font-size:12px}.OrbsPanel-module_mini:hover{color:#8fd0ff;border-color:#8fd0ffcc}.OrbsPanel-module_foot{color:#9aa3b5;opacity:.8;border-top:1px solid #ffffff14;margin-top:12px;padding-top:10px;font-size:11px;line-height:1.7}@media (width<=640px){.OrbsPanel-module_panel{width:min(280px,82vw)}}";
		const tagId$1 = "dsh-wallpapers/OrbsPanel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-wallpapers";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var OrbsPanel_module_css_default = {
			"checkline": "OrbsPanel-module_checkline",
			"foot": "OrbsPanel-module_foot",
			"head": "OrbsPanel-module_head",
			"labline": "OrbsPanel-module_labline",
			"mini": "OrbsPanel-module_mini",
			"open": "OrbsPanel-module_open",
			"panel": "OrbsPanel-module_panel",
			"row": "OrbsPanel-module_row",
			"sec": "OrbsPanel-module_sec",
			"select": "OrbsPanel-module_select",
			"sub": "OrbsPanel-module_sub",
			"toggle": "OrbsPanel-module_toggle",
			"val": "OrbsPanel-module_val"
		};
		//#endregion
		//#region src/client/OrbBackdrop.tsx
		/**
		* The thinking-orb background component: one hero canvas centered on the
		* conversation column, rendering the playground mode that matches the live
		* phase. Facts arrive through the standard sessions hook (running bits,
		* pending approval, running lineage) plus the current session's `orbActivity`
		* projection value; all timing — outcome holds, idle rotation, crossfades —
		* is component-internal behavioral state on the animation clock, so nothing
		* here subscribes outside the framework seats. User configuration (phase →
		* mode mapping, idle mode, density / speed / size) rides a config ref the
		* frame loop samples; the collapsible panel edits it and persists to
		* localStorage. The wallpaper registry drives visibility through the
		* exported bridge — hiding pauses the render loop entirely.
		*/
		/** Crossfade length between modes, seconds. */
		const FADE_SECONDS = .9;
		/** Idle rotation period, seconds. */
		const ROTATE_SECONDS = 9;
		/** Settle hold after a cleanly completed turn, ms. */
		const SETTLE_HOLD_MS = 1700;
		/** Error hold after a failed turn, ms. */
		const ERROR_HOLD_MS = 3200;
		/** Theme re-check cadence (frames); getComputedStyle is not free. */
		const THEME_CHECK_FRAMES = 60;
		/** Layout re-check cadence (frames); the ResizeObserver handles the rest. */
		const LAYOUT_CHECK_FRAMES = 30;
		/** Registry → component visibility bridge; read at registration time. */
		const visibility = {
			apply: null,
			desired: true
		};
		/** The phases the panel exposes, in attention order. */
		const PANEL_PHASES = [
			"drift",
			"pulse",
			"wave",
			"tooling",
			"weaving",
			"searching",
			"delegating",
			"settle",
			"error",
			"approval"
		];
		/**
		* The thinking-orb background: renders one centered canvas driven by the
		* live session phase.
		* @param props - the shell.overlay standard props (useSessions).
		*/
		function OrbBackdrop({ useSessions }) {
			const canvasRef = (0, react.useRef)(null);
			const hostRef = (0, react.useRef)(null);
			const [outcome, setOutcome] = (0, react.useState)(null);
			const [config, setConfig] = (0, react.useState)(loadConfig);
			const [collapsed, setCollapsed] = (0, react.useState)(false);
			const configRef = (0, react.useRef)(config);
			configRef.current = config;
			const current = useSessions((s) => s.current);
			const running = useSessions((s) => current !== void 0 ? s.byId[current]?.running ?? false : false);
			const approval = useSessions((s) => Object.values(s.byId).some((row) => row.pendingInteraction === "approval"));
			const delegating = useSessions((s) => Object.values(s.byId).filter((row) => row.parentId !== void 0 && row.running).length);
			const runningCount = useSessions((s) => Object.values(s.byId).filter((row) => row.running).length);
			const activity = useSessions((s) => current !== void 0 ? s.byId[current]?.projectionValues?.orbActivity : void 0);
			const factsRef = (0, react.useRef)({
				running: false,
				approval: false,
				delegating: 0,
				openTools: [],
				streaming: false
			});
			factsRef.current = {
				running,
				approval,
				delegating,
				openTools: activity?.openTools ?? [],
				streaming: activity?.streaming ?? false
			};
			const countersRef = (0, react.useRef)({
				runningCount: 1,
				toolsOpen: false
			});
			countersRef.current = {
				runningCount: Math.max(1, runningCount),
				toolsOpen: (activity?.openTools.length ?? 0) > 0
			};
			const activityRef = (0, react.useRef)(void 0);
			activityRef.current = activity;
			const relayoutRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				const canvasEl = canvasRef.current;
				/* v8 ignore next -- React attaches the ref before effects run; only a
				host bug nulls it between render and effect. */
				if (canvasEl === null) return;
				const ctx2d = canvasEl.getContext("2d");
				if (ctx2d === null) return;
				const canvas = canvasEl;
				const g = ctx2d;
				const dprOf = () => Math.min(2, window.devicePixelRatio);
				let width = 0;
				let height = 0;
				let cellX = 0;
				let cellY = 0;
				let cellSize = 0;
				let dark = false;
				let frameNo = 0;
				let clock = 0;
				let lastStamp = 0;
				let raf = 0;
				let disposed = false;
				let runningLoop = true;
				let orbAlpha = configRef.current.idleMode === "none" ? 0 : 1;
				let mode = "morph";
				let prevMode = null;
				let since = 0;
				let rotation = 0;
				let nextRotation = ROTATE_SECONDS;
				let seenSeq = null;
				let settleUntil = 0;
				let errorUntil = 0;
				let shownOutcome = null;
				const reduced = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)").matches : false;
				function relayout() {
					width = canvas.clientWidth;
					height = canvas.clientHeight;
					if (width <= 0 || height <= 0) return;
					const box = conversationBox(canvas);
					const columnWidth = box?.width ?? width;
					cellX = (box?.left ?? 0) + columnWidth / 2;
					cellY = height * .48;
					const base = Math.min(560, Math.max(180, Math.min(height * .66, columnWidth * .52)));
					const cfg = configRef.current;
					cellSize = Math.max(100, Math.min(base * cfg.size, Math.min(width, height) * .95));
					const dpr = dprOf();
					const pw = Math.round(width * dpr);
					const ph = Math.round(height * dpr);
					if (canvas.width !== pw) canvas.width = pw;
					if (canvas.height !== ph) canvas.height = ph;
				}
				relayoutRef.current = relayout;
				/** The configured mode for a phase; null keeps the shipped behavior. */
				function modeForPhase(phase) {
					const cfg = configRef.current;
					if (phase === "drift") return cfg.idleMode === "auto" || cfg.idleMode === "none" ? null : cfg.idleMode;
					return cfg.phaseModes[phase] ?? null;
				}
				/** Resolve the mode for a phase, rotating while idle and crossfading changes. */
				function modeFor(now, phase) {
					if (phase === "drift") {
						const pinned = modeForPhase("drift");
						if (pinned !== null) {
							if (mode !== pinned) {
								prevMode = mode;
								mode = pinned;
								since = now;
							}
							return mode;
						}
						if (now >= nextRotation) {
							rotation += 1;
							nextRotation = now + ROTATE_SECONDS;
							prevMode = mode;
							mode = pick$1(ORB_ROTATION, rotation % ORB_ROTATION.length);
							since = now;
						}
						return mode;
					}
					const want = modeForPhase(phase) ?? PHASE_MODE[phase];
					if (mode !== want) {
						prevMode = mode;
						mode = want;
						since = now;
					}
					return mode;
				}
				function draw(now, phase, dt) {
					if (width <= 0 || cellSize <= 0) return;
					const cfg = configRef.current;
					const dpr = dprOf();
					g.setTransform(dpr, 0, 0, dpr, 0, 0);
					g.clearRect(0, 0, width, height);
					orbAlpha = phase === "drift" && cfg.idleMode === "none" ? Math.max(0, orbAlpha - dt / FADE_SECONDS) : Math.min(1, orbAlpha + dt / FADE_SECONDS);
					if (orbAlpha <= 0) {
						prevMode = null;
						return;
					}
					const speed = orbSpeed(countersRef.current.runningCount, countersRef.current.toolsOpen) * cfg.speed;
					const currentMode = modeFor(now, phase);
					const k = prevMode === null ? 1 : Math.min(1, (now - since) / FADE_SECONDS);
					if (k >= 1) prevMode = null;
					g.save();
					g.translate(cellX - cellSize / 2, cellY - cellSize / 2);
					if (prevMode !== null) {
						g.globalAlpha = (1 - k) * orbAlpha;
						paintScene(g, orbScene(prevMode, cellSize, now * ORB_SPEEDS[prevMode] * speed, densityOverrides(prevMode, cfg.density)), dark);
					}
					g.globalAlpha = k * orbAlpha;
					const dense = densityOverrides(currentMode, cfg.density);
					paintScene(g, orbScene(currentMode, cellSize, now * ORB_SPEEDS[currentMode] * speed, dense), dark);
					g.restore();
					g.globalAlpha = 1;
				}
				function frame(stamp) {
					if (disposed || !runningLoop) return;
					raf = requestAnimationFrame(frame);
					const dt = lastStamp === 0 ? 1 / 60 : Math.min(.1, (stamp - lastStamp) / 1e3);
					lastStamp = stamp;
					clock += dt;
					frameNo += 1;
					if (frameNo % LAYOUT_CHECK_FRAMES === 1) {
						const w = canvas.clientWidth;
						const h = canvas.clientHeight;
						if (Math.abs(w - width) > 2 || Math.abs(h - height) > 2) relayout();
					}
					if (frameNo % THEME_CHECK_FRAMES === 1) dark = pageIsDark(canvas);
					const live = activityRef.current;
					const wall = performance.now();
					if (live !== void 0 && live.outcomeSeq !== seenSeq) {
						seenSeq = live.outcomeSeq;
						if (live.outcome === "error") errorUntil = wall + ERROR_HOLD_MS;
						else if (live.outcome === "settle") settleUntil = wall + SETTLE_HOLD_MS;
					}
					const nextOutcome = wall < errorUntil ? "error" : wall < settleUntil ? "settle" : null;
					if (nextOutcome !== shownOutcome) {
						shownOutcome = nextOutcome;
						setOutcome(nextOutcome);
					}
					draw(clock, orbPhase(factsRef.current, {
						error: wall < errorUntil,
						settle: wall < settleUntil
					}), dt);
				}
				relayout();
				dark = pageIsDark(canvas);
				const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
					relayout();
				}) : null;
				observer?.observe(canvas);
				function pauseLoop() {
					runningLoop = false;
					if (raf !== 0) cancelAnimationFrame(raf);
					raf = 0;
				}
				function resumeLoop() {
					if (disposed || runningLoop || reduced) return;
					runningLoop = true;
					lastStamp = 0;
					raf = requestAnimationFrame(frame);
				}
				visibility.apply = (on) => {
					if (hostRef.current !== null) hostRef.current.style.display = on ? "" : "none";
					if (on) resumeLoop();
					else pauseLoop();
				};
				visibility.apply(visibility.desired);
				if (reduced) draw(.6, "drift", 0);
				else raf = requestAnimationFrame(frame);
				return () => {
					disposed = true;
					visibility.apply = null;
					observer?.disconnect();
					if (raf !== 0) cancelAnimationFrame(raf);
				};
			}, []);
			(0, react.useEffect)(() => {
				relayoutRef.current?.();
			}, [config.size]);
			(0, react.useEffect)(() => {
				saveConfig(config);
			}, [config]);
			const setPhaseMode = (phase, value) => {
				setConfig((prev) => {
					if (phase === "drift") {
						if (value === "auto" || value === "none") return {
							...prev,
							idleMode: value
						};
						return {
							...prev,
							idleMode: value
						};
					}
					if (value === "default") {
						const kept = Object.fromEntries(Object.entries(prev.phaseModes).filter(([key]) => key !== phase));
						return {
							...prev,
							phaseModes: kept
						};
					}
					return {
						...prev,
						phaseModes: {
							...prev.phaseModes,
							[phase]: value
						}
					};
				});
			};
			const setKnob = (key, value) => {
				setConfig((prev) => ({
					...prev,
					[key]: value
				}));
			};
			const phaseValue = (phase) => {
				if (phase === "drift") return config.idleMode;
				return config.phaseModes[phase] ?? "default";
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: hostRef,
				className: OrbBackdrop_module_css_default.host,
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("canvas", {
						ref: canvasRef,
						className: OrbBackdrop_module_css_default.canvas
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: `${OrbBackdrop_module_css_default.wash} ${OrbBackdrop_module_css_default.washError}`,
						"data-on": outcome === "error" || void 0
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: `${OrbBackdrop_module_css_default.wash} ${OrbBackdrop_module_css_default.washSettle}`,
						"data-on": outcome === "settle" || void 0
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: OrbsPanel_module_css_default.open,
						title: "展开面板",
						"data-show": collapsed ? "" : void 0,
						onClick: () => {
							setCollapsed(false);
						},
						children: "⟨"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
						className: OrbsPanel_module_css_default.panel,
						"data-collapsed": collapsed ? "" : void 0,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: OrbsPanel_module_css_default.toggle,
								title: "收起面板",
								onClick: () => {
									setCollapsed(true);
								},
								children: "⟩"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
								className: OrbsPanel_module_css_default.head,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", { children: "思考球体" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: OrbsPanel_module_css_default.sub,
									children: "ORBS · 会话活动背景"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: OrbsPanel_module_css_default.sec,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: "状态 → 球体" }), PANEL_PHASES.map((phase) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: OrbsPanel_module_css_default.row,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: OrbsPanel_module_css_default.labline,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: PHASE_LABELS[phase] })
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										className: OrbsPanel_module_css_default.select,
										value: phaseValue(phase),
										onChange: (e) => {
											setPhaseMode(phase, e.target.value);
										},
										children: [phase === "drift" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "auto",
											children: "自动轮换"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "none",
											children: "无（空闲时隐藏）"
										})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
											value: "default",
											children: [
												"默认（",
												MODE_LABELS[PHASE_MODE[phase]],
												"）"
											]
										}), ALL_MODES.map((m) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: m,
											children: MODE_LABELS[m]
										}, m))]
									})]
								}, phase))]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: OrbsPanel_module_css_default.sec,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: "参数" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: OrbsPanel_module_css_default.row,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: OrbsPanel_module_css_default.labline,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "粒子密度" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: OrbsPanel_module_css_default.val,
												children: config.density.toFixed(2)
											})]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "range",
											min: "0.3",
											max: "2.2",
											step: "0.05",
											value: String(config.density),
											onChange: (e) => {
												setKnob("density", Number(e.target.value));
											}
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: OrbsPanel_module_css_default.row,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: OrbsPanel_module_css_default.labline,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "速度" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: OrbsPanel_module_css_default.val,
												children: config.speed.toFixed(2)
											})]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "range",
											min: "0.2",
											max: "3",
											step: "0.05",
											value: String(config.speed),
											onChange: (e) => {
												setKnob("speed", Number(e.target.value));
											}
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: OrbsPanel_module_css_default.row,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: OrbsPanel_module_css_default.labline,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "球体大小" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: OrbsPanel_module_css_default.val,
												children: config.size.toFixed(2)
											})]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "range",
											min: "0.5",
											max: "1.5",
											step: "0.05",
											value: String(config.size),
											onChange: (e) => {
												setKnob("size", Number(e.target.value));
											}
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: `${OrbsPanel_module_css_default.row} ${OrbsPanel_module_css_default.checkline}`,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: OrbsPanel_module_css_default.mini,
											onClick: () => {
												setConfig(DEFAULT_CONFIG);
											},
											children: "恢复默认"
										})]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("footer", {
								className: OrbsPanel_module_css_default.foot,
								children: "状态映射即时生效并保存在本地；形变模式无粒子密度参数"
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/registry.ts
		/** localStorage key for the persisted selection. */
		const WALLPAPER_STORAGE_KEY = "dsh.wallpaper.selected.v1";
		/** The terminal rows every composition offers. */
		const BUILTIN = [{
			id: "none",
			label: "无壁纸",
			note: "纯净背景"
		}];
		function readStoredSelection() {
			try {
				const raw = localStorage.getItem(WALLPAPER_STORAGE_KEY);
				return typeof raw === "string" && raw !== "" ? raw : null;
			} catch {
				return null;
			}
		}
		function writeStoredSelection(id) {
			try {
				localStorage.setItem(WALLPAPER_STORAGE_KEY, id);
			} catch {}
		}
		/**
		* Build the registry with its selection applied to registrants.
		* @returns the registry face.
		*/
		function createWallpaperRegistry() {
			const layers = /* @__PURE__ */ new Map();
			const listeners = /* @__PURE__ */ new Set();
			let selected = readStoredSelection() ?? "gargantua";
			const notify = () => {
				for (const fn of listeners) fn();
			};
			const applyTo = (layer, visible) => {
				try {
					if (visible) layer.desc.show();
					else layer.desc.hide();
				} catch {}
			};
			return {
				register(desc) {
					const layer = { desc };
					layers.set(desc.id, layer);
					applyTo(layer, desc.id === selected);
					notify();
					return () => {
						if (layers.get(desc.id) !== layer) return;
						layers.delete(desc.id);
						if (selected === desc.id) {
							selected = "none";
							writeStoredSelection(selected);
						}
						notify();
					};
				},
				list() {
					const rows = [];
					for (const layer of layers.values()) rows.push(layer.desc.note === void 0 ? {
						id: layer.desc.id,
						label: layer.desc.label
					} : {
						id: layer.desc.id,
						label: layer.desc.label,
						note: layer.desc.note
					});
					if (![...layers.keys(), ...BUILTIN.map((b) => b.id)].includes(selected)) selected = "none";
					return [...rows, ...BUILTIN];
				},
				current() {
					return selected;
				},
				select(id) {
					if (id === selected) return;
					if (id !== "none" && !layers.has(id)) return;
					for (const layer of layers.values()) applyTo(layer, layer.desc.id === id);
					selected = id;
					writeStoredSelection(id);
					notify();
				},
				subscribe(fn) {
					listeners.add(fn);
					return () => {
						listeners.delete(fn);
					};
				}
			};
		}
		//#endregion
		//#region \0dsh-css:src/client/WallpaperSection.module.css.mjs
		const css = ".WallpaperSection-module_page{color:var(--dsw-alias-label-primary);text-align:left;flex-direction:column;gap:6px;padding:4px 0 12px;font-size:13px;display:flex}.WallpaperSection-module_intro{color:var(--dsw-alias-label-tertiary);margin:2px 0 8px;font-size:12px;line-height:1.6}.WallpaperSection-module_opt{width:100%;color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left;box-sizing:border-box;background:0 0;border:none;border-radius:10px;align-items:center;gap:12px;padding:11px 12px;font-family:inherit;font-size:13px;transition:background .12s;display:flex}.WallpaperSection-module_opt:hover{background:var(--dsw-alias-interactive-bg-hover)}.WallpaperSection-module_on{background:var(--dsw-alias-interactive-bg-hover-accent)}.WallpaperSection-module_dot{border:1.5px solid var(--dsw-alias-label-tertiary);box-sizing:border-box;border-radius:50%;flex:none;width:16px;height:16px;position:relative}.WallpaperSection-module_on .WallpaperSection-module_dot{border-color:var(--dsw-alias-state-business-primary)}.WallpaperSection-module_on .WallpaperSection-module_dot:after{content:\"\";background:var(--dsw-alias-state-business-primary);border-radius:50%;position:absolute;inset:3px}.WallpaperSection-module_opttxt{flex-direction:column;gap:2px;min-width:0;display:flex}.WallpaperSection-module_optlabel{font-size:13px;font-weight:500;line-height:19px}.WallpaperSection-module_optnote{color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:16px}.WallpaperSection-module_hint{border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);border-radius:10px;margin-top:10px;padding:10px 12px;font-size:11.5px;line-height:1.6}";
		const tagId = "dsh-wallpapers/WallpaperSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-wallpapers";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var WallpaperSection_module_css_default = {
			"dot": "WallpaperSection-module_dot",
			"hint": "WallpaperSection-module_hint",
			"intro": "WallpaperSection-module_intro",
			"on": "WallpaperSection-module_on",
			"opt": "WallpaperSection-module_opt",
			"optlabel": "WallpaperSection-module_optlabel",
			"optnote": "WallpaperSection-module_optnote",
			"opttxt": "WallpaperSection-module_opttxt",
			"page": "WallpaperSection-module_page"
		};
		//#endregion
		//#region src/client/WallpaperSection.tsx
		/**
		* The Settings 「壁纸」 section: one radio row per registered wallpaper plus
		* the terminal rows, selection applied immediately so the page behind the
		* open panel previews it.
		*
		* @module dsh-wallpapers/src/client/WallpaperSection
		*/
		/** The wallpaper selection page. */
		function WallpaperSection({ registry }) {
			const [, setRevision] = (0, react.useState)(0);
			(0, react.useEffect)(() => registry.subscribe(() => {
				setRevision((n) => n + 1);
			}), [registry]);
			const rows = registry.list();
			const current = registry.current();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: WallpaperSection_module_css_default.page,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: WallpaperSection_module_css_default.intro,
						children: "选择 Web 界面的背景层。被切走的壁纸会暂停渲染以节省性能；插件壁纸运行时会自动出现在列表中。"
					}),
					rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: row.id === current ? `${WallpaperSection_module_css_default.opt} ${WallpaperSection_module_css_default.on}` : WallpaperSection_module_css_default.opt,
						onClick: () => {
							registry.select(row.id);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: WallpaperSection_module_css_default.dot,
							"aria-hidden": "true"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: WallpaperSection_module_css_default.opttxt,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: WallpaperSection_module_css_default.optlabel,
								children: row.label
							}), row.note !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: WallpaperSection_module_css_default.optnote,
								children: row.note
							})]
						})]
					}, row.id)),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: WallpaperSection_module_css_default.hint,
						children: "黑洞与思考球体各自的参数面板挂在对应壁纸显示时的界面右上角；壁纸被隐藏时其面板一并隐藏。"
					})
				]
			});
		}
		//#endregion
		//#region src/client/index.ts
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
		/** Required services: the slot registry. The wallpaper registry is provided below. */
		const inject = ["slots"];
		/**
		* Client plugin body: provide the wallpaper registry and its Settings
		* section, then register the thinking-orb and GARGANTUA layers into the
		* shell overlay and the registry.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			const registry = createWallpaperRegistry();
			const stopProvide = ctx.provide("wallpaper.registry", registry);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "wallpaper",
				order: 20,
				label: "壁纸"
			}, (props) => (0, react.createElement)(WallpaperSection, {
				registry,
				close: props.close
			})));
			ctx.effect(() => stopProvide);
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "orbs-backdrop",
				order: -1e3,
				label: "思考球体"
			}, OrbBackdrop));
			const stopOrbs = registry.register({
				id: "orbs",
				label: "思考球体",
				note: "会话活动球体 · 可配置",
				show: () => {
					visibility.desired = true;
					visibility.apply?.(true);
				},
				hide: () => {
					visibility.desired = false;
					visibility.apply?.(false);
				}
			});
			ctx.effect(() => stopOrbs);
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "gargantua-wallpaper",
				order: -2e3,
				label: "GARGANTUA 黑洞壁纸"
			}, BlackholeWallpaper));
			const stopBlackhole = registry.register({
				id: "gargantua",
				label: "GARGANTUA 黑洞",
				note: "引力透镜光线追踪 · WebGL2",
				show: () => {
					visibility$1.desired = true;
					visibility$1.apply?.(true);
				},
				hide: () => {
					visibility$1.desired = false;
					visibility$1.apply?.(false);
				}
			});
			ctx.effect(() => stopBlackhole);
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map