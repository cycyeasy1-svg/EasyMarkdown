import { describe, expect, it } from 'vitest'

import {
  createFileRenamePlan,
  createHeadingRenamePlan,
  diagnoseMarkdownContent,
  findMarkdownReferences,
  resolveMarkdownTarget
} from '../src/main/markdown-links.js'

const workspaceRoots = ['/workspace']

describe('workspace-root Markdown links', () => {
  it('resolves a slash-prefixed link from the containing workspace first', () => {
    expect(
      resolveMarkdownTarget('/workspace/specs/source.md', '/docs/guide.md', { workspaceRoots })
    ).toMatchObject({
      kind: 'local',
      path: '/workspace/docs/guide.md',
      fallbackPath: '/docs/guide.md',
      workspaceRoot: '/workspace',
      rootRelative: true
    })
  })

  it('does not report an existing workspace-root target as missing', async () => {
    const problems = await diagnoseMarkdownContent({
      docPath: '/workspace/specs/source.md',
      content: '[Guide](/docs/guide.md#install)',
      workspaceRoots,
      exists: async (path) => path === '/workspace/docs/guide.md',
      readFile: async () => '# Guide\n\n## Install\n'
    })
    expect(problems).toEqual([])
  })

  it('finds references and preserves root-relative syntax during a file rename', () => {
    const files = [
      {
        path: '/workspace/specs/source.md',
        content: '[Guide](/docs/guide.md#install)\n'
      },
      {
        path: '/workspace/docs/guide.md',
        content: '# Guide\n\n## Install\n'
      }
    ]
    expect(
      findMarkdownReferences(files, '/workspace/docs/guide.md', 'install', { workspaceRoots })
    ).toHaveLength(1)

    const plan = createFileRenamePlan(
      files,
      '/workspace/docs/guide.md',
      '/workspace/docs/handbook.md',
      { workspaceRoots }
    )
    expect(plan.files).toHaveLength(1)
    expect(plan.files[0].updated).toContain('/docs/handbook.md#install')
    expect(plan.files[0].updated).not.toContain('/workspace/docs/handbook.md')
  })

  it('updates anchors reached through workspace-root links during a heading rename', () => {
    const files = [
      {
        path: '/workspace/specs/source.md',
        content: '[Guide](/docs/guide.md#install)\n'
      },
      {
        path: '/workspace/docs/guide.md',
        content: '# Guide\n\n## Install\n'
      }
    ]
    const plan = createHeadingRenamePlan(
      files,
      '/workspace/docs/guide.md',
      3,
      'Setup',
      { workspaceRoots }
    )
    expect(plan.files).toHaveLength(2)
    expect(plan.files.find((file) => file.path.endsWith('source.md')).updated)
      .toContain('/docs/guide.md#setup')
  })
})
