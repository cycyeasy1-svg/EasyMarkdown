// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const posts = []
const state = {}

beforeAll(async () => {
  document.body.innerHTML = '<div class="editor-scroll"><main id="km-host" class="km-doc"></main></div>'
  globalThis.acquireVsCodeApi = () => ({
    postMessage(message) {
      posts.push(message)
    },
    getState() {
      return state
    },
    setState(next) {
      Object.keys(state).forEach((key) => delete state[key])
      Object.assign(state, next || {})
    }
  })
  globalThis.ResizeObserver ||= class {
    observe() {}
    disconnect() {}
  }
  globalThis.IntersectionObserver ||= class {
    observe() {}
    disconnect() {}
  }
  Element.prototype.scrollIntoView ||= function () {}
  await import('../packages/vscode-extension/webview/main.js')
})

const waitForPaint = () => new Promise((resolve) => setTimeout(resolve, 25))

function send(message) {
  window.dispatchEvent(new MessageEvent('message', { data: message }))
}

function paste(target, text) {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: {
      items: [],
      getData(type) {
        return type === 'text/plain' ? text : ''
      }
    }
  })
  target.dispatchEvent(event)
}

describe('VSCode Keep webview interactions', () => {
  it('keeps long table headers wider than short body content', async () => {
    const header = '表示条件与活动范围及计算方法和必要步骤与最终结果'
    send({
      type: 'init',
      text: [`| ${header} |`, '| --- |', '| - |'].join('\n'),
      lang: 'zh',
      langPref: 'zh',
      theme: 'auto'
    })
    await waitForPaint()

    const width = parseFloat(document.querySelector('table.km-table col')?.style.width || '0')
    expect(width).toBeGreaterThan(22)
    expect(width).toBeGreaterThanOrEqual(Array.from(header).length + 5)
  })

  it('uses rendered link labels for automatic table column widths', async () => {
    send({
      type: 'init',
      text: [
        '| A | B |',
        '| --- | --- |',
        '| 短 | [短](https://example.com/a(b)some-very-long-suffix-that-is-only-in-target) |'
      ].join('\n'),
      lang: 'en',
      langPref: 'en',
      theme: 'auto'
    })
    await waitForPaint()

    const widths = [...document.querySelectorAll('table.km-table col')].map((col) => col.style.width)
    expect(widths).toEqual(['6em', '6em'])
  })

  it('renders and navigates to an explicit empty anchor inside a table cell', async () => {
    send({
      type: 'init',
      text: [
        '| Event | ID |',
        '| --- | --- |',
        '| Init | <a id="def-bhv-099"></a>[BHV-099](#def-bhv-099) |'
      ].join('\n'),
      lang: 'en',
      langPref: 'en',
      theme: 'auto'
    })
    await waitForPaint()

    const anchor = document.querySelector('tbody td a#def-bhv-099')
    expect(anchor).not.toBeNull()
    expect(anchor.textContent).toBe('')
    expect(anchor.parentElement.textContent).toBe('BHV-099')
    expect(anchor.parentElement.innerHTML).not.toContain('&lt;a')

    const scroll = vi.spyOn(anchor, 'scrollIntoView').mockImplementation(() => {})
    send({ type: 'scrollToAnchor', slug: 'def-bhv-099' })
    expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('persists the Keep viewport without dropping an unfinished draft', async () => {
    state.draft = { version: 1, kind: 'block', value: 'unfinished' }
    const scroller = document.querySelector('.editor-scroll')
    scroller.scrollTop = 420
    scroller.dispatchEvent(new Event('scroll'))
    await new Promise((resolve) => setTimeout(resolve, 150))

    expect(state.scroll).toMatchObject({ top: 420 })
    expect(state.draft).toEqual({ version: 1, kind: 'block', value: 'unfinished' })
    expect(posts).toContainEqual({
      type: 'viewport',
      scroll: expect.objectContaining({ top: 420 })
    })
    delete state.draft
  })

  it('shows candidate counts within the other columns\' filter context', async () => {
    send({
      type: 'init',
      text: [
        '| fruit | color |',
        '| --- | --- |',
        '| apple | red |',
        '| banana | yellow |',
        '| cherry | red |',
        '| grape | purple |'
      ].join('\n'),
      lang: 'en',
      langPref: 'en',
      theme: 'auto'
    })
    await waitForPaint()

    document.querySelector('.km-filter-btn[data-ci="0"]').click()
    document.querySelector('.km-fp-list input[data-v="banana"]').checked = false
    document.querySelector('.km-fp-actions .ok').click()
    document.querySelector('.km-filter-btn[data-ci="1"]').click()

    const labels = [...document.querySelectorAll('.km-fp-list label')]
    const countFor = (value) =>
      labels
        .find((label) => label.querySelector('input')?.dataset.v === value)
        ?.querySelector('.km-fp-count')?.textContent
    expect(countFor('red')).toBe('(2)')
    expect(countFor('purple')).toBe('(1)')
    expect(countFor('yellow')).toBeUndefined()
  })

  it('supports keyboard table work, TSV paste, draft rebase, and guarded source switching', async () => {
    send({
      type: 'init',
      text: ['# Title', '', '| A | B | C |', '| --- | --- | --- |', '| a | b | c |', '| d | e | f |'].join('\n'),
      lang: 'en',
      langPref: 'en',
      theme: 'auto'
    })
    await waitForPaint()

    const table = document.querySelector('table.km-table')
    expect(table?.getAttribute('role')).toBe('grid')
    table.querySelector('th[data-ci="0"]').click()
    expect(document.querySelector('th.km-cell-selected')?.getAttribute('data-ci')).toBe('0')

    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(document.querySelector('th.km-cell-selected')?.getAttribute('data-ci')).toBe('1')

    const selected = document.querySelector('th.km-cell-selected')
    paste(selected, 'X\tY\nZ\tW')
    await waitForPaint()
    const pasteEdit = posts.filter((message) => message.type === 'replaceLines').at(-1)
    expect(pasteEdit).toMatchObject({ startLine: 2, endLine: 4 })
    expect(pasteEdit.lines.join('\n')).toContain('| A | X | Y |')

    const cell = document.querySelector('tbody td[data-ci="1"]')
    cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    const editor = document.querySelector('.km-cell-pop textarea')
    editor.value = 'unfinished draft'
    editor.dispatchEvent(new Event('input', { bubbles: true }))

    send({
      type: 'update',
      text: ['new external heading', '# Title', '', '| A | X | Y |', '| --- | --- | --- |', '| a | Z | W |', '| d | e | f |'].join('\n')
    })
    await waitForPaint()
    expect(document.querySelector('.km-cell-pop textarea')?.value).toBe('unfinished draft')

    document.querySelector('.km-source-btn').click()
    expect(document.querySelector('.hm-rename-modal')).not.toBeNull()
    expect(posts.some((message) => message.type === 'switchToSource')).toBe(false)

    document.querySelector('.hm-rename-actions .primary').click()
    expect(posts.at(-1)?.type).toBe('switchToSource')
  })
})

afterAll(() => {
  delete globalThis.acquireVsCodeApi
  vi.restoreAllMocks()
})
