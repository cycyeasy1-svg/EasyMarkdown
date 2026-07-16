// Position helpers shared by the source textarea, Keep preview and Milkdown
// mode switch. Offsets always refer to the full Markdown string, even when the
// source editor is showing a folded (derived) view.

export function lineStartOffset(text, lineIndex) {
  const source = String(text ?? '')
  const target = Math.max(0, Number(lineIndex) || 0)
  if (!target) return 0
  let line = 0
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) !== 10) continue
    line += 1
    if (line === target) return i + 1
  }
  return source.length
}

export function lineColumnAtOffset(text, rawOffset) {
  const source = String(text ?? '')
  const offset = Math.max(0, Math.min(Number(rawOffset) || 0, source.length))
  let line = 0
  let start = 0
  for (let i = 0; i < offset; i++) {
    if (source.charCodeAt(i) === 10) {
      line += 1
      start = i + 1
    }
  }
  return { line, column: offset - start }
}

export function offsetForLineColumn(lines, lineIndex, column = 0) {
  const list = Array.isArray(lines) && lines.length ? lines : ['']
  const line = Math.max(0, Math.min(Number(lineIndex) || 0, list.length - 1))
  let offset = 0
  for (let i = 0; i < line; i++) offset += String(list[i] ?? '').length + 1
  return offset + Math.max(0, Math.min(Number(column) || 0, String(list[line] ?? '').length))
}

export function sourceOffsetToDisplayOffset(lines, displayLines, visibleMap, rawOffset) {
  const source = (Array.isArray(lines) ? lines : ['']).join('\n')
  const { line, column } = lineColumnAtOffset(source, rawOffset)
  const row = visibleMap.indexOf(line)
  if (row < 0) return null
  return offsetForLineColumn(displayLines, row, column)
}

export function displayOffsetToSourceOffset(lines, displayLines, visibleMap, displayOffset) {
  const displayed = (Array.isArray(displayLines) ? displayLines : ['']).join('\n')
  const { line: row, column } = lineColumnAtOffset(displayed, displayOffset)
  const sourceLine = visibleMap[row]
  if (!Number.isFinite(sourceLine)) return null
  return offsetForLineColumn(lines, sourceLine, column)
}

