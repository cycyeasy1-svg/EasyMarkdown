import { describe, expect, it } from 'vitest'
import linkPath from '../packages/vscode-extension/src/linkPath.js'

const { parseWorkspaceRootLink } = linkPath

describe('VS Code workspace-root Markdown links', () => {
  it('parses slash-prefixed repository links into workspace URI segments', () => {
    expect(parseWorkspaceRootLink('/docs/guide.md')).toEqual({
      valid: true,
      segments: ['docs', 'guide.md']
    })
  })

  it('normalizes harmless dot segments but rejects workspace escapes', () => {
    expect(parseWorkspaceRootLink('/docs/./design/../guide.md')).toEqual({
      valid: true,
      segments: ['docs', 'guide.md']
    })
    expect(parseWorkspaceRootLink('/../secret.md')).toEqual({ valid: false, segments: [] })
  })

  it('leaves ordinary relative and UNC-style links to their existing resolvers', () => {
    expect(parseWorkspaceRootLink('../guide.md')).toBeNull()
    expect(parseWorkspaceRootLink('//server/share/guide.md')).toBeNull()
  })
})
