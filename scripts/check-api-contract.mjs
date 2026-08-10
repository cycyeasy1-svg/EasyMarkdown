import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from 'acorn'
import {
  CAPABILITY_KEYS,
  CAPABILITY_METHODS,
  CORE_API_METHODS,
  DESKTOP_CAPABILITIES,
  MOBILE_CAPABILITIES
} from '../src/shared/api-contract.js'

function walk(node, visitor) {
  if (!node || typeof node !== 'object') return
  visitor(node)
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visitor)
    } else if (value && typeof value === 'object') {
      walk(value, visitor)
    }
  }
}

function propertyName(node) {
  if (node?.type === 'Identifier') return node.name
  if (node?.type === 'Literal') return String(node.value)
  return null
}

export function extractObjectLiteralKeys(sourceText, variableName = 'api', fileName = 'source.js') {
  const source = parse(sourceText, { ecmaVersion: 'latest', sourceType: 'module' })
  const matches = []
  walk(source, (node) => {
    if (
      node.type === 'VariableDeclarator' &&
      node.id?.type === 'Identifier' &&
      node.id.name === variableName &&
      node.init?.type === 'ObjectExpression'
    ) {
      matches.push(node.init)
    }
  })

  if (matches.length !== 1) {
    return {
      keys: [],
      errors: [`${fileName}: const ${variableName} object が ${matches.length} 件あります（1 件必要）`]
    }
  }

  const keys = []
  const errors = []
  for (const member of matches[0].properties) {
    if (member.type === 'SpreadElement') {
      errors.push(`${fileName}: ${variableName} object の spread property は検査できません`)
      continue
    }
    if (member.type !== 'Property' || !member.key) {
      errors.push(`${fileName}: ${variableName} object に名前のない member があります`)
      continue
    }
    if (member.computed) {
      errors.push(`${fileName}: ${variableName} object の computed property は検査できません`)
      continue
    }
    const name = propertyName(member.key)
    if (!name) {
      errors.push(`${fileName}: ${variableName} object の property name を検査できません`)
      continue
    }
    keys.push(name)
  }
  return { keys: [...new Set(keys)].sort(), errors }
}

export function extractObjectPropertyIdentifier(sourceText, variableName, propertyKey) {
  const source = parse(sourceText, { ecmaVersion: 'latest', sourceType: 'module' })
  let value = null
  walk(source, (node) => {
    if (
      node.type !== 'VariableDeclarator' ||
      node.id?.type !== 'Identifier' ||
      node.id.name !== variableName ||
      node.init?.type !== 'ObjectExpression'
    ) return
    for (const member of node.init.properties) {
      if (
        member.type === 'Property' &&
        !member.computed &&
        propertyName(member.key) === propertyKey &&
        member.value?.type === 'Identifier'
      ) {
        value = member.value.name
      }
    }
  })
  return value
}

export function requiredApiKeys(capabilities) {
  const keys = new Set(['platform', 'safeMode', 'capabilities', ...CORE_API_METHODS])
  for (const key of CAPABILITY_KEYS) {
    if (!capabilities[key]) continue
    for (const method of CAPABILITY_METHODS[key]) keys.add(method)
  }
  return [...keys].sort()
}

function hasRuntimeAssertion(sourceText, variableName = 'api') {
  const source = parse(sourceText, { ecmaVersion: 'latest', sourceType: 'module' })
  let found = false
  walk(source, (node) => {
    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === 'assertApiContract' &&
      node.arguments?.[0]?.type === 'Identifier' &&
      node.arguments[0].name === variableName
    ) {
      found = true
    }
  })
  return found
}

export function validateApiSource(
  sourceText,
  capabilities,
  label,
  fileName = label,
  expectedCapabilitiesIdentifier = null
) {
  const extracted = extractObjectLiteralKeys(sourceText, 'api', fileName)
  const errors = [...extracted.errors]
  const actual = new Set(extracted.keys)
  for (const key of requiredApiKeys(capabilities)) {
    if (!actual.has(key)) errors.push(`${fileName}: ${label} API に "${key}" がありません`)
  }
  if (!hasRuntimeAssertion(sourceText)) {
    errors.push(`${fileName}: assertApiContract(api, ...) の runtime assertion がありません`)
  }
  if (expectedCapabilitiesIdentifier) {
    const actualIdentifier = extractObjectPropertyIdentifier(sourceText, 'api', 'capabilities')
    if (actualIdentifier !== expectedCapabilitiesIdentifier) {
      errors.push(
        `${fileName}: capabilities は ${expectedCapabilitiesIdentifier} を直接参照する必要があります`
      )
    }
  }
  return { keys: extracted.keys, errors }
}

export function checkPlatformApiRepository(root = process.cwd()) {
  const repositoryRoot = resolve(root)
  const targets = [
    {
      label: 'desktop',
      path: 'src/preload/index.js',
      capabilities: DESKTOP_CAPABILITIES,
      capabilitiesIdentifier: 'DESKTOP_CAPABILITIES'
    },
    {
      label: 'mobile',
      path: 'src/renderer/src/platform/capacitor-api.js',
      capabilities: MOBILE_CAPABILITIES,
      capabilitiesIdentifier: 'MOBILE_CAPABILITIES'
    }
  ]
  const errors = []
  const results = []
  for (const target of targets) {
    const source = readFileSync(resolve(repositoryRoot, target.path), 'utf8')
    const result = validateApiSource(
      source,
      target.capabilities,
      target.label,
      target.path,
      target.capabilitiesIdentifier
    )
    errors.push(...result.errors)
    results.push({ label: target.label, path: target.path, keyCount: result.keys.length })
  }
  return { errors, results }
}

function main() {
  const result = checkPlatformApiRepository()
  if (result.errors.length) {
    console.error(`[api-contract] ${result.errors.length} error(s)`)
    for (const error of result.errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }
  console.log(
    `[api-contract] ${result.results.map((item) => `${item.label}=${item.keyCount}`).join(' / ')} ` +
    `/ capabilities=${CAPABILITY_KEYS.length}: OK`
  )
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) main()
