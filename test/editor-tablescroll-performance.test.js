// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enhanceKeepTables } from '../src/renderer/src/components/editor-tablescroll.js'

function makeTable({ rows = 8, columns = 4 } = {}) {
  const host = document.createElement('div')
  host.className = 'km-doc'
  const wrap = document.createElement('div')
  wrap.className = 'km-table-wrap'
  const table = document.createElement('table')
  table.className = 'km-table'
  table.dataset.ti = '0'

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
  document.body.appendChild(host)
  return { host, table }
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

    expect(toggles.flatMap((spy) => spy.mock.calls).filter(([name]) => name === 'km-col-hidden')).toHaveLength(0)
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

    expect([...table.querySelectorAll('th[data-ci="1"], td[data-ci="1"]')].every((cell) => cell.classList.contains('km-col-hidden'))).toBe(true)
    expect([...table.querySelectorAll('th[data-ci="0"], td[data-ci="0"]')].some((cell) => cell.classList.contains('km-col-hidden'))).toBe(false)
    controls.destroy()
  })
})
