import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  extractDocumentLinks,
  githubHeadingAnchors,
  validateDocumentLinks,
  validateDocumentMetadata
} from '../scripts/check-docs.mjs'

const temporaryDirectories = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function document({ status = 'active', date = '2026-08-09' } = {}) {
  return `---
doc_version: 1
doc_status: ${status}
doc_owner: maintainers
last_verified: ${date}
---

# Example
`
}

function repository() {
  const root = mkdtempSync(join(tmpdir(), 'easymarkdown-docs-'))
  temporaryDirectories.push(root)
  mkdirSync(join(root, 'docs'), { recursive: true })
  return root
}

describe('docs as code checks', () => {
  it('accepts complete document metadata', () => {
    expect(validateDocumentMetadata({ text: document(), today: '2026-08-09' }).errors).toEqual([])
  })

  it('rejects missing metadata, future dates, and mismatched archive status', () => {
    const missing = validateDocumentMetadata({ text: '# Missing', today: '2026-08-09' })
    expect(missing.errors).toContain('docs/example.md: metadata "doc_version" が必要です')

    const invalid = validateDocumentMetadata({
      text: document({ date: '2026-08-10' }),
      path: 'docs/archive/completed.md',
      today: '2026-08-09'
    })
    expect(invalid.errors).toContain('docs/archive/completed.md: last_verified が未来日です (2026-08-10)')
    expect(invalid.errors).toContain(
      'docs/archive/completed.md: archive document の doc_status は archived です'
    )
  })

  it('ignores links in fenced and inline code', () => {
    const links = extractDocumentLinks(`
[real](./real.md)
\`[inline](./ignored.md)\`
\`\`\`md
[fenced](./ignored-too.md)
\`\`\`
`)
    expect(links).toEqual([{ target: './real.md', line: 2 }])
  })

  it('creates GitHub-compatible anchors including duplicate headings', () => {
    expect([...githubHeadingAnchors('# ✨ Hello World\n## Hello World\n## Hello World')]).toEqual([
      '-hello-world',
      'hello-world',
      'hello-world-1'
    ])
  })

  it('detects missing files and heading anchors', () => {
    const root = repository()
    writeFileSync(join(root, 'docs', 'target.md'), '# Existing heading\n', 'utf8')
    const result = validateDocumentLinks({
      repositoryRoot: root,
      sourcePath: 'docs/source.md',
      text: '[missing](./missing.md)\n[anchor](./target.md#unknown)'
    })
    expect(result.errors).toEqual([
      'docs/source.md:1: link target が存在しません (./missing.md)',
      'docs/source.md:2: heading anchor が存在しません (./target.md#unknown)'
    ])
  })

  it('accepts existing files, directories, and heading anchors', () => {
    const root = repository()
    mkdirSync(join(root, 'assets'))
    writeFileSync(join(root, 'docs', 'target.md'), '# Existing heading\n', 'utf8')
    const result = validateDocumentLinks({
      repositoryRoot: root,
      sourcePath: 'docs/source.md',
      text: '[file](./target.md#existing-heading)\n[directory](../assets/)'
    })
    expect(result.errors).toEqual([])
    expect(result.count).toBe(2)
  })

  it('rejects repository escapes and platform-specific separators', () => {
    const root = repository()
    const result = validateDocumentLinks({
      repositoryRoot: root,
      sourcePath: 'docs/source.md',
      text: '[outside](../../outside.md)\n[separator](.\\target.md)'
    })
    expect(result.errors).toEqual([
      'docs/source.md:1: repository 外を参照しています (../../outside.md)',
      'docs/source.md:2: local link は / 区切りにしてください (.\\target.md)'
    ])
  })

  it('rejects link path casing that would fail on a case-sensitive runner', () => {
    const root = repository()
    writeFileSync(join(root, 'docs', 'Target.md'), '# Target\n', 'utf8')
    const result = validateDocumentLinks({
      repositoryRoot: root,
      sourcePath: 'docs/source.md',
      text: '[target](./target.md)'
    })
    expect(result.errors).toEqual([
      'docs/source.md:1: link path の大文字小文字が一致しません (./target.md)'
    ])
  })
})
