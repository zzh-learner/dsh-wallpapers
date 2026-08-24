/**
 * Shader sources for the Kerr-Newman wallpaper, ported verbatim from the
 * validated single-file prototype (playground/kerr-newman.html). The
 * physics core (ingoing Kerr-Schild metric, Hamiltonian photon paths,
 * RK4 with null-constraint re-projection, adaptive natural affine steps,
 * volumetric disk with Doppler/gravitational shift) is byte-identical to
 * the prototype that passed: Schwarzschild b_crit = 3*sqrt(3) M to 0.02%,
 * Kerr prograde/retrograde shadow asymmetry, exact Keplerian Omega(r),
 * Doppler g-factor sign, antiverse sheet flip, extremal/naked stability.
 *
 * @module dsh-wallpapers/src/client/kerrnewman/shaders
 */

export const VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`

export const SCENE = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;
out vec4 outColor;

uniform vec2 uRes;
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamFwd;
uniform float uFovTan;
uniform vec2 uJitter;
uniform float uSpin;      // a
uniform float uCharge;    // Q
uniform int uSteps;
uniform float uStepC;
uniform float uFar;

uniform float uDiskIn, uDiskOut, uDiskH;
uniform float uTemp, uTempExp, uBright, uBrightExp, uDens, uDensExp;
uniform float uTurb, uTurbScale, uDoppler, uOrbit, uExtinct;
uniform float uStarDens, uStarBright, uNebula;
uniform float uDebug;

/* ---------- PCG hashing & value noise ---------- */
uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float hash1(uvec3 c) {
  uint h = pcg(pcg(pcg(c.x + 1u) ^ (c.y + 37u)) ^ (c.z + 517u));
  return float(h) / 4294967295.0;
}
vec3 hash3(uvec3 c) {
  uint h = pcg(pcg(pcg(c.x + 1u) ^ (c.y + 37u)) ^ (c.z + 517u));
  return vec3(float(h & 1023u), float((h >> 10u) & 1023u), float((h >> 20u) & 1023u)) * (1.0 / 1023.0);
}
float vnoise(vec3 p) {
  vec3 i = floor(p), f = p - i;
  vec3 u = f * f * (3.0 - 2.0 * f);
  vec3 m = mod(i, 256.0);
  uvec3 base = uvec3(m);
  float a = hash1(base);
  float b = hash1(base + uvec3(1u, 0u, 0u));
  float c = hash1(base + uvec3(0u, 1u, 0u));
  float d = hash1(base + uvec3(1u, 1u, 0u));
  float e = hash1(base + uvec3(0u, 0u, 1u));
  float f1 = hash1(base + uvec3(1u, 0u, 1u));
  float g = hash1(base + uvec3(0u, 1u, 1u));
  float h = hash1(base + uvec3(1u, 1u, 1u));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y),
             mix(mix(e, f1, u.x), mix(g, h, u.x), u.y), u.z);
}
float fbm(vec3 p) {
  float s = 0.0, amp = 0.5;
  for (int i = 0; i < 4; i++) {
    s += amp * vnoise(p);
    p = p * 2.03 + vec3(11.7, 5.1, 17.3);
    amp *= 0.5;
  }
  return s * 1.0667;
}

/* ---------- blackbody chroma (Tanner Helland fit) ---------- */
vec3 blackbodyRGB(float K) {
  float t = clamp(K, 1000.0, 40000.0) / 100.0;
  float r = t <= 66.0 ? 1.0 : clamp(1.29293618606 * pow(t - 60.0, -0.1332047592), 0.0, 1.0);
  float g = t <= 66.0 ? clamp(0.39008157876 * log(t) - 0.63184144378, 0.0, 1.0)
                      : clamp(1.12989086089 * pow(t - 60.0, -0.0755148492), 0.0, 1.0);
  float b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.54320678911 * log(t - 10.0) - 1.19625408914, 0.0, 1.0));
  return vec3(r, g, b);
}

/* ---------- Kerr–Newman metric in ingoing Kerr–Schild Cartesian ---------- */
/* derived quantities + analytic gradients */
void geoAll(vec3 X, float a, float Q, float rn,
            out float f, out vec3 kv, out float r, out float r2, out float Sig, out float D,
            out vec3 df, out vec3 dkx, out vec3 dky, out vec3 dkz) {
  float R2 = dot(X, X);
  float A = R2 - a * a;
  D = sqrt(A * A + 4.0 * a * a * X.z * X.z);
  r2 = 0.5 * (A + D);
  float rAbs = sqrt(max(r2, 1e-12));
  r = rn * rAbs;
  float u = r2 + a * a;
  float zr2 = max(r2, 1e-12);
  Sig = r2 + a * a * X.z * X.z / zr2;
  float den = max(r2 * r2 + a * a * X.z * X.z, 1e-12);
  f = (2.0 * r - Q * Q) * r2 / den;
  float rr = r == 0.0 ? 1e-12 : r;
  kv = vec3((r * X.x + a * X.y) / u, (r * X.y - a * X.x) / u, X.z / rr);

  float gx = r * X.x / Sig;
  float gy = r * X.y / Sig;
  float gz = X.z * u / (rr * Sig);
  float dSx = 2.0 * X.x * (2.0 * r2 - Sig) / Sig;
  float dSy = 2.0 * X.y * (2.0 * r2 - Sig) / Sig;
  float dSz = 2.0 * X.z * (2.0 * u - Sig) / Sig;
  df = vec3(2.0 * gx - f * dSx, 2.0 * gy - f * dSy, 2.0 * gz - f * dSz) / Sig;

  float uu = u * u;
  float cx = 2.0 * r * (r * X.x + a * X.y);
  float cy = 2.0 * r * (r * X.y - a * X.x);
  dkx = vec3(((X.x * gx + r) * u - cx * gx) / uu,
             ((X.x * gy + a) * u - cx * gy) / uu,
             (X.x * gz * u - cx * gz) / uu);
  dky = vec3(((X.y * gx - a) * u - cy * gx) / uu,
             ((X.y * gy + r) * u - cy * gy) / uu,
             (X.y * gz * u - cy * gz) / uu);
  float r4 = rr * rr;
  dkz = vec3(-X.z * gx / r4, -X.z * gy / r4, (rr - X.z * gz) / r4);
}

/* Hamiltonian RHS: state = position X + covariant spatial momentum P */
void rhsEval(vec3 X, vec3 P, float pt, float a, float Q, float rn,
             out vec3 dX, out vec3 dP, out float dtUp, out float Phi, out float f, out vec3 kvO, out float rO) {
  vec3 df, dkx, dky, dkz, kv;
  float r, r2, Sig, D;
  geoAll(X, a, Q, rn, f, kv, r, r2, Sig, D, df, dkx, dky, dkz);
  Phi = -pt + dot(kv, P);
  kvO = kv;
  rO = r;
  dX = P - f * Phi * kv;
  dP = 0.5 * Phi * Phi * df + f * Phi * vec3(
    dkx.x * P.x + dky.x * P.y + dkz.x * P.z,
    dkx.y * P.x + dky.y * P.y + dkz.y * P.z,
    dkx.z * P.x + dky.z * P.y + dkz.z * P.z);
  dtUp = -pt + f * Phi;
}

/* null-constraint re-projection: rescale spatial P (p_t fixed) so H = 0 */
bool fixNull(inout vec3 P, float pt, float f, vec3 kv) {
  float K = dot(kv, P);
  float c2 = dot(P, P) - f * K * K;
  float c1 = 2.0 * f * pt * K;
  float c0 = -(1.0 + f) * pt * pt;
  float disc = c1 * c1 - 4.0 * c2 * c0;
  if (disc < 0.0 || abs(c2) < 1e-14) return false;
  float sq = sqrt(disc);
  float r1 = (-c1 + sq) / (2.0 * c2);
  float r2o = (-c1 - sq) / (2.0 * c2);
  float al = abs(r1 - 1.0) < abs(r2o - 1.0) ? r1 : r2o;
  if (!(al > 0.0)) return false;
  P *= al;
  return true;
}

/* natural adaptive affine step (no division into fixed spatial length;
   stiffness-aware so horizon asymptotes resolve). Metric data (f, Phi, |r|)
   comes from the cached post-step evaluation of the previous RK4 step. */
float stepLen(vec3 X, float a, float Q, float f, float Phi, float ra, float C) {
  float rho = length(X.xy);
  float dRing = distance(vec2(rho, X.z), vec2(abs(a), 0.0));
  float Pm = 2.0 * ra - Q * Q;
  float Lgrav = Pm > 0.05 ? max(0.12, 0.5 * ra * ra / (3.0 * Pm)) : 1.2;
  float Lring = max(0.012, dRing * 0.22);
  float Lr = max(0.045, ra * 0.32);
  float Lpos = min(min(Lgrav, Lring), Lr);
  float stiff = 1.0 + abs(Phi) * max(1.0, abs(f));
  float h = C * Lpos / stiff;
  /* refine inside the disk slab for volume sampling (error control only) */
  float H = uDiskH * (0.55 + 0.14 * ra);
  if (rho > uDiskIn * 0.4 && rho < uDiskOut + 4.0 && abs(X.z) < 3.0 * H + 0.8) {
    h = min(h, 0.035 + 0.34 * abs(X.z));
  }
  return clamp(h, 2e-4, 2.5);
}

/* co-rotating equatorial circular-orbit angular velocity (exact KN, KS-native).
   M is the sheet sign (+1 normal sheet, -1 through-the-ring sheet); the
   co-rotating root is chosen by the sign of a*M. Validated: Kerr exact
   Omega = 1/(r^1.5 + a) for a>0, M=1. */
float omegaOf(float r, float a, float Q, float M) {
  if (r < 0.35) return 0.0;
  float dgtt = -2.0 * M / (r * r) + 2.0 * Q * Q / (r * r * r);
  float dgtp = a * (2.0 * M / (r * r) - 2.0 * Q * Q / (r * r * r));
  float dgpp = 2.0 * r + a * a * (-2.0 * M / (r * r) + 2.0 * Q * Q / (r * r * r));
  float disc = dgtp * dgtp - dgtt * dgpp;
  if (disc <= 0.0 || dgpp == 0.0) return 0.0;
  float sq = sqrt(disc);
  return (a * M >= 0.0) ? (-dgtp + sq) / dgpp : (-dgtp - sq) / dgpp;
}

/* ---------- procedural sky ---------- */
vec3 starLayer(vec3 dir, float scale, float thr, float px) {
  vec3 p = dir * scale;
  vec3 id = floor(p);
  vec3 h = hash3(uvec3(mod(id, 256.0)));
  if (h.y > thr) return vec3(0.0);
  float mag = pow(h.x, 14.0);
  vec3 sp = id + 0.5 + (h - 0.5) * 1.26;
  float d2 = dot(p - sp, p - sp);
  float sig = 0.045 + px * scale * 0.62;
  float I = exp(-d2 / (2.0 * sig * sig)) * mag;
  vec3 col = mix(vec3(1.0, 0.72, 0.52), vec3(0.62, 0.76, 1.0), h.z);
  col = mix(col, vec3(1.0), 0.35);
  return col * I;
}
vec3 skyColor(vec3 dir, bool anti) {
  float px = 2.0 * uFovTan / uRes.y;
  vec3 c = vec3(0.0);
  c += starLayer(dir, 22.0, 1.0 - 0.28 * uStarDens, px) * 1.35;
  c += starLayer(dir + 3.17, 47.0, 1.0 - 0.55 * uStarDens, px) * 0.7;
  c += starLayer(dir + 9.31, 89.0, 1.0 - 0.85 * min(uStarDens, 1.0), px) * 0.4;
  c *= uStarBright * 3.4;
  vec3 bandN = normalize(vec3(0.28, 0.9, 0.34));
  float band = exp(-pow(abs(dot(dir, bandN)) / 0.26, 2.2));
  float neb = fbm(dir * 3.1) * 0.65 + fbm(dir * 7.7) * 0.35;
  vec3 nebCol = mix(vec3(0.1, 0.16, 0.38), vec3(0.42, 0.14, 0.3), fbm(dir * 1.7 + 4.0));
  c += uNebula * band * neb * nebCol * 0.85;
  c += uNebula * 0.05 * nebCol * (1.0 - band * 0.5);
  if (anti) c = vec3(1.62) - c;
  return c;
}

/* ---------- volumetric accretion disk sample ---------- */
void diskSample(vec3 X, vec3 P, float pt, float ds, float rn, float a, float Q, float Eobs,
                float jit, inout vec3 acc, inout vec3 trans) {
  float rho2 = X.x * X.x + X.y * X.y;
  float rho = sqrt(rho2);
  if (rho < uDiskIn * 0.55 || rho > uDiskOut * 1.05) return;

  /* equatorial r for this cylinder radius (rho^2 = r^2 + a^2 on the plane) */
  float aAbs = abs(a);
  if (rho <= aAbs) return;
  float req = sqrt(rho2 - a * a);
  float rr = req;
  if (rr < uDiskIn * 0.62 || rr > uDiskOut) return;
  float win = smoothstep(uDiskIn * 0.75, uDiskIn * 1.3, rr) * (1.0 - smoothstep(uDiskOut * 0.7, uDiskOut, rr));
  if (win < 0.002) return;

  float H = uDiskH * (0.55 + 0.14 * rr);
  float vert = exp(-pow(abs(X.z) / H, 1.65));
  if (vert < 0.004) return;

  float omE0 = omegaOf(rr, a, Q, rn < 0.0 ? -1.0 : 1.0);
  float phi = atan(X.y, X.x) - omE0 * uTime * uOrbit * 9.0;
  vec3 q = vec3(log(rr + 1.0) * 2.3, phi * (rr * 0.4) * 0.32, X.z / H * 1.15) * uTurbScale;
  float tb = fbm(q) * 1.55;
  tb = mix(0.72, tb, uTurb);
  float dens = uDens * win * vert * tb * exp(-(rr - uDiskIn) * uDensExp);
  if (dens < 5e-4) return;

  /* Doppler + gravitational shift: g = E_obs / E_emit */
  float fr = rn < 0.0 ? -(2.0 * req - Q * Q) / (req * req) : (2.0 * req - Q * Q) / (req * req);
  float gvv = -1.0 + fr;
  float gvp = -fr * a;
  float gpp = rho2 + fr * a * a;
  float omE = omE0;
  float nrm = -(gvv + 2.0 * omE * gvp + omE * omE * gpp);
  if (nrm <= 1e-9) return;
  float uv = 1.0 / sqrt(nrm);
  float ppsi = -X.y * P.x + X.x * P.y;
  float pem = uv * (pt + omE * ppsi);
  if (pem >= -1e-9) return;
  float g = clamp(Eobs / (-pem), 0.05, 24.0);
  float gg = mix(1.0, g, clamp(uDoppler, 0.0, 1.0));
  float gL = mix(1.0, g, clamp(uDoppler, 0.0, 1.5));

  float Tobs = gg * uTemp * exp(-(rr - uDiskIn) * uTempExp);
  vec3 bb = blackbodyRGB(Tobs);
  float lum = uBright * exp(-(rr - uDiskIn) * uBrightExp) * dens;
  acc += trans * bb * (lum * gL * gL * gL) * ds;
  trans *= exp(-uExtinct * dens * ds * vec3(1.0, 1.34, 1.78));
}

void main() {
  vec2 uv = (gl_FragCoord.xy + uJitter) / uRes * 2.0 - 1.0;
  uv.x *= uRes.x / uRes.y;
  vec3 dir = normalize(uCamFwd + uFovTan * (uv.x * uCamRight + uv.y * uCamUp));
  float a = uSpin, Q = uCharge;

  /* static-observer orthonormal tetrad via Gram–Schmidt on {dt,dx,dy,dz} */
  vec3 df, dkx, dky, dkz, kv;
  float f, r, r2, Sig, D;
  geoAll(uCamPos, a, Q, 1.0, f, kv, r, r2, Sig, D, df, dkx, dky, dkz);
  float Eobs = 1.0 / sqrt(max(1.0 - f, 1e-6));
  vec4 e0 = vec4(Eobs, 0.0, 0.0, 0.0);
  vec4 b1 = vec4(0.0, 1.0, 0.0, 0.0);
  vec4 b2 = vec4(0.0, 0.0, 1.0, 0.0);
  vec4 b3 = vec4(0.0, 0.0, 0.0, 1.0);
  vec4 k4 = vec4(1.0, kv);
  #define GDOT(u, v) ((-(u).x * (v).x + dot((u).yzw, (v).yzw)) + f * ((u).x + dot((u).yzw, kv)) * ((v).x + dot((v).yzw, kv)))
  b1 -= GDOT(b1, e0) * e0; b1 *= inversesqrt(max(GDOT(b1, b1), 1e-9));
  b2 -= GDOT(b2, e0) * e0 + GDOT(b2, b1) * b1; b2 *= inversesqrt(max(GDOT(b2, b2), 1e-9));
  b3 -= GDOT(b3, e0) * e0 + GDOT(b3, b1) * b1 + GDOT(b3, b2) * b2; b3 *= inversesqrt(max(GDOT(b3, b3), 1e-9));
  #undef GDOT

  /* arriving photon (ingoing chart, spin +a): tetrad momentum points at the
     camera. The view direction is decomposed onto the tetrad legs themselves
     (dot with each leg's spatial part), so the mapping is exact for any f. */
  vec4 pu = e0 - (dot(dir, b1.yzw) * b1 + dot(dir, b2.yzw) * b2 + dot(dir, b3.yzw) * b3);
  float kf = pu.x + dot(pu.yzw, kv);
  float pt = -pu.x + f * kf;
  vec3 P = pu.yzw + f * kf * kv;

  vec3 X = uCamPos;
  float rn = 1.0;
  vec3 acc = vec3(0.0);
  vec3 trans = vec3(1.0);
  bool sky = false;
  bool anti = false;
  vec3 skyDir = vec3(0.0, 0.0, 1.0);
  float pixSeed = dot(gl_FragCoord.xy, vec2(0.754, 0.569)) + fract(uTime * 61.7);
  float dead = 0.0;
  float minR = 1e9;
  float usedSteps = 0.0;
  float diskHits = 0.0;

  /* cache from the post-step evaluation (prime it at the camera) */
  vec3 dXs, dPs, kvC;
  float ptUp, PhiC, fC, rC;
  rhsEval(X, P, pt, a, Q, 1.0, dXs, dPs, ptUp, PhiC, fC, kvC, rC);

  for (int i = 0; i < 2200; i++) {
    if (i >= uSteps || dead > 0.5) break;
    usedSteps = float(i) + 1.0;
    minR = min(minR, abs(rC));
    float h = -stepLen(X, a, Q, fC, PhiC, abs(rC), uStepC);
    vec3 X0 = X;

    vec3 dX1, dP1, dX2, dP2, dX3, dP3, dX4, dP4, kvT;
    float t1, t2, t3, t4, p1, p2, p3, p4, fT, rT;
    rhsEval(X, P, pt, a, Q, rn, dX1, dP1, t1, p1, fT, kvT, rT);
    rhsEval(X + 0.5 * h * dX1, P + 0.5 * h * dP1, pt, a, Q, rn, dX2, dP2, t2, p2, fT, kvT, rT);
    rhsEval(X + 0.5 * h * dX2, P + 0.5 * h * dP2, pt, a, Q, rn, dX3, dP3, t3, p3, fT, kvT, rT);
    rhsEval(X + h * dX3, P + h * dP3, pt, a, Q, rn, dX4, dP4, t4, p4, fT, kvT, rT);
    X += (h / 6.0) * (dX1 + 2.0 * dX2 + 2.0 * dX3 + dX4);
    P += (h / 6.0) * (dP1 + 2.0 * dP2 + 2.0 * dP3 + dP4);

    /* equatorial-plane crossing inside the ring: pass to the other r-sheet */
    if (X0.z * X.z < 0.0) {
      float tt = X0.z / (X0.z - X.z);
      vec2 xc = mix(X0.xy, X.xy, tt);
      if (dot(xc, xc) < a * a) rn = -rn;
    }

    /* post-step evaluation: constraint fix + capture tests + escape direction */
    float R2 = dot(X, X);
    if (!(R2 < 1e12)) { dead = 1.0; break; }
    rhsEval(X, P, pt, a, Q, rn, dXs, dPs, ptUp, PhiC, fC, kvC, rC);
    if (!fixNull(P, pt, fC, kvC)) { dead = 1.0; break; }
    if (abs(ptUp) > 9e3) { dead = 1.0; break; }      /* horizon: redshift divergence */
    if (abs(fC) > 4e3) { dead = 1.0; break; }        /* ring singularity */
    if (R2 > uFar * uFar) {
      sky = true;
      anti = rn < 0.0;
      skyDir = -normalize(dXs);
      break;
    }

    /* volume sample along the segment */
    float jit = fract(hash1(uvec3(gl_FragCoord.xy, i)) + pixSeed);
    float ds = length(X - X0);
    if (ds > 1e-6) {
      vec3 acc0 = acc;
      diskSample(mix(X0, X, jit), P, pt, ds, rn, a, Q, Eobs, jit, acc, trans);
      if (dot(acc - acc0, acc - acc0) > 0.0) diskHits += 1.0;
    }
    if (max(trans.x, max(trans.y, trans.z)) < 0.004) break;
  }

  vec3 col = acc;
  if (sky) col += trans * skyColor(skyDir, anti);
  if (uDebug > 1.5) {
    outColor = vec4(clamp(minR / 14.0, 0.0, 1.0), clamp(usedSteps / float(uSteps), 0.0, 1.0), clamp(diskHits / 8.0, 0.0, 1.0), 1.0);
  } else if (uDebug > 0.5) {
    vec3 dbg;
    if (dead > 0.5) dbg = vec3(1.0, 0.15, 0.1);
    else if (sky) dbg = anti ? vec3(0.1, 1.0, 1.0) : vec3(0.12, 0.55, 0.12);
    else dbg = vec3(0.12, 0.15, 1.0);
    outColor = vec4(dbg * (0.25 + 0.75 * usedSteps / float(uSteps)), 1.0);
  } else {
    outColor = vec4(col, 1.0);
  }
}
`

export const BLEND = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uPrev;
uniform sampler2D uCur;
uniform float uMix;
void main() {
  vec4 prev = texture(uPrev, vUv);
  vec4 cur = texture(uCur, vUv);
  outColor = mix(prev, cur, uMix);
}
`

export const BRIGHT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform float uThr;
void main() {
  vec3 c = texture(uSrc, vUv).rgb;
  float l = max(max(c.r, c.g), c.b);
  float k = max(l - uThr, 0.0);
  k = k / (1.0 + k);
  outColor = vec4(c * k, 1.0);
}
`

export const DOWN = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;
void main() {
  vec3 c = texture(uSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  outColor = vec4(c * 0.25, 1.0);
}
`

export const UP = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform sampler2D uPrev;
uniform vec2 uTexel;
void main() {
  vec2 t = uTexel;
  vec3 c = texture(uSrc, vUv).rgb * 4.0;
  c += texture(uSrc, vUv + t * vec2(2.0, 0.0)).rgb + texture(uSrc, vUv - t * vec2(2.0, 0.0)).rgb;
  c += texture(uSrc, vUv + t * vec2(0.0, 2.0)).rgb + texture(uSrc, vUv - t * vec2(0.0, 2.0)).rgb;
  c += texture(uSrc, vUv + t * vec2(1.0, 1.0)).rgb + texture(uSrc, vUv + t * vec2(1.0, -1.0)).rgb;
  c += texture(uSrc, vUv - t * vec2(1.0, 1.0)).rgb + texture(uSrc, vUv + t * vec2(-1.0, 1.0)).rgb;
  c /= 12.0;
  outColor = vec4(c + texture(uPrev, vUv).rgb, 1.0);
}
`

export const COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStr;
uniform float uCA;
uniform float uExposure;
uniform float uVignette;
uniform float uTime;
uniform vec2 uRes;

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec2 fromC = vUv - 0.5;
  fromC.x *= uRes.x / uRes.y;
  float r2 = dot(fromC, fromC);
  vec2 dir = fromC * (uCA * 0.0028) * (0.35 + r2);
  vec3 col;
  col.r = texture(uScene, vUv + dir).r;
  col.g = texture(uScene, vUv).g;
  col.b = texture(uScene, vUv - dir).b;
  vec3 bloom;
  bloom.r = texture(uBloom, vUv + dir * 1.6).r;
  bloom.g = texture(uBloom, vUv).g;
  bloom.b = texture(uBloom, vUv - dir * 1.6).b;
  col += bloom * uBloomStr;
  col *= uExposure;
  col *= 1.0 - uVignette * smoothstep(0.15, 0.95, r2);
  col = aces(col);
  col = pow(col, vec3(1.0 / 2.2));
  col += (hash12(vUv * uRes + fract(uTime) * 100.0) - 0.5) * 0.007;
  outColor = vec4(col, 1.0);
}
`
