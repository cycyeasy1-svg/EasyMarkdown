import { replaceCellInLine } from '../../../src/renderer/src/keep-parser.js'

// Locate an unchanged source line after an external edit. Prefer the previous
// coordinate, then accept a unique relocated match. Ambiguous duplicate lines
// are deliberately rejected: guessing could apply a draft to the wrong cell.
export function locateLineAnchor(
  nextLines,
  baseLine,
  preferredLine,
  beforeLine = undefined,
  afterLine = undefined
) {
  const source = Array.isArray(nextLines) ? nextLines : []
  const line = String(baseLine ?? '')
  const preferred = Number.isInteger(preferredLine) ? preferredLine : -1
  const matchesAt = (index) =>
    source[index] === line &&
    (beforeLine === undefined
      ? true
      : beforeLine == null
        ? index === 0
        : source[index - 1] === String(beforeLine)) &&
    (afterLine === undefined
      ? true
      : afterLine == null
        ? index === source.length - 1
        : source[index + 1] === String(afterLine))
  if (preferred >= 0 && preferred < source.length && matchesAt(preferred)) return preferred
  let found = -1
  for (let index = 0; index < source.length; index++) {
    if (!matchesAt(index)) continue
    if (found !== -1) return -1
    found = index
  }
  return found
}

// Block drafts carry their original source slice. The same conservative rule as
// locateLineAnchor applies: an exact preferred match or one unique relocated
// sequence is safe; no/duplicate matches require explicit recovery.
export function locateBlockAnchor(
  nextLines,
  baseLines,
  preferredStart,
  beforeLine = undefined,
  afterLine = undefined
) {
  const source = Array.isArray(nextLines) ? nextLines : []
  const needle = Array.isArray(baseLines) ? baseLines.map(String) : []
  if (!needle.length || needle.length > source.length) return -1
  const matchesAt = (start) =>
    needle.every((line, offset) => source[start + offset] === line) &&
    (beforeLine === undefined
      ? true
      : beforeLine == null
        ? start === 0
        : source[start - 1] === String(beforeLine)) &&
    (afterLine === undefined
      ? true
      : afterLine == null
        ? start + needle.length === source.length
        : source[start + needle.length] === String(afterLine))
  const preferred = Number.isInteger(preferredStart) ? preferredStart : -1
  if (preferred >= 0 && preferred + needle.length <= source.length && matchesAt(preferred)) {
    return preferred
  }
  let found = -1
  for (let start = 0; start <= source.length - needle.length; start++) {
    if (!matchesAt(start)) continue
    if (found !== -1) return -1
    found = start
  }
  return found
}

// Rebase an uncommitted block insertion by matching the unchanged lines on both
// sides of its boundary. A document edge is represented by null. As with the
// other locators, two equally valid boundaries are considered ambiguous.
export function locateInsertionAnchor(nextLines, beforeLine, afterLine, preferredAt) {
  const source = Array.isArray(nextLines) ? nextLines : []
  const before = beforeLine == null ? null : String(beforeLine)
  const after = afterLine == null ? null : String(afterLine)
  const matchesAt = (at) =>
    (before == null ? at === 0 : source[at - 1] === before) &&
    (after == null ? at === source.length : source[at] === after)
  const preferred = Number.isInteger(preferredAt) ? preferredAt : -1
  if (preferred >= 0 && preferred <= source.length && matchesAt(preferred)) return preferred
  let found = -1
  for (let at = 0; at <= source.length; at++) {
    if (!matchesAt(at)) continue
    if (found !== -1) return -1
    found = at
  }
  return found
}

export function parseTsv(text) {
  const value = String(text ?? '').replace(/\r\n?/g, '\n')
  if (!value) return []
  const rows = value.split('\n')
  if (rows.length > 1 && rows.at(-1) === '') rows.pop()
  return rows.map((row) => row.split('\t'))
}

// Compute a zero-diff table paste without mutating the caller's source mirror.
// The result contains only changed source lines so the webview can commit one
// contiguous WorkspaceEdit and preserve every untouched byte.
export function buildTablePastePatch(rawLines, table, startGridRow, startColumn, text) {
  const source = Array.isArray(rawLines) ? rawLines : []
  const matrix = parseTsv(text)
  const columnCount = Array.isArray(table?.headers) ? table.headers.length : 0
  const dataRows = Array.isArray(table?.dataRows) ? table.dataRows : []
  const maxGridRows = dataRows.length + 1
  const rowStart = Math.max(0, Number(startGridRow) || 0)
  const columnStart = Math.max(0, Number(startColumn) || 0)
  const changed = new Map()
  let appliedRows = 0
  let appliedColumns = 0
  let clipped = false

  if (!matrix.length || !table || !columnCount || rowStart >= maxGridRows || columnStart >= columnCount) {
    return { replacements: [], appliedRows: 0, appliedColumns: 0, clipped: matrix.length > 0 }
  }

  matrix.forEach((values, rowOffset) => {
    const gridRow = rowStart + rowOffset
    if (gridRow >= maxGridRows) {
      clipped = true
      return
    }
    const lineIdx = gridRow === 0 ? table.headerLine : dataRows[gridRow - 1]?.lineIdx
    if (!Number.isInteger(lineIdx) || source[lineIdx] == null) return
    let line = changed.get(lineIdx) ?? source[lineIdx]
    let rowApplied = false
    values.forEach((value, columnOffset) => {
      const columnIdx = columnStart + columnOffset
      if (columnIdx >= columnCount) {
        clipped = true
        return
      }
      line = replaceCellInLine(line, columnIdx, value.replace(/\n/g, '<br>'))
      appliedColumns = Math.max(appliedColumns, columnOffset + 1)
      rowApplied = true
    })
    if (rowApplied) {
      changed.set(lineIdx, line)
      appliedRows = Math.max(appliedRows, rowOffset + 1)
    }
  })

  return {
    replacements: [...changed.entries()]
      .sort(([a], [b]) => a - b)
      .map(([lineIdx, line]) => ({ lineIdx, line })),
    appliedRows,
    appliedColumns,
    clipped
  }
}
