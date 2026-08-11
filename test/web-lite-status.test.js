import { describe, expect, it } from 'vitest'
import { buildLiteStatusPath, isLiteDocumentDirty } from '../packages/web-lite/src/status.js'

describe('web-lite status bar', () => {
  it('shows the granted folder name with the relative document path', () => {
    const workspace = { id: 'workspace-1', name: 'wiki' }
    const tab = {
      name: 'pilot.md',
      relativePath: 'synthesis/CM0001/pilot.md',
      workspaceId: workspace.id
    }

    expect(buildLiteStatusPath(tab, workspace)).toBe('wiki\\synthesis\\CM0001\\pilot.md')
  })

  it('falls back to the browser-visible file name for a standalone file', () => {
    expect(buildLiteStatusPath({ name: 'notes.md', relativePath: null }, null)).toBe('notes.md')
  })

  it('normalizes mixed path separators for display', () => {
    const workspace = { id: 'workspace-1', handle: { name: 'docs' } }
    const tab = {
      name: 'guide.md',
      relativePath: 'team\\handbook/guide.md',
      workspaceId: workspace.id
    }

    expect(buildLiteStatusPath(tab, workspace, '/')).toBe('docs/team/handbook/guide.md')
  })

  it('includes unapplied source-panel edits in the unsaved state', () => {
    const tab = { id: 'tab-1', content: '# Saved', savedContent: '# Saved' }
    expect(isLiteDocumentDirty(tab, null)).toBe(false)
    expect(
      isLiteDocumentDirty(tab, {
        tabId: tab.id,
        original: '# Saved',
        draft: '# Changed'
      })
    ).toBe(true)
  })

  it('ignores a source draft belonging to another tab', () => {
    const tab = { id: 'tab-1', content: '# Saved', savedContent: '# Saved' }
    expect(
      isLiteDocumentDirty(tab, {
        tabId: 'tab-2',
        original: '# Saved',
        draft: '# Changed'
      })
    ).toBe(false)
  })
})
