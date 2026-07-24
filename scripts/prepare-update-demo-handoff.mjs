import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const BUILD_DIR = resolve(ROOT, 'dist-update-demo')
const HANDOFF_DIR = resolve(ROOT, 'dist-update-demo-handoff')
const ARCHIVE_PATH = resolve(ROOT, 'dist-update-demo-handoff.zip')
const ARCHIVE_HASH_PATH = `${ARCHIVE_PATH}.sha256`
const INITIAL_VERSION = '90.0.1'
const UPDATE_VERSION = '90.0.2'
const FEED_URL = 'http://gitlab-internal.sh/ai-hub/tools/-/raw/master/easymarkdown/update-demo/'

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || ROOT,
      env: options.env || process.env,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true
    })
    let stdout = ''
    let stderr = ''
    if (options.capture) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk
      })
      child.stderr.on('data', (chunk) => {
        stderr += chunk
      })
    }
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolveRun(stdout)
      } else {
        reject(new Error(
          `${command} failed (${signal || code})${stderr ? `\n${stderr.trim()}` : ''}`
        ))
      }
    })
  })
}

async function hashFile(path, algorithm = 'sha256', encoding = 'hex') {
  const hash = createHash(algorithm)
  const buffer = await readFile(path)
  hash.update(buffer)
  return hash.digest(encoding)
}

function parseLatestYml(text) {
  const version = text.match(/^version:\s*(\S+)\s*$/m)?.[1] || ''
  const path = text.match(/^path:\s*(.+?)\s*$/m)?.[1] || ''
  const sha512 = text.match(/^sha512:\s*(\S+)\s*$/m)?.[1] || ''
  return { version, path, sha512 }
}

async function verifyBuild(version) {
  const latestPath = join(BUILD_DIR, 'latest.yml')
  const latest = parseLatestYml(await readFile(latestPath, 'utf8'))
  if (latest.version !== version) {
    throw new Error(`latest.yml version mismatch: expected ${version}, got ${latest.version || '(empty)'}`)
  }
  const installerPath = join(BUILD_DIR, latest.path)
  const installerStat = await stat(installerPath)
  if (!installerStat.isFile()) {
    throw new Error(`Installer is missing: ${installerPath}`)
  }
  const actualSha512 = await hashFile(installerPath, 'sha512', 'base64')
  if (actualSha512 !== latest.sha512) {
    throw new Error(`Installer SHA-512 mismatch for ${latest.path}`)
  }
  const blockmapPath = `${installerPath}.blockmap`
  if (!(await stat(blockmapPath)).isFile()) {
    throw new Error(`Blockmap is missing: ${blockmapPath}`)
  }
  const appUpdate = await readFile(
    join(BUILD_DIR, 'win-unpacked', 'resources', 'app-update.yml'),
    'utf8'
  )
  if (!appUpdate.includes(`url: ${FEED_URL.replace(/\/$/, '')}`)) {
    throw new Error('Packaged app-update.yml does not point to the expected GitLab Raw URL.')
  }
  const distribution = JSON.parse(await readFile(
    join(BUILD_DIR, 'win-unpacked', 'resources', 'distribution.json'),
    'utf8'
  ))
  if (distribution.distribution !== 'internal-demo' || distribution.autoUpdate !== true) {
    throw new Error('Packaged distribution marker is invalid.')
  }
  return { installerPath, blockmapPath, latestPath, latest }
}

async function buildDemo(version) {
  await rm(BUILD_DIR, { recursive: true, force: true })
  await run(process.execPath, [
    resolve(ROOT, 'scripts', 'build-update-demo.mjs'),
    '--version',
    version,
    '--provider',
    'generic',
    '--url',
    FEED_URL
  ])
  return verifyBuild(version)
}

async function listFiles(root) {
  const files = []
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) files.push(path)
    }
  }
  await visit(root)
  return files.sort((a, b) => a.localeCompare(b))
}

async function copySourceSnapshot(destination) {
  const output = await run(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { capture: true }
  )
  const files = output.split('\0').filter(Boolean)
  for (const gitPath of files) {
    const source = resolve(ROOT, ...gitPath.split('/'))
    const target = resolve(destination, ...gitPath.split('/'))
    const relativeTarget = relative(destination, target)
    if (
      relativeTarget.startsWith(`..${sep}`)
      || relativeTarget === '..'
      || relativeTarget.includes(`dist-update-demo-handoff${sep}`)
    ) {
      throw new Error(`Unsafe source snapshot path: ${gitPath}`)
    }
    await mkdir(dirname(target), { recursive: true })
    await copyFile(source, target)
  }

  const branch = (await run('git', ['branch', '--show-current'], { capture: true })).trim()
  const head = (await run('git', ['rev-parse', 'HEAD'], { capture: true })).trim()
  const status = (await run('git', ['status', '--short'], { capture: true })).trim()
  const state = [
    'EasyMarkdown 社内自動更新 Demo ソーススナップショット',
    '',
    `作成日時: ${new Date().toISOString()}`,
    `ブランチ: ${branch}`,
    `基点コミット: ${head}`,
    '',
    '注意:',
    '- このスナップショットには、上記コミット後の未コミット Demo 変更も含まれる。',
    '- Demo 試験には同梱済みインストーラーを使うため、社内での再ビルドは不要。',
    '- 再ビルドする場合は Node.js、npm 依存関係、Electron/electron-builder の取得環境が別途必要。',
    '',
    '作成時の git status:',
    status || '(clean)',
    ''
  ].join('\r\n')
  await writeFile(join(destination, 'SOURCE_STATE.txt'), state, 'utf8')
}

async function writeChecksums() {
  const checksumPath = join(HANDOFF_DIR, 'SHA256SUMS.txt')
  const files = (await listFiles(HANDOFF_DIR)).filter((path) => path !== checksumPath)
  const lines = []
  for (const path of files) {
    const relativePath = relative(HANDOFF_DIR, path).split(sep).join('/')
    lines.push(`${await hashFile(path)} *${relativePath}`)
  }
  await writeFile(checksumPath, `${lines.join('\r\n')}\r\n`, 'utf8')
}

async function createArchive() {
  const sevenZip = resolve(ROOT, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe')
  await rm(ARCHIVE_PATH, { force: true })
  await rm(ARCHIVE_HASH_PATH, { force: true })
  await run(sevenZip, [
    'a',
    '-tzip',
    '-mx=5',
    ARCHIVE_PATH,
    basename(HANDOFF_DIR)
  ], { cwd: dirname(HANDOFF_DIR) })
  const digest = await hashFile(ARCHIVE_PATH)
  await writeFile(
    ARCHIVE_HASH_PATH,
    `${digest} *${basename(ARCHIVE_PATH)}\r\n`,
    'utf8'
  )
}

if (process.platform !== 'win32') {
  throw new Error('The internal update Demo handoff can only be prepared on Windows.')
}

console.log(`[handoff] Feed URL: ${FEED_URL}`)
console.log(`[handoff] Building initial installer ${INITIAL_VERSION}...`)
await rm(HANDOFF_DIR, { recursive: true, force: true })
await mkdir(HANDOFF_DIR, { recursive: true })

const initial = await buildDemo(INITIAL_VERSION)
const initialDir = join(HANDOFF_DIR, '01-initial-installer')
await mkdir(initialDir, { recursive: true })
await copyFile(initial.installerPath, join(initialDir, basename(initial.installerPath)))

console.log(`[handoff] Building update feed ${UPDATE_VERSION}...`)
const update = await buildDemo(UPDATE_VERSION)
const feedDir = join(HANDOFF_DIR, '02-publish-to-gitlab')
await mkdir(feedDir, { recursive: true })
await copyFile(update.installerPath, join(feedDir, basename(update.installerPath)))
await copyFile(update.blockmapPath, join(feedDir, basename(update.blockmapPath)))
await copyFile(update.latestPath, join(feedDir, basename(update.latestPath)))

const toolsDir = join(HANDOFF_DIR, '03-tools-and-runbook')
await mkdir(toolsDir, { recursive: true })
await copyFile(
  resolve(ROOT, 'scripts', 'internal-update-demo', 'Deploy-UpdateDemo.ps1'),
  join(toolsDir, 'Deploy-UpdateDemo.ps1')
)
await copyFile(
  resolve(ROOT, 'scripts', 'internal-update-demo', 'Test-UpdateDemoFeed.ps1'),
  join(toolsDir, 'Test-UpdateDemoFeed.ps1')
)
await copyFile(
  resolve(ROOT, 'docs', 'internal-auto-update-demo-gitlab-runbook.md'),
  join(toolsDir, 'README-FIRST.md')
)

console.log('[handoff] Copying the current source snapshot...')
await copySourceSnapshot(join(HANDOFF_DIR, '04-source-snapshot'))
await writeChecksums()
await createArchive()

const archiveSize = (await stat(ARCHIVE_PATH)).size
console.log(`[handoff] Directory: ${HANDOFF_DIR}`)
console.log(`[handoff] Archive: ${ARCHIVE_PATH} (${(archiveSize / 1024 / 1024).toFixed(1)} MiB)`)
console.log(`[handoff] Archive SHA-256: ${(await readFile(ARCHIVE_HASH_PATH, 'utf8')).trim()}`)
