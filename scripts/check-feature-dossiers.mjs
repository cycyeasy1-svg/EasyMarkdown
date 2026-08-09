import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FEATURE_ID_RE = /^FD-[A-Z0-9][A-Z0-9-]*$/
const AC_ID_RE = /\bAC-[A-Z0-9]+-\d{3}\b/g
const AC_HEADING_RE = /^###\s+(AC-[A-Z0-9]+-\d{3})\b/gm
const TEST_ID_RE = /^TEST-[A-Z0-9]+-\d{3}$/
const DOSSIER_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const REQUIRED_METADATA = [
  'feature_id',
  'title',
  'risk',
  'status',
  'owner',
  'platforms',
  'last_verified'
]

const REQUIRED_FEATURE_SECTIONS = [
  'Context',
  'Goal',
  'Non-goal',
  'UX',
  'Data',
  'Contract',
  'Acceptance Criteria',
  'Test Mapping',
  'Rollout',
  'Rollback',
  'Open Questions'
]

const ALLOWED_RISKS = new Set(['S', 'M', 'L'])
const ALLOWED_STATUSES = new Set(['draft', 'approved', 'implemented', 'verified', 'deprecated'])
const ALLOWED_PLATFORMS = new Set([
  'desktop-windows',
  'desktop-macos',
  'mobile-ios',
  'mobile-android',
  'vscode',
  'website',
  'shared'
])
const ALLOWED_TEST_LEVELS = new Set(['unit', 'integration', 'e2e', 'static', 'manual'])

function unquote(value) {
  const trimmed = value.trim()
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

export function parseFrontMatter(text, label = 'document') {
  const match = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) {
    return {
      metadata: {},
      body: String(text),
      errors: [`${label}: front matter がありません`]
    }
  }

  const metadata = {}
  const errors = []
  for (const [index, rawLine] of match[1].split(/\r?\n/).entries()) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const field = line.match(/^([a-z][a-z0-9_]*):\s*(.*)$/)
    if (!field) {
      errors.push(`${label}: front matter ${index + 2} 行目の形式が不正です`)
      continue
    }
    const [, key, rawValue] = field
    if (Object.hasOwn(metadata, key)) {
      errors.push(`${label}: metadata "${key}" が重複しています`)
      continue
    }
    metadata[key] = unquote(rawValue)
  }

  return {
    metadata,
    body: String(text).slice(match[0].length),
    errors
  }
}

function hasSection(body, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^##\\s+${escaped}\\s*$`, 'mi').test(body)
}

function duplicates(values) {
  const seen = new Set()
  const repeated = new Set()
  for (const value of values) {
    if (seen.has(value)) repeated.add(value)
    seen.add(value)
  }
  return [...repeated]
}

export function parseTestMappingRows(text) {
  const rows = []
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) continue
    const cells = trimmed
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim())
    if (!TEST_ID_RE.test(cells[0] || '')) continue
    rows.push({
      testId: cells[0],
      acIds: [...(cells[1] || '').matchAll(AC_ID_RE)].map((match) => match[0]),
      level: (cells[2] || '').toLowerCase(),
      evidence: (cells[3] || '').replaceAll('`', '').trim()
    })
  }
  return rows
}

export function validateDossierTexts({
  featureText,
  testText,
  featurePath = 'feature.md',
  testPath = 'test-spec.md'
}) {
  const feature = parseFrontMatter(featureText, featurePath)
  const testSpec = parseFrontMatter(testText, testPath)
  const errors = [...feature.errors, ...testSpec.errors]
  const metadata = feature.metadata

  for (const key of REQUIRED_METADATA) {
    if (!metadata[key]) errors.push(`${featurePath}: metadata "${key}" が必要です`)
  }
  if (metadata.feature_id && !FEATURE_ID_RE.test(metadata.feature_id)) {
    errors.push(`${featurePath}: feature_id "${metadata.feature_id}" の形式が不正です`)
  }
  if (metadata.risk && !ALLOWED_RISKS.has(metadata.risk)) {
    errors.push(`${featurePath}: risk は S／M／L のいずれかです`)
  }
  if (metadata.status && !ALLOWED_STATUSES.has(metadata.status)) {
    errors.push(`${featurePath}: status "${metadata.status}" は未対応です`)
  }
  if (metadata.last_verified && !DATE_RE.test(metadata.last_verified)) {
    errors.push(`${featurePath}: last_verified は YYYY-MM-DD 形式です`)
  }

  const platforms = (metadata.platforms || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  for (const platform of platforms) {
    if (!ALLOWED_PLATFORMS.has(platform)) {
      errors.push(`${featurePath}: platform "${platform}" は未対応です`)
    }
  }

  for (const section of REQUIRED_FEATURE_SECTIONS) {
    if (!hasSection(feature.body, section)) {
      errors.push(`${featurePath}: "## ${section}" section が必要です`)
    }
  }
  if (metadata.risk === 'L' && !hasSection(feature.body, 'Migration')) {
    errors.push(`${featurePath}: risk L には "## Migration" section が必要です`)
  }
  if (metadata.risk === 'L') {
    for (const key of ['adr', 'security_review']) {
      if (!metadata[key] || metadata[key].toLowerCase() === 'none') {
        errors.push(`${featurePath}: risk L には metadata "${key}" が必要です`)
      }
    }
  }

  const acIds = [...feature.body.matchAll(AC_HEADING_RE)].map((match) => match[1])
  if (acIds.length === 0) {
    errors.push(`${featurePath}: Acceptance Criteria の AC-ID heading がありません`)
  }
  for (const acId of duplicates(acIds)) {
    errors.push(`${featurePath}: ${acId} が重複しています`)
  }

  if (testSpec.metadata.feature_id !== metadata.feature_id) {
    errors.push(
      `${testPath}: feature_id "${testSpec.metadata.feature_id || ''}" が feature.md と一致しません`
    )
  }
  if (!DATE_RE.test(testSpec.metadata.last_verified || '')) {
    errors.push(`${testPath}: last_verified は YYYY-MM-DD 形式で必要です`)
  }
  if (!hasSection(testSpec.body, 'Test Mapping')) {
    errors.push(`${testPath}: "## Test Mapping" section が必要です`)
  }

  const testRows = parseTestMappingRows(testSpec.body)
  if (testRows.length === 0) errors.push(`${testPath}: TEST-ID mapping row がありません`)
  for (const testId of duplicates(testRows.map((row) => row.testId))) {
    errors.push(`${testPath}: ${testId} が重複しています`)
  }

  const definedAcIds = new Set(acIds)
  const mappedAcIds = new Set()
  for (const row of testRows) {
    if (!ALLOWED_TEST_LEVELS.has(row.level)) {
      errors.push(`${testPath}: ${row.testId} の test level "${row.level}" は未対応です`)
    }
    if (!row.evidence) errors.push(`${testPath}: ${row.testId} の evidence がありません`)
    if (row.acIds.length === 0) errors.push(`${testPath}: ${row.testId} に AC-ID がありません`)
    for (const acId of row.acIds) {
      mappedAcIds.add(acId)
      if (!definedAcIds.has(acId)) {
        errors.push(`${testPath}: ${row.testId} が未定義の ${acId} を参照しています`)
      }
    }
  }
  for (const acId of definedAcIds) {
    if (!mappedAcIds.has(acId)) errors.push(`${testPath}: ${acId} に対応する TEST-ID がありません`)
  }

  return { errors, metadata, acIds, testRows }
}

function referenceFile(reference) {
  return String(reference || '')
    .split('#', 1)[0]
    .replaceAll('`', '')
    .trim()
}

function checkRepositoryPath(root, reference, label, errors) {
  const file = referenceFile(reference)
  if (!file || file.toLowerCase() === 'none') return
  if (isAbsolute(file) || file.split(/[\\/]/).includes('..')) {
    errors.push(`${label}: repository 相対 path を指定してください (${reference})`)
    return
  }
  if (!existsSync(resolve(root, file))) errors.push(`${label}: 参照先が存在しません (${file})`)
}

function evidenceFiles(evidence) {
  return String(evidence)
    .split(/<br\s*\/?>|,/i)
    .map((value) => value.trim())
    .filter(Boolean)
}

export function checkFeatureDossierRepository(root) {
  const repositoryRoot = resolve(root)
  const dossierRoot = join(repositoryRoot, 'docs', 'feature-dossiers')
  const errors = []
  if (!existsSync(dossierRoot)) {
    return { errors: ['docs/feature-dossiers: directory がありません'], dossierCount: 0, acCount: 0, testCount: 0 }
  }

  const directories = readdirSync(dossierRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
    .sort()
  if (directories.length === 0) errors.push('docs/feature-dossiers: 実例 dossier がありません')

  const featureIds = []
  const allAcIds = []
  const allTestIds = []

  for (const directory of directories) {
    if (!DOSSIER_SLUG_RE.test(directory)) {
      errors.push(`docs/feature-dossiers/${directory}: directory 名は kebab-case にしてください`)
    }
    const featurePath = join(dossierRoot, directory, 'feature.md')
    const testPath = join(dossierRoot, directory, 'test-spec.md')
    const displayFeaturePath = relative(repositoryRoot, featurePath).replaceAll('\\', '/')
    const displayTestPath = relative(repositoryRoot, testPath).replaceAll('\\', '/')
    if (!existsSync(featurePath)) {
      errors.push(`${displayFeaturePath}: file がありません`)
      continue
    }
    if (!existsSync(testPath)) {
      errors.push(`${displayTestPath}: file がありません`)
      continue
    }

    const result = validateDossierTexts({
      featureText: readFileSync(featurePath, 'utf8'),
      testText: readFileSync(testPath, 'utf8'),
      featurePath: displayFeaturePath,
      testPath: displayTestPath
    })
    errors.push(...result.errors)
    if (result.metadata.feature_id) featureIds.push(result.metadata.feature_id)
    allAcIds.push(...result.acIds)
    allTestIds.push(...result.testRows.map((row) => row.testId))

    if (result.metadata.risk === 'L') {
      checkRepositoryPath(repositoryRoot, result.metadata.adr, `${displayFeaturePath}: adr`, errors)
      checkRepositoryPath(
        repositoryRoot,
        result.metadata.security_review,
        `${displayFeaturePath}: security_review`,
        errors
      )
    }
    for (const row of result.testRows) {
      if (row.level === 'manual') continue
      for (const evidence of evidenceFiles(row.evidence)) {
        checkRepositoryPath(repositoryRoot, evidence, `${displayTestPath}: ${row.testId}`, errors)
      }
    }
  }

  for (const featureId of duplicates(featureIds)) errors.push(`feature_id ${featureId} が重複しています`)
  for (const acId of duplicates(allAcIds)) errors.push(`AC-ID ${acId} が dossier 間で重複しています`)
  for (const testId of duplicates(allTestIds)) errors.push(`TEST-ID ${testId} が dossier 間で重複しています`)

  return {
    errors,
    dossierCount: directories.length,
    acCount: allAcIds.length,
    testCount: allTestIds.length
  }
}

function runCli() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const result = checkFeatureDossierRepository(root)
  if (result.errors.length > 0) {
    console.error(`[feature-dossiers] ${result.errors.length} 件の問題:`)
    for (const error of result.errors) console.error(`  - ${error}`)
    process.exitCode = 1
    return
  }
  console.log(
    `[feature-dossiers] ${result.dossierCount} dossier / ${result.acCount} AC / ${result.testCount} tests: OK`
  )
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (entryPath === fileURLToPath(import.meta.url)) runCli()
