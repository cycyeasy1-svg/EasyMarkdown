import * as esbuild from 'esbuild'

const production = process.argv.includes('--production')
const watch = process.argv.includes('--watch')

/** Extension host: Node/CommonJS, `vscode` stays external (provided by the host). */
const hostConfig = {
  entryPoints: ['src/extension.js'],
  bundle: true,
  outfile: 'dist/extension.cjs',
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
  logLevel: 'info'
}

/** Webview: browser/IIFE, bundles the shared keep-mode modules + mermaid + katex.
 *  CSS imported from main.js is emitted as dist/webview.css. */
const webviewConfig = {
  entryPoints: ['webview/main.js'],
  bundle: true,
  outfile: 'dist/webview.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  sourcemap: !production,
  minify: production,
  loader: {
    '.woff': 'file',
    '.woff2': 'file',
    '.ttf': 'file'
  },
  logLevel: 'info'
}

if (watch) {
  const a = await esbuild.context(hostConfig)
  const b = await esbuild.context(webviewConfig)
  await Promise.all([a.watch(), b.watch()])
  console.log('[esbuild] watching…')
} else {
  await Promise.all([esbuild.build(hostConfig), esbuild.build(webviewConfig)])
  console.log('[esbuild] build complete')
}
