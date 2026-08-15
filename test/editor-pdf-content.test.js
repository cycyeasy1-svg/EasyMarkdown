// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createEditorSnapshot } from '../src/renderer/src/components/editor-pdf-content.js'

const mockView = (root, codeSource = '') => ({
  dom: root,
  posAtDOM: () => {
    throw new Error('CodeMirror shields DOM mapping')
  },
  state: {
    doc: {
      descendants(callback) {
        if (codeSource)
          callback(
            {
              type: { name: 'code_block' },
              attrs: { language: 'javascript' },
              textContent: codeSource
            },
            0
          )
      }
    }
  }
})

describe('createEditorSnapshot', () => {
  it('uses the complete ProseMirror code node instead of virtualized CodeMirror lines', async () => {
    const root = document.createElement('div')
    root.innerHTML =
      '<div class="milkdown-code-block"><div class="cm-editor">' +
      '<div class="cm-line">line-1</div><div class="cm-line">line-2</div></div></div>'
    const source = Array.from({ length: 200 }, (_, index) => `line-${index + 1}`).join('\n')
    const html = await createEditorSnapshot(mockView(root, source))
    expect(html).toContain('line-200')
    expect(html).toContain('<pre class="hm-code-block"><code class="hm-code-lines">')
    expect(html.match(/class="hm-code-line"/g)).toHaveLength(200)
    expect(html).not.toContain('hm-code-line-num')
  })

  it('preserves intentional empty and trailing source lines in PDF code rows', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<div class="milkdown-code-block"></div>'
    const html = await createEditorSnapshot(mockView(root, 'first\n\nlast\n'))

    expect(html.match(/class="hm-code-line"/g)).toHaveLength(4)
    expect(html).toContain('<span class="hm-code-line-text"></span>')
  })

  it('creates fixed-width image placeholders for staged PDF resources', async () => {
    const root = document.createElement('div')
    root.innerHTML = Array.from(
      { length: 12 },
      (_, index) => `<img src="file:///tmp/image-${index + 1}.png">`
    ).join('')
    const snapshot = await createEditorSnapshot(mockView(root), { stageImages: true })
    expect(snapshot.images).toHaveLength(12)
    expect(snapshot.images[0].placeholder).toBe('horsemd-pdf-resource-0001')
    expect(snapshot.images[11].placeholder).toBe('horsemd-pdf-resource-0012')
  })
})
