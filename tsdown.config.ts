/**
 * Standalone build for dsh-wallpapers, mirroring the DeepSeek Harness client
 * preset (packages/client/tsdown.client.ts) for an external package: the node
 * half is a plain ESM library, the browser half a closure-factory artifact
 * that calls window.__ModuleLoader__.load({ id, factory }) and resolves
 * externals through the injected require (loader module table). CSS Modules
 * compile via lightningcss inside the bundle: importing `x.module.css` yields
 * the hashed class map, and the css text auto-injects a <style data-plugin>
 * tag at factory execution (the loader removes plugin-owned tags on unload).
 */
import { readFile } from 'node:fs/promises'
import { basename, dirname, relative, resolve as resolvePath } from 'node:path'
import { defineConfig } from 'tsdown'
import { transform } from 'lightningcss'

const id = 'dsh-wallpapers'

/**
 * Externals resolved from the loader module table at runtime: react is a
 * platform seed entry; everything else this bundle reaches inlines.
 */
const CLIENT_EXTERNALS = ['react', 'react/jsx-runtime']

/**
 * Virtual-id wrapper keeping module CSS away from tsdown's own css pipeline
 * (which requires @tsdown/css). The suffix matters: tsdown's guard matches ids
 * ending in `.css`, so the virtual id must not.
 */
const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/** Resolve an imported asset path against its importer. */
function sourceAssetPath(source: string, importer: string): string {
  return resolvePath(dirname(importer), source)
}

/** Physical stylesheet path per stable virtual id (see the css plugin below). */
const cssFiles = new Map<string, string>()

export default defineConfig([
  {
    name: id,
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2022',
    // Keep the .js extension the exports map promises; the default
    // fixedExtension would emit lib/index.mjs instead.
    fixedExtension: false,
    dts: false,
    clean: true,
  },
  {
    name: `${id}/client`,
    entry: { client: 'src/client/index.ts' },
    // The published artifact location: package.json exports "./client" points
    // at client/client.js, so the bundle lands there directly.
    outDir: 'client',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    // Types are not shipped; dts here would wrap the banner/footer into .d.cts
    // and break parsing.
    dts: false,
    sourcemap: true,
    clean: true,
    external: [...CLIENT_EXTERNALS],
    // tsdown auto-externalizes package dependencies; anything NOT in the
    // loader module table must inline instead — a require() the table cannot
    // answer is a guaranteed runtime throw.
    noExternal: (source: string) => (CLIENT_EXTERNALS.includes(source) ? undefined : true),
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      'import.meta.env.MODE': JSON.stringify('production'),
      'import.meta.env': JSON.stringify({ MODE: 'production' }),
    },
    plugins: [{
      name: 'dsh-css-modules-inline',
      resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith('.module.css')) return null
        const abs = importer !== undefined ? sourceAssetPath(source, importer) : source
        // rolldown stamps the module id into //#region comments, so the id
        // must not carry the checkout-specific absolute path; physical paths
        // ride the side table instead.
        const stable = relative(process.cwd(), abs).split('\\').join('/')
        const virtualId = CSS_VIRTUAL_PREFIX + stable + CSS_VIRTUAL_SUFFIX
        cssFiles.set(virtualId, abs)
        return virtualId
      },
      async load(virtualId: string) {
        if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
        const fileId = cssFiles.get(virtualId)
        if (fileId === undefined) return null
        // The virtual id otherwise hides the physical stylesheet from watch graphs.
        this.addWatchFile(fileId)
        const source = await readFile(fileId)
        // The class-name hash input must be machine-independent: lightningcss
        // hashes the filename it is given, and the absolute path differs per
        // checkout, which would make committed artifacts non-reproducible. A
        // stable package-relative name keeps [hash] identical everywhere.
        const stableName = `${id}/${basename(fileId)}`
        const { code, exports: cssExports } = transform({
          filename: stableName,
          code: source,
          // [hash] carries a per-process random salt in lightningcss, so two
          // builds of the same tree never agree byte-for-byte. [name]_[local]
          // is deterministic and unique while css module basenames are
          // distinct (they are: five files, five basenames).
          cssModules: { pattern: '[name]_[local]' },
          minify: true,
        })
        // lightningcss returns the export map in a per-process order; sort so
        // the emitted class-map object is byte-stable across builds.
        const classMap: Record<string, string> = {}
        for (const [local, exp] of Object.entries(cssExports ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
          classMap[local] = exp.name
        }
        // One <style data-plugin> per module file; idempotent under re-evaluation.
        return [
          `const css = ${JSON.stringify(code.toString())};`,
          `const tagId = ${JSON.stringify(`${id}/${basename(fileId)}`)};`,
          'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
          '  const tag = document.createElement(\'style\');',
          `  tag.dataset.plugin = ${JSON.stringify(id)};`,
          '  tag.dataset.pluginCss = tagId;',
          '  tag.textContent = css;',
          '  document.head.appendChild(tag);',
          '}',
          `export default ${JSON.stringify(classMap)};`,
        ].join('\n')
      },
    }],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
