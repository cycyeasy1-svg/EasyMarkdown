import * as esbuild from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const production = process.argv.includes('--production')
const watch = process.argv.includes('--watch')
const extensionDir = path.dirname(fileURLToPath(import.meta.url))
const extensionNodeModules = path.join(extensionDir, 'node_modules')

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
  // Shared renderer modules live above this package. Their bare imports normally
  // resolve from the repository root; fall back to this package's dependencies so
  // an extension-only install can still build the webview bundle.
  nodePaths: [extensionNodeModules],
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
