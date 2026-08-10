import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as prettier from 'prettier'

const SUPPORTED_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.json',
  '.jsonc',
  '.css',
  '.scss',
  '.html',
  '.yml',
  '.yaml'
])

export function parseGitPathList(output) {
  return String(output || '')
    .split('\0')
    .filter(Boolean)
    .map((path) => path.replaceAll('\\', '/'))
}

export function isSupportedFormatPath(path) {
  return SUPPORTED_EXTENSIONS.has(extname(path).toLowerCase())
}

export function selectFormatCandidates(paths, { exists = existsSync, ignored = () => false } = {}) {
  const candidates = new Set()
  for (const rawPath of paths || []) {
    const path = String(rawPath || '')
      .replaceAll('\\', '/')
      .replace(/^\.\//, '')
    if (!path || isAbsolute(path) || path === '..' || path.startsWith('../')) continue
    if (!isSupportedFormatPath(path) || ignored(path) || !exists(path)) continue
    candidates.add(path)
  }
  return [...candidates].sort((a, b) => a.localeCompare(b, 'en'))
}

function gitOutput(args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', allowFailure ? 'ignore' : 'pipe']
    })
  } catch (error) {
    if (allowFailure) return ''
    const detail = error?.stderr?.toString().trim() || error?.message || String(error)
    throw new Error(`git ${args.join(' ')} failed: ${detail}`)
  }
}

function refExists(ref) {
  return Boolean(
    gitOutput(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
      allowFailure: true
    }).trim()
  )
}

export function isAllowedFormatBase(ref) {
  return /^(?:[0-9a-f]{7,40}|HEAD(?:[~^]\d*)?)$/i.test(String(ref || ''))
}

export function resolveFormatBase() {
  const explicit = String(process.env.FORMAT_BASE_SHA || '').trim()
  if (explicit && !/^0+$/.test(explicit)) {
    if (!isAllowedFormatBase(explicit)) {
      throw new Error(`FORMAT_BASE_SHA must be a commit SHA or HEAD-relative ref: ${explicit}`)
    }
    if (!refExists(explicit)) {
      throw new Error(`FORMAT_BASE_SHA does not resolve to a commit: ${explicit}`)
    }
    return explicit
  }

  const head = gitOutput(['rev-parse', 'HEAD']).trim()
  for (const candidate of ['main', 'origin/main']) {
    if (!refExists(candidate)) continue
    const mergeBase = gitOutput(['merge-base', 'HEAD', candidate]).trim()
    if (mergeBase && mergeBase !== head) return mergeBase
  }
  return null
}

export function collectChangedPaths() {
  const paths = [
    ...parseGitPathList(gitOutput(['diff', '--name-only', '-z', '--diff-filter=ACMR'])),
    ...parseGitPathList(gitOutput(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'])),
    ...parseGitPathList(gitOutput(['ls-files', '--others', '--exclude-standard', '-z']))
  ]
  const base = resolveFormatBase()
  if (base) {
    paths.push(
      ...parseGitPathList(
        gitOutput(['diff', '--name-only', '-z', '--diff-filter=ACMR', `${base}...HEAD`])
      )
    )
  }
  return paths
}

async function formatChanged({ write }) {
  const repositoryRoot = process.cwd()
  const ignorePath = resolve(repositoryRoot, '.prettierignore')
  const candidates = selectFormatCandidates(collectChangedPaths(), {
    exists: (path) => existsSync(resolve(repositoryRoot, path))
  })
  const checked = []
  const different = []

  for (const path of candidates) {
    const absolutePath = resolve(repositoryRoot, path)
    const info = await prettier.getFileInfo(absolutePath, { ignorePath })
    if (info.ignored || !info.inferredParser) continue

    checked.push(path)
    const source = readFileSync(absolutePath, 'utf8')
    const config = (await prettier.resolveConfig(absolutePath, { editorconfig: true })) || {}
    const formatted = await prettier.format(source, { ...config, filepath: absolutePath })
    if (formatted === source) continue

    different.push(path)
    if (write) writeFileSync(absolutePath, formatted, 'utf8')
  }

  if (write) {
    console.log(
      `[format] ${different.length} formatted / ${checked.length} changed file(s) checked`
    )
    return
  }
  if (different.length) {
    console.error(`[format] ${different.length} changed file(s) need formatting:`)
    for (const path of different) console.error(`- ${path}`)
    console.error('Run npm run format, then re-run npm run format:check.')
    process.exitCode = 1
    return
  }
  console.log(`[format] ${checked.length} changed file(s): OK`)
}

async function main() {
  const args = process.argv.slice(2)
  const unknown = args.filter((arg) => arg !== '--check' && arg !== '--write')
  if (unknown.length || (args.includes('--check') && args.includes('--write'))) {
    throw new Error('Usage: node scripts/format-changed.mjs [--check | --write]')
  }
  await formatChanged({ write: args.includes('--write') })
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`[format] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
