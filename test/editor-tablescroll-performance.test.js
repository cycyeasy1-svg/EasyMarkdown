// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enhanceKeepTables } from '../src/renderer/src/components/editor-tablescroll.js'

function makeTable({ rows = 8, columns = 4, host: targetHost = null, tableIndex = 0 } = {}) {
  const host = targetHost || document.createElement('div')
  host.className = 'km-doc'
  const wrap = document.createElement('div')
  wrap.className = 'km-table-wrap'
  const table = document.createElement('table')
  table.className = 'km-table'
  table.dataset.ti = String(tableIndex)

  const colgroup = document.createElement('colgroup')
  for (let ci = 0; ci < columns; ci++) {
    const col = document.createElement('col')
    col.style.width = `${120 + ci}px`
    colgroup.appendChild(col)
  }

  const thead = document.createElement('thead')
  const headerRow = document.createElement('tr')
  for (let ci = 0; ci < columns; ci++) {
    const th = document.createElement('th')
    th.dataset.ci = String(ci)
    th.innerHTML = `<span class="km-th-flex"><span class="km-th-content">C${ci}</span></span>`
    headerRow.appendChild(th)
  }
  thead.appendChild(headerRow)

  const tbody = document.createElement('tbody')
  for (let ri = 0; ri < rows; ri++) {
    const tr = document.createElement('tr')
    for (let ci = 0; ci < columns; ci++) {
      const td = document.createElement('td')
      td.dataset.ci = String(ci)
      td.textContent = `${ri}:${ci}`
      tr.appendChild(td)
    }
    tbody.appendChild(tr)
  }

  table.append(colgroup, thead, tbody)
  wrap.appendChild(table)
  host.appendChild(wrap)
  if (!targetHost) document.body.appendChild(host)
  return { host, wrap, table, thead }
}

function mockStickyTable({ host, wrap, table, thead }, { left = 280, width = 520 } = {}) {
  Object.defineProperties(wrap, {
    clientWidth: { configurable: true, get: () => width },
    clientLeft: { configurable: true, get: () => 1 }
  })
  Object.defineProperties(table, {
    offsetWidth: { configurable: true, get: () => 720 },
    scrollWidth: { configurable: true, get: () => 720 }
  })
  vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
    top: 60,
    bottom: 700,
    left: 0,
    right: 900,
    width: 900,
    height: 640
  })
  vi.spyOn(thead, 'getBoundingClientRect').mockReturnValue({
    top: 20,
    bottom: 52,
    left,
    right: left + width,
    width,
    height: 32
  })
  vi.spyOn(table, 'getBoundingClientRect').mockReturnValue({
    top: 20,
    bottom: 900,
    left,
    right: left + 720,
    width: 720,
    height: 880
  })
  vi.spyOn(wrap, 'getBoundingClientRect').mockReturnValue({
    top: 20,
    bottom: 900,
    left,
    right: left + width,
    width,
    height: 880
  })
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('keep-table initialization performance guards', () => {
  it('does not replay an empty column state across every cell or force host style', () => {
    const { host, table } = makeTable()
    const cells = [...table.querySelectorAll('th[data-ci], td[data-ci]')]
    const toggles = cells.map((cell) => vi.spyOn(cell.classList, 'toggle'))
    const getComputedStyle = vi.spyOn(window, 'getComputedStyle')

    const controls = enhanceKeepTables(host, host)

    expect(
      toggles.flatMap((spy) => spy.mock.calls).filter(([name]) => name === 'km-col-hidden')
    ).toHaveLength(0)
    expect(getComputedStyle.mock.calls.some(([element]) => element === host)).toBe(false)
    controls.destroy()
  })

  it('still restores an actual hidden-column state', () => {
    const { host, table } = makeTable({ rows: 2, columns: 3 })
    const controls = enhanceKeepTables(host, host, {
      columnState: {
        0: { colCount: 3, widths: {}, hidden: new Set([1]) }
      }
    })

    expect(
      [...table.querySelectorAll('th[data-ci="1"], td[data-ci="1"]')].every((cell) =>
        cell.classList.contains('km-col-hidden')
      )
    ).toBe(true)
    expect(
      [...table.querySelectorAll('th[data-ci="0"], td[data-ci="0"]')].some((cell) =>
        cell.classList.contains('km-col-hidden')
      )
    ).toBe(false)
    controls.destroy()
  })

  it('bridges floating-header clicks and context menus to the live header', () => {
    const fixture = makeTable({ rows: 2, columns: 3 })
    const { host, table } = fixture
    mockStickyTable(fixture)
    const onHeaderClick = vi.fn((liveTh) => liveTh.classList.add('km-cell-selected'))
    const onHeaderContextMenu = vi.fn((liveTh, _clonedTh, event) => {
      liveTh.classList.add('km-cell-selected')
      event.preventDefault()
    })
    const controls = enhanceKeepTables(host, host, { onHeaderClick, onHeaderContextMenu })
    const liveTh = table.querySelector('th[data-ci="1"]')
    const clonedTh = document.querySelector('.km-float-header th[data-ci="1"]')
    const content = clonedTh.querySelector('.km-th-content')

    content.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onHeaderClick).toHaveBeenCalledWith(liveTh, clonedTh, expect.any(MouseEvent))
    expect(clonedTh.classList.contains('km-cell-selected')).toBe(true)

    liveTh.classList.remove('km-cell-selected')
    controls.refreshSelection()
    expect(clonedTh.classList.contains('km-cell-selected')).toBe(false)

    const menuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 24,
      clientY: 36
    })
    content.dispatchEvent(menuEvent)
    expect(onHeaderContextMenu).toHaveBeenCalledWith(
      liveTh,
      clonedTh,
      expect.objectContaining({ clientX: 24, clientY: 36 })
    )
    expect(menuEvent.defaultPrevented).toBe(true)
    expect(clonedTh.classList.contains('km-cell-selected')).toBe(true)
    controls.destroy()
  })

  it('shares one floating layer and one resize observer across many offscreen tables', () => {
    let resizeObservers = 0
    class ResizeObserverMock {
      constructor() {
        resizeObservers++
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)

    const host = document.createElement('div')
    document.body.appendChild(host)
    let tableWidthReads = 0
    for (let tableIndex = 0; tableIndex < 24; tableIndex++) {
      const { table } = makeTable({
        host,
        tableIndex,
        rows: 3,
        columns: 4
      })
      Object.defineProperty(table, 'scrollWidth', {
        configurable: true,
        get: () => {
          tableWidthReads++
          return 720
        }
      })
    }

    const controls = enhanceKeepTables(host, host)

    expect(document.querySelectorAll('.km-float-header')).toHaveLength(1)
    expect(resizeObservers).toBe(1)
    expect(tableWidthReads).toBe(0)
    expect(host.dataset.kmTableViewportContainment).toBeUndefined()
    controls.destroy()
  })

  it('contains completed table frames in table-heavy documents without touching block flow', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    for (let tableIndex = 0; tableIndex < 80; tableIndex++) {
      makeTable({ host, tableIndex, rows: 1, columns: 2 })
    }
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 46.5,
      left: 0,
      right: 600,
      width: 600,
      height: 46.5
    })

    const controls = enhanceKeepTables(host, host)
    const frames = [...host.querySelectorAll('.km-table-frame')]

    expect(host.dataset.kmTableViewportContainment).toBe('true')
    expect(frames).toHaveLength(80)
    expect(frames.every((frame) => frame.style.contentVisibility === 'auto')).toBe(true)
    expect(frames.every((frame) => frame.style.containIntrinsicBlockSize === 'auto 46.5px')).toBe(
      true
    )

    controls.destroy()
    expect(host.dataset.kmTableViewportContainment).toBeUndefined()
  })

  it('resizes and repositions a visible floating header when its wrapper changes', () => {
    let resizeCallback
    class ResizeObserverMock {
      constructor(callback) {
        resizeCallback = callback
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)

    const { host, wrap, table, thead } = makeTable({ rows: 2, columns: 3 })
    let wrapWidth = 520
    let wrapLeft = 280
    Object.defineProperties(wrap, {
      clientWidth: { configurable: true, get: () => wrapWidth },
      clientLeft: { configurable: true, get: () => 1 }
    })
    Object.defineProperties(table, {
      offsetWidth: { configurable: true, get: () => 720 },
      scrollWidth: { configurable: true, get: () => 720 }
    })
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
      top: 60,
      bottom: 700,
      left: 0,
      right: 0,
      width: 0,
      height: 640
    })
    vi.spyOn(thead, 'getBoundingClientRect').mockReturnValue({
      top: 20,
      bottom: 52,
      left: wrapLeft,
      right: wrapLeft + wrapWidth,
      width: wrapWidth,
      height: 32
    })
    vi.spyOn(table, 'getBoundingClientRect').mockReturnValue({
      top: 20,
      bottom: 900,
      left: wrapLeft,
      right: wrapLeft + 720,
      width: 720,
      height: 880
    })
    vi.spyOn(wrap, 'getBoundingClientRect').mockImplementation(() => ({
      top: 20,
      bottom: 900,
      left: wrapLeft,
      right: wrapLeft + wrapWidth,
      width: wrapWidth,
      height: 880
    }))

    const controls = enhanceKeepTables(host, host)
    const floating = document.querySelector('.km-float-header')
    expect(floating.classList.contains('km-visible')).toBe(true)
    expect(floating.style.left).toBe('281px')
    expect(floating.style.width).toBe('520px')

    wrapWidth = 360
    wrapLeft = 440
    resizeCallback()

    expect(floating.style.left).toBe('441px')
    expect(floating.style.width).toBe('360px')
    controls.destroy()
  })
})
