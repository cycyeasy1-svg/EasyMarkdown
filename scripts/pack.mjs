// Pack dist/win-unpacked into an AES-256 encrypted zip whose top-level entry
// is an EasyMarkdown/ folder (so extracting anywhere yields one runnable
// folder). Windows-only (uses 7-Zip). Run AFTER `npm run dist:dir` — see
// `npm run pack` / `npm run pack:zip` in package.json.
//
// The zip password is read from scripts/pack.config.local.json (gitignored;
// copy from pack.config.example.json). It is never hardcoded here.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const version = pkg.version
const productName = pkg.productName || pkg.name

// --- config (password lives in the gitignored local file) ---
const configPath = resolve(here, 'pack.config.local.json')
if (!existsSync(configPath)) {
  console.error(`[pack] missing ${configPath}`)
  console.error('[pack] copy scripts/pack.config.example.json -> scripts/pack.config.local.json and set zipPassword')
  process.exit(1)
}
const config = JSON.parse(readFileSync(configPath, 'utf8'))
const password = config.zipPassword
const sevenZip = config.sevenZipPath || 'C:\\Program Files\\7-Zip\\7z.exe'
if (!password) {
  console.error('[pack] zipPassword is empty in pack.config.local.json')
  process.exit(1)
}

// --- paths ---
const distDir = resolve(root, 'dist')
const srcDir = resolve(distDir, 'win-unpacked')   // electron-builder output
const stagedDir = resolve(distDir, productName)   // renamed for a top-level folder in the zip
const zipPath = resolve(distDir, `${productName}-${version}-win-x64.zip`)

if (!existsSync(srcDir)) {
  console.error(`[pack] ${srcDir} not found — run "npm run dist:dir" first.`)
  process.exit(1)
}

// slimness self-check
const asar = resolve(srcDir, 'resources', 'app.asar')
if (existsSync(asar)) {
  console.log(`app.asar: ${(statSync(asar).size / 1024 / 1024).toFixed(1)} MB`)
}

// --- staging: rename win-unpacked -> <productName> so the zip root is ---
// --- EasyMarkdown/. Restore in `finally` so the next build isn't broken. ---
if (existsSync(stagedDir)) rmSync(stagedDir, { recursive: true, force: true })
renameSync(srcDir, stagedDir)

let success = false
try {
  if (existsSync(zipPath)) rmSync(zipPath, { force: true })
  // Pass the folder itself (NOT its contents) so the archive has a top-level
  // EasyMarkdown/. Do NOT add -mhe=on — it triggers a System ERROR here.
  const result = spawnSync(sevenZip, [
    'a', '-tzip', `-p${password}`, '-mem=AES256', zipPath, stagedDir,
  ], { encoding: 'utf8' })

  const output = `${result.stdout || ''}\n${result.stderr || ''}`
  const ok = result.status === 0 && output.includes('Everything is Ok')
  if (!ok) {
    console.error(output)
    throw new Error(`[pack] 7z failed (status ${result.status})`)
  }
  // print only the meaningful lines (7z lists every file otherwise)
  const lines = output.split(/\r?\n/).filter((l) =>
    /Creating archive|Everything is Ok|^Files:|^Sizes:/.test(l))
  console.log(lines.join('\n'))
  success = true
} finally {
  // restore the electron-builder output name
  if (!existsSync(srcDir) && existsSync(stagedDir)) {
    renameSync(stagedDir, srcDir)
  }
}

if (success && existsSync(zipPath)) {
  console.log(`Created: ${zipPath}`)
  console.log(`Size: ${(statSync(zipPath).size / 1024 / 1024).toFixed(1)} MB`)
} else {
  console.error('[pack] zip not produced')
  process.exit(1)
}
