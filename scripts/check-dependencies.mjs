import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical']
const scriptDir = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDir, '..')
const baselinePath = resolve(repositoryRoot, 'config', 'dependency-audit-baseline.json')

export function normalizeAuditCounts(value = {}) {
  const counts = Object.fromEntries(
    SEVERITIES.map((severity) => [severity, Number(value[severity]) || 0])
  )
  counts.total = SEVERITIES.reduce((sum, severity) => sum + counts[severity], 0)
  return counts
}

export function validateAuditCounts(value, label = 'audit baseline') {
  const errors = []
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${label}: vulnerability counts object が必要です`]
  }
  for (const severity of SEVERITIES) {
    if (!Number.isInteger(value[severity]) || value[severity] < 0) {
      errors.push(`${label}: ${severity} は 0 以上の整数である必要があります`)
    }
  }
  if (errors.length === 0) {
    const expectedTotal = SEVERITIES.reduce((sum, severity) => sum + value[severity], 0)
    if (value.total !== expectedTotal) {
      errors.push(`${label}: total ${value.total} は severity 合計 ${expectedTotal} と一致しません`)
    }
  }
  return errors
}

export function validateAuditBaseline(baseline) {
  const errors = []
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) {
    return ['dependency baseline: object が必要です']
  }
  if (baseline.schemaVersion !== 1) {
    errors.push('dependency baseline: schemaVersion は 1 である必要があります')
  }
  if (typeof baseline.lastVerified !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(baseline.lastVerified)) {
    errors.push('dependency baseline: lastVerified は YYYY-MM-DD である必要があります')
  }
  const projects = baseline.projects
  if (!projects || typeof projects !== 'object' || Array.isArray(projects) || !Object.keys(projects).length) {
    errors.push('dependency baseline: projects object が必要です')
    return errors
  }
  for (const [name, project] of Object.entries(projects)) {
    if (!project || typeof project !== 'object' || Array.isArray(project)) {
      errors.push(`${name}: project object が必要です`)
      continue
    }
    if (typeof project.path !== 'string' || !project.path.trim()) {
      errors.push(`${name}: path が必要です`)
    }
    errors.push(...validateAuditCounts(project.vulnerabilities, name))
  }
  return errors
}

export function compareAuditCounts(currentValue, baselineValue, label = 'dependency') {
  const current = normalizeAuditCounts(currentValue)
  const baseline = normalizeAuditCounts(baselineValue)
  const errors = []
  for (const severity of SEVERITIES) {
    if (current[severity] > baseline[severity]) {
      errors.push(
        `${label}: ${severity} vulnerability が baseline ${baseline[severity]} から ${current[severity]} へ増加しました`
      )
    }
  }
  return { current, baseline, errors }
}

function runAudit(projectPath) {
  const auditArgs = [
    'audit',
    '--package-lock-only',
    '--json',
    '--fetch-retries=2',
    '--fetch-retry-mintimeout=1000',
    '--fetch-retry-maxtimeout=5000'
  ]
  const npmExecPath = process.env.npm_execpath
  const command = npmExecPath ? process.execPath : 'npm'
  const args = npmExecPath ? [npmExecPath, ...auditArgs] : auditArgs
  let lastError = 'unknown audit error'
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = spawnSync(command, args, {
      cwd: resolve(repositoryRoot, projectPath),
      encoding: 'utf8',
      shell: !npmExecPath && process.platform === 'win32',
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024
    })
    let report
    try {
      report = JSON.parse(result.stdout || '')
    } catch {
      lastError = (result.stderr || result.stdout || `exit ${result.status}`).trim()
      continue
    }
    if (report?.metadata?.vulnerabilities) {
      return normalizeAuditCounts(report.metadata.vulnerabilities)
    }
    lastError =
      report?.message || report?.error?.summary || report?.error?.detail || `exit ${result.status}`
  }
  throw new Error(`npm audit が vulnerability metadata を返しませんでした: ${lastError}`)
}

export function checkDependencyAuditBaseline() {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
  const errors = validateAuditBaseline(baseline)
  const results = []
  if (errors.length) return { errors, results, lastVerified: baseline?.lastVerified }
  for (const [name, project] of Object.entries(baseline.projects || {})) {
    try {
      const current = runAudit(project.path)
      const comparison = compareAuditCounts(current, project.vulnerabilities, name)
      errors.push(...comparison.errors)
      results.push({ name, ...comparison })
    } catch (error) {
      errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { errors, results, lastVerified: baseline.lastVerified }
}

function formatCounts(counts) {
  return SEVERITIES.map((severity) => `${severity}=${counts[severity]}`).join(' / ')
}

function main() {
  const result = checkDependencyAuditBaseline()
  for (const project of result.results) {
    console.log(`[dependencies] ${project.name}: ${formatCounts(project.current)}`)
  }
  if (result.errors.length) {
    console.error(`[dependencies] ${result.errors.length} error(s)`)
    for (const error of result.errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }
  console.log(`[dependencies] baseline ${result.lastVerified}: no regression`)
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) main()
