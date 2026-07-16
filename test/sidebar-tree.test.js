import { describe, expect, it } from 'vitest'
import { selectMarkdownBranches } from '../src/renderer/src/sidebar-tree.js'

describe('selectMarkdownBranches', () => {
  it('expands only directories that contain Markdown directly or below them', () => {
    const tree = {
      'C:/workspace': [
        { name: 'docs', path: 'C:/workspace/docs', type: 'dir' },
        { name: 'empty', path: 'C:/workspace/empty', type: 'dir' },
        { name: 'assets', path: 'C:/workspace/assets', type: 'dir' }
      ],
      'C:/workspace/docs': [
        { name: 'nested', path: 'C:/workspace/docs/nested', type: 'dir' }
      ],
      'C:/workspace/docs/nested': [
        { name: 'guide.md', path: 'C:/workspace/docs/nested/guide.md', type: 'file' }
      ],
      'C:/workspace/empty': [],
      'C:/workspace/assets': [
        { name: 'logo.png', path: 'C:/workspace/assets/logo.png', type: 'file' }
      ]
    }

    const result = selectMarkdownBranches(tree, ['C:/workspace'])

    expect([...result.expanded]).toEqual([
      'C:/workspace',
      'C:/workspace/docs',
      'C:/workspace/docs/nested'
    ])
    expect(Object.keys(result.childrenMap)).toEqual([
      'C:/workspace',
      'C:/workspace/docs',
      'C:/workspace/docs/nested'
    ])
    expect(result.markdownDirectoryCount).toBe(3)
  })

  it('keeps an empty workspace root loaded without expanding its empty descendants', () => {
    const tree = {
      'C:\\workspace': [
        { name: 'empty', path: 'C:\\workspace\\empty', type: 'dir' }
      ],
      'C:\\workspace\\empty': []
    }

    const result = selectMarkdownBranches(tree, ['C:\\workspace'])

    expect([...result.expanded]).toEqual(['C:\\workspace'])
    expect(result.childrenMap).toEqual({
      'C:\\workspace': tree['C:\\workspace']
    })
    expect(result.markdownDirectoryCount).toBe(0)
  })

  it('treats markdown, mdx, and case-insensitive extensions as Markdown', () => {
    const tree = {
      '/workspace': [
        { name: 'notes', path: '/workspace/notes', type: 'dir' }
      ],
      '/workspace/notes': [
        { name: 'README.MDX', path: '/workspace/notes/README.MDX', type: 'file' }
      ]
    }

    const result = selectMarkdownBranches(tree, ['/workspace'])

    expect(result.expanded.has('/workspace/notes')).toBe(true)
  })
})
