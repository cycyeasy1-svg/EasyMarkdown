import { describe, expect, it } from 'vitest'
import {
  createFileRenamePlan,
  findMarkdownReferences
} from '../src/main/markdown-links.js'

describe('Markdown link intelligence performance guard', () => {
  it('indexes and plans changes for a medium workspace without a long synchronous task', () => {
    const files = Array.from({ length: 600 }, (_, index) => ({
      path: `/workspace/section-${index}/note-${index}.md`,
      content: [
        `# Note ${index}`,
        '',
        '[Shared](../shared.md#api)',
        ...Array.from({ length: 12 }, (__, line) =>
          `[Local ${line}](detail-${line}.md#item)`
        )
      ].join('\n')
    }))
    files.push({
      path: '/workspace/shared.md',
      content: '# Shared\n\n## API\n'
    })

    const started = performance.now()
    const references = findMarkdownReferences(files, '/workspace/shared.md', 'api')
    const plan = createFileRenamePlan(
      files,
      '/workspace/shared.md',
      '/workspace/reference/shared api.md'
    )
    const elapsed = performance.now() - started

    expect(references).toHaveLength(600)
    expect(plan.files).toHaveLength(600)
    expect(plan.totalChanges).toBe(600)
    // Generous across CI machines, but low enough to catch an accidental
    // quadratic scan or whole-document reserialization regression.
    expect(elapsed).toBeLessThan(2000)
  })
})
