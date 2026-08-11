import * as esbuild from 'esbuild'
import { cp, mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(packageDir, '..', '..')
const outputDir = path.join(repositoryRoot, 'dist-web-lite')
const publicDir = path.join(packageDir, 'public')
const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'))

if (path.dirname(outputDir) !== repositoryRoot || path.basename(outputDir) !== 'dist-web-lite') {
  throw new Error(`Refusing to replace unexpected output directory: ${outputDir}`)
}

await rm(outputDir, { recursive: true, force: true })
await mkdir(path.join(outputDir, 'assets'), { recursive: true })
await cp(publicDir, outputDir, { recursive: true })

await esbuild.build({
  entryPoints: [path.join(packageDir, 'src', 'main.jsx')],
  outfile: path.join(outputDir, 'assets', 'app.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['chrome120', 'edge120'],
  jsx: 'automatic',
  minify: true,
  legalComments: 'none',
  sourcemap: false,
  assetNames: '[name]-[hash]',
  loader: {
    // The logo is referenced from JavaScript. A relative file-loader URL is
    // resolved against index.html under file:// (not against assets/app.js), so
    // inline it to keep the static directory relocatable.
    '.png': 'dataurl',
    '.svg': 'file',
    '.woff': 'file',
    '.woff2': 'file',
    '.ttf': 'file'
  },
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  logLevel: 'info'
})

console.log(`[web-lite] built ${outputDir}`)
