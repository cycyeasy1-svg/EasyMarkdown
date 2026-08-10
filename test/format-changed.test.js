import { describe, expect, it } from 'vitest'
import {
  isAllowedFormatBase,
  isSupportedFormatPath,
  parseGitPathList,
  selectFormatCandidates
} from '../scripts/format-changed.mjs'

describe('incremental formatter candidate selection', () => {
  it('parses NUL-delimited Git paths without breaking spaces or Unicode', () => {
    expect(parseGitPathList('src/a.js\0docs/日本 語.yml\0')).toEqual([
      'src/a.js',
      'docs/日本 語.yml'
    ])
  })

  it('accepts source and config formats but not prose or native formats', () => {
    expect(isSupportedFormatPath('src/App.jsx')).toBe(true)
    expect(isSupportedFormatPath('.github/workflows/ci.yml')).toBe(true)
    expect(isSupportedFormatPath('docs/design.md')).toBe(false)
    expect(isSupportedFormatPath('ios/App.swift')).toBe(false)
  })

  it('accepts CI commit bases without treating arbitrary options as refs', () => {
    expect(isAllowedFormatBase('a38c3f878c1ab90d52c8056c7d58b8558a4e75a8')).toBe(true)
    expect(isAllowedFormatBase('HEAD^')).toBe(true)
    expect(isAllowedFormatBase('--output=/tmp/result')).toBe(false)
  })

  it('normalizes and de-duplicates candidates deterministically', () => {
    const existing = new Set(['src/a.js', 'src/b.json'])
    expect(
      selectFormatCandidates(['./src/b.json', 'src\\a.js', 'src/a.js'], {
        exists: (path) => existing.has(path)
      })
    ).toEqual(['src/a.js', 'src/b.json'])
  })

  it('excludes ignored, deleted, unsupported, and repository-external paths', () => {
    expect(
      selectFormatCandidates(
        ['src/keep.js', 'src/ignored.js', 'src/deleted.js', 'README.md', '../outside.js'],
        {
          exists: (path) => path !== 'src/deleted.js',
          ignored: (path) => path === 'src/ignored.js'
        }
      )
    ).toEqual(['src/keep.js'])
  })
})
