# dsh-wallpapers

Wallpaper plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh): one bundle package that mounts the wallpaper registry, the thinking-orb canvas, the GARGANTUA black-hole WebGL2 layer, the Kerr-Newman black-hole WebGL2 layer, and the local-media layer.

- **Wallpaper registry** — a page-local `wallpaper.registry` service background layers register into, plus the Settings → 壁纸 section that lists them and selects the active one. Selection persists in localStorage.
- **Thinking orb** — one centered hero canvas rendering the playground mode that matches the live session phase (in-flight tool names, streaming bit, turn outcomes), driven by the `orbActivity` session projection. Collapsible panel with per-phase mode mapping, idle mode, density / speed / size.
- **GARGANTUA black hole** — a zero-dependency WebGL2 black-hole ray tracer (gravitational lensing, accretion disk, bloom) as a translucent background layer with its own control panel.
- **Kerr-Newman black hole** — strict Kerr-Newman metric in ingoing Kerr-Schild Cartesian coordinates with Hamiltonian photon tracing: RK4 plus null-constraint re-projection, adaptive natural affine steps, horizon detection via redshift divergence, a turbulent volumetric accretion disk with Doppler/gravitational shift and reddening extinction, an antiverse (inverted sky) behind the ring singularity, and spin/charge adjustable past 1 for naked singularities; post FX include bloom, chromatic aberration, ACES. The single-file prototype lives at `playground/kerr-newman.html`.
- **Pelican bike** — the generated pure-CSS SVG animation of a pelican pedaling a bicycle (exact two-link inverse kinematics baked into keyframes: 36 steps per crank revolution, feet locked on the pedals), cover-fitted as a static background layer with zero JavaScript render loop and a persisted opacity slider. The artwork is produced by `pelican-bike/build_pelican.py`, which writes both the standalone preview `pelican-bike/index.html` and the plugin module `src/client/pelican/art.ts`; edit geometry there and rerun it to refresh both.
- **Underlay mode** — selecting 鹈鹕骑行 or 本地媒体 additionally lifts the harness app columns above the shell overlay and clears the frame's opaque base, so full-bleed wallpapers sit BEHIND the interface instead of printing over it (translucent layer opacity defaults to 35%, tunable per wallpaper). The lift keys off stable attributes plus one MutationObserver scan; if a harness update changes the DOM it simply stops matching and the page falls back to the stock layout.
- **Local media** — use one local image or video, or rotate every image/video in a local folder, as the wallpaper. The host half serves listings and byte streams (single Range, extension whitelist) under `/dsh-wallpapers/local` when the composition provides a web server; the browser half adds the layer plus an embedded folder picker (interval / shuffle / fit) in the Settings section, with the configuration persisted in localStorage.

The host half registers the `orbActivity` projection through the session-projection seam (and the local-media routes on web compositions); the browser half is the UI. Hiding a wallpaper through the registry pauses its render loop.

## Install

Requires the `dsh` CLI. Into the `web` profile (or any profile name):

```sh
dsh plugin --profile web add github:zzh-learner/dsh-wallpapers
```

How you invoke `dsh` depends on the install form of DeepSeek Harness:

- npm global install (`npm i -g @deepseek-ai/dsh`): `dsh ...` as written above.
- No install: prefix with npx — `npx @deepseek-ai/dsh plugin --profile web add ...`.
- Source checkout: run `pnpm dsh ...` from the repository root — the checkout puts no `dsh` on PATH.

The install runs no build scripts: `lib/` and `client/` build artifacts are committed, and the package deliberately carries no `prepare` script, so pnpm ≥ 10 has nothing to block — no `allowBuilds` entry needed. CI verifies the committed artifacts match `pnpm run build` on every push.

Lock to a commit with `github:zzh-learner/dsh-wallpapers#<sha>` so later pushes cannot change what runs.

Verify the layer, then start:

```sh
dsh --profile web --dump-config   # shows a "# == dsh-wallpapers" layer
dsh --profile web
```

## Develop

```sh
pnpm install
pnpm run build       # tsdown: lib/ (node half) + client/ (browser bundle)
pnpm run typecheck
```

Source layout: `src/index.ts` is the node half (projection registration); `src/client/` is the browser half (registry, section, orb, black-hole, kerr-newman). The client bundle is a closure-factory artifact around `window.__ModuleLoader__.load` with react externalized through the loader module table, mirroring the harness client preset for an external package.

## License

MIT
