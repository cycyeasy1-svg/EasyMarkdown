// Pack dist/win-unpacked into an AES-256 encrypted zip whose top-level entry
// is an EasyMarkdown/ folder (so extracting anywhere yields one runnable
// folder). Windows-only (uses 7-Zip). Run AFTER `npm run dist:dir` — see
// `npm run pack` / `npm run pack:zip` in package.json.
//
// The zip password is read from scripts/pack.config.local.json (gitignored;
// copy from pack.config.example.json). It never leaves this file: creating the
// archive, testing its integrity and checking its manifest all happen here, so
// no caller — human or agent — ever has to spell the password on a command
// line where it would land in a shell history or a chat transcript.
//
// `node scripts/pack.mjs --preflight` (= `npm run pack:check`) validates the
// config and the 7-Zip binary, then exits. It needs no build, so run it before
// the minutes-long `dist:dir` rather than discovering a missing password after.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const preflightOnly = process.argv.slice(2).includes('--preflight')

const die = (...lines) => {
  for (const line of lines) console.error(line)
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const version = pkg.version
const productName = pkg.productName || pkg.name

// --- config (password lives in the gitignored local file) ---
const configPath = resolve(here, 'pack.config.local.json')
if (!existsSync(configPath)) {
  die(`[pack] missing ${configPath}`,
    '[pack] copy scripts/pack.config.example.json -> scripts/pack.config.local.json and set zipPassword')
}
let config
try {
  config = JSON.parse(readFileSync(configPath, 'utf8'))
} catch (err) {
  die(`[pack] ${configPath} is not valid JSON: ${err.message}`)
}
const password = config.zipPassword
const sevenZip = config.sevenZipPath || 'C:\\Program Files\\7-Zip\\7z.exe'
if (!password || password === 'your-password-here') {
  die('[pack] set a real zipPassword in scripts/pack.config.local.json')
}

// sevenZipPath may be an absolute path or a bare name resolved through PATH,
// so a plain existsSync isn't enough — fall back to invoking it.
const sevenZipFound = existsSync(sevenZip) || !spawnSync(sevenZip, ['i'], { encoding: 'utf8' }).error
if (!sevenZipFound) {
  die(`[pack] 7-Zip not found at ${sevenZip}`,
    '[pack] install 7-Zip, or point sevenZipPath at it in scripts/pack.config.local.json')
}

if (preflightOnly) {
  console.log(`[pack] preflight ok — 7-Zip: ${sevenZip}, zipPassword: set`)
  console.log(`[pack] would produce ${productName}-${version}-win-x64.zip`)
  process.exit(0)
}

// --- paths ---
const distDir = resolve(root, 'dist')
const srcDir = resolve(distDir, 'win-unpacked')   // electron-builder output
const stagedDir = resolve(distDir, productName)   // renamed for a top-level folder in the zip
const zipPath = resolve(distDir, `${productName}-${version}-win-x64.zip`)

if (!existsSync(srcDir)) {
  die(`[pack] ${srcDir} not found — run "npm run dist:dir" first.`)
}

// slimness self-check
const asar = resolve(srcDir, 'resources', 'app.asar')
if (existsSync(asar)) {
  console.log(`app.asar: ${(statSync(asar).size / 1024 / 1024).toFixed(1)} MB`)
}

// Entries the zip must contain. The exe and app.asar prove the build landed;
// README.md and RELEASE_NOTES.md come from electron-builder `extraFiles`, and
// silently vanish if that config is edited — this is what catches that.
const required = [
  `${productName}/${productName}.exe`,
  `${productName}/RELEASE_NOTES.md`,
  `${productName}/README.md`,
  `${productName}/resources/app.asar`,
]

const run7z = (...args) => {
  const result = spawnSync(sevenZip, [...args, `-p${password}`, zipPath], { encoding: 'utf8' })
  return { status: result.status, output: `${result.stdout || ''}\n${result.stderr || ''}` }
}

function verify() {
  const test = run7z('t')
  if (test.status !== 0 || !test.output.includes('Everything is Ok')) {
    console.error(test.output)
    throw new Error('[pack] integrity test failed — the archive is corrupt or the password does not decrypt it')
  }
  const list = run7z('l')
  if (list.status !== 0) {
    console.error(list.output)
    throw new Error('[pack] could not list the archive')
  }
  const listing = list.output.replace(/\\/g, '/')
  const missing = required.filter((entry) => !listing.includes(entry))
  if (missing.length) {
    throw new Error(`[pack] archive is missing expected entries: ${missing.join(', ')}`)
  }
  console.log(`Verified: integrity ok, all ${required.length} expected entries present`)
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
  verify()
  success = true
} catch (err) {
  console.error(err.message)
  // A zip that failed verification must not survive under a release filename —
  // it looks shippable and isn't. It costs one rebuild to regenerate.
  if (existsSync(zipPath)) {
    rmSync(zipPath, { force: true })
    console.error(`[pack] removed unverified ${zipPath}`)
  }
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
  console.error('[pack] no verified zip produced')
  process.exit(1)
}
