# dsh-wallpapers

Wallpaper plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh): one bundle package that mounts the wallpaper registry, the thinking-orb canvas, and the GARGANTUA black-hole WebGL2 layer.

- **Wallpaper registry** — a page-local `wallpaper.registry` service background layers register into, plus the Settings → 壁纸 section that lists them and selects the active one. Selection persists in localStorage.
- **Thinking orb** — one centered hero canvas rendering the playground mode that matches the live session phase (in-flight tool names, streaming bit, turn outcomes), driven by the `orbActivity` session projection. Collapsible panel with per-phase mode mapping, idle mode, density / speed / size.
- **GARGANTUA black hole** — a zero-dependency WebGL2 black-hole ray tracer (gravitational lensing, accretion disk, bloom) as a translucent background layer with its own control panel.

The host half registers the `orbActivity` projection through the session-projection seam; the browser half is the UI. Hiding a wallpaper through the registry pauses its render loop.

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

Source layout: `src/index.ts` is the node half (projection registration); `src/client/` is the browser half (registry, section, orb, black-hole). The client bundle is a closure-factory artifact around `window.__ModuleLoader__.load` with react externalized through the loader module table, mirroring the harness client preset for an external package.

## License

MIT
