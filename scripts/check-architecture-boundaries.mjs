import { readdirSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { extname, posix, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from 'espree'

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'])
const LAYER_ORDER = ['main', 'preload', 'renderer', 'shared', 'platform']
const INTERNAL_TARGETS = Object.freeze({
  main: new Set(['main', 'shared']),
  preload: new Set(['preload', 'shared']),
  renderer: new Set(['renderer', 'shared']),
  shared: new Set(['shared']),
  platform: new Set(['platform', 'shared'])
})
const NODE_BUILTINS = new Set(builtinModules.flatMap((name) => [name, name.replace(/^node:/, '')]))

const normalizeRepositoryPath = (value) =>
  String(value || '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')

export function classifyArchitecturePath(filePath) {
  const normalized = normalizeRepositoryPath(filePath)
  if (normalized.startsWith('src/renderer/src/platform/')) return 'platform'
  if (normalized.startsWith('src/main/')) return 'main'
  if (normalized.startsWith('src/preload/')) return 'preload'
  if (normalized.startsWith('src/renderer/')) return 'renderer'
  if (normalized.startsWith('src/shared/')) return 'shared'
  return null
}

export function extractImportSpecifiers(sourceText, fileName = 'source.js') {
  const imports = []
  const errors = []
  let sourceFile
  try {
    sourceFile = parse(String(sourceText), {
      ecmaVersion: 'latest',
      sourceType: fileName.endsWith('.cjs') ? 'script' : 'module',
      ecmaFeatures: { jsx: true },
      loc: true
    })
  } catch (error) {
    const line = Number(error?.lineNumber) || 1
    const column = Number(error?.column) || 1
    return {
      imports,
      errors: [`${fileName}:${line}:${column}: parse error: ${error?.message || error}`]
    }
  }

  const addLiteral = (node, kind) => {
    const location = {
      line: node?.loc?.start?.line || 1,
      column: (node?.loc?.start?.column || 0) + 1
    }
    if (node?.type !== 'Literal' || typeof node.value !== 'string') {
      errors.push(
        `${fileName}:${location.line}:${location.column}: ${kind} の specifier は string literal が必要です`
      )
      return
    }
    imports.push({ specifier: node.value, kind, ...location })
  }

  const visit = (node) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'ImportDeclaration') {
      addLiteral(node.source, 'import')
    } else if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') {
      if (node.source) addLiteral(node.source, 'export')
    } else if (node.type === 'ImportExpression') {
      addLiteral(node.source, 'import()')
    } else if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === 'require'
    ) {
      const kind = 'require()'
      const argument = node.arguments[0]
      if (node.arguments.length !== 1 || !argument) {
        const location = {
          line: node.loc?.start?.line || 1,
          column: (node.loc?.start?.column || 0) + 1
        }
        errors.push(
          `${fileName}:${location.line}:${location.column}: ${kind} は一つの string literal を必要とします`
        )
      } else {
        addLiteral(argument, kind)
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) visit(child)
      } else if (value && typeof value === 'object' && value.type) {
        visit(value)
      }
    }
  }

  visit(sourceFile)
  return { imports, errors }
}

function isNodeBuiltin(specifier) {
  const value = specifier.replace(/^node:/, '')
  const root = value.split('/')[0]
  return specifier.startsWith('node:') || NODE_BUILTINS.has(value) || NODE_BUILTINS.has(root)
}

function isElectronPackage(specifier) {
  return specifier === 'electron' || specifier.startsWith('electron/')
}

function isCapacitorPackage(specifier) {
  return (
    specifier.startsWith('@capacitor/') ||
    specifier === '@capawesome/capacitor-file-picker' ||
    specifier.startsWith('@capawesome/capacitor-file-picker/')
  )
}

function isPlatformPublicEntry(targetPath) {
  return targetPath.replace(/\.(?:[cm]?[jt]sx?)$/, '') === 'src/renderer/src/platform/index'
}

function architectureError(importerPath, line, message, specifier) {
  return `${importerPath}:${line}: ${message} (${specifier})`
}

function validateInternalImport({ importerPath, importerLayer, specifier, line }) {
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0]
  const targetPath = specifier.startsWith('src/')
    ? posix.normalize(cleanSpecifier)
    : posix.normalize(posix.join(posix.dirname(importerPath), cleanSpecifier))
  const targetLayer = classifyArchitecturePath(targetPath)

  if (!targetLayer) {
    return [
      architectureError(
        importerPath,
        line,
        '管理対象 layer 外への local import は禁止です',
        specifier
      )
    ]
  }

  if (importerLayer === 'renderer' && targetLayer === 'platform') {
    if (isPlatformPublicEntry(targetPath)) return []
    return [
      architectureError(
        importerPath,
        line,
        'renderer は platform public entry だけを import できます',
        specifier
      )
    ]
  }

  if (INTERNAL_TARGETS[importerLayer]?.has(targetLayer)) return []
  return [
    architectureError(
      importerPath,
      line,
      `${importerLayer} から ${targetLayer} への import は禁止です`,
      specifier
    )
  ]
}

function validateExternalImport({ importerPath, importerLayer, specifier, line }) {
  const nodeBuiltin = isNodeBuiltin(specifier)
  const electron = isElectronPackage(specifier)
  const capacitor = isCapacitorPackage(specifier)

  if (importerLayer === 'shared') {
    return [
      architectureError(
        importerPath,
        line,
        'shared は外部 package／runtime module を import できません',
        specifier
      )
    ]
  }
  if (nodeBuiltin && importerLayer !== 'main') {
    return [
      architectureError(
        importerPath,
        line,
        'Node.js builtin は main layer だけが import できます',
        specifier
      )
    ]
  }
  if (electron && importerLayer !== 'main' && importerLayer !== 'preload') {
    return [
      architectureError(
        importerPath,
        line,
        'electron package は main／preload layer だけが import できます',
        specifier
      )
    ]
  }
  if (capacitor && importerLayer !== 'platform') {
    return [
      architectureError(
        importerPath,
        line,
        'Capacitor package は platform adapter だけが import できます',
        specifier
      )
    ]
  }
  if (importerLayer === 'preload' && !electron) {
    return [
      architectureError(
        importerPath,
        line,
        'preload の外部 dependency は electron だけに限定します',
        specifier
      )
    ]
  }
  if (importerLayer === 'platform' && !capacitor) {
    return [
      architectureError(
        importerPath,
        line,
        'platform adapter の外部 dependency は承認済み Capacitor package だけに限定します',
        specifier
      )
    ]
  }
  return []
}

export function validateArchitectureImport({ importerPath, specifier, line = 1 }) {
  const normalizedImporter = normalizeRepositoryPath(importerPath)
  const importerLayer = classifyArchitecturePath(normalizedImporter)
  if (!importerLayer) {
    return [
      architectureError(
        normalizedImporter,
        line,
        'importer の architecture layer を判定できません',
        specifier
      )
    ]
  }

  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('src/')) {
    return validateInternalImport({
      importerPath: normalizedImporter,
      importerLayer,
      specifier,
      line
    })
  }
  return validateExternalImport({
    importerPath: normalizedImporter,
    importerLayer,
    specifier,
    line
  })
}

function collectSourceFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...collectSourceFiles(path))
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      files.push(path)
    }
  }
  return files
}

export function checkArchitectureRepository(root = process.cwd()) {
  const repositoryRoot = resolve(root)
  const sourceRoot = resolve(repositoryRoot, 'src')
  const files = collectSourceFiles(sourceRoot).sort()
  const errors = []
  const layerCounts = Object.fromEntries(LAYER_ORDER.map((layer) => [layer, 0]))
  let importCount = 0

  for (const absolutePath of files) {
    const importerPath = normalizeRepositoryPath(relative(repositoryRoot, absolutePath))
    const layer = classifyArchitecturePath(importerPath)
    if (!layer) continue
    layerCounts[layer] += 1
    if (/\.tsx?$/.test(importerPath)) {
      errors.push(`${importerPath}: TypeScript source parser の追加が必要です`)
      continue
    }
    const result = extractImportSpecifiers(readFileSync(absolutePath, 'utf8'), importerPath)
    errors.push(...result.errors)
    importCount += result.imports.length
    for (const imported of result.imports) {
      errors.push(
        ...validateArchitectureImport({
          importerPath,
          specifier: imported.specifier,
          line: imported.line
        })
      )
    }
  }

  return {
    errors: [...new Set(errors)].sort(),
    fileCount: Object.values(layerCounts).reduce((sum, count) => sum + count, 0),
    importCount,
    layerCounts
  }
}

function main() {
  const result = checkArchitectureRepository()
  if (result.errors.length) {
    console.error(`[architecture] ${result.errors.length} error(s)`)
    for (const error of result.errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }
  const layers = LAYER_ORDER.map((layer) => `${layer}=${result.layerCounts[layer]}`).join(' / ')
  console.log(
    `[architecture] ${result.fileCount} files / ${result.importCount} imports / ${layers}: OK`
  )
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) main()
