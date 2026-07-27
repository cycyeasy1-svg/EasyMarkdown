const isTableLine = (line) => line.includes('|')

export function isTableSeparatorLine(line) {
  const cells = String(line || '').trim().replace(/^\||\|$/g, '').split('|')
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
}

// Milkdown uses a generated `<br />` as the only child of an empty table cell
// so the ProseMirror table retains its shape. Once the complete GFM table is
// serialized, that placeholder should be an ordinary empty `| |` cell. Real
// `text<br>text` content is deliberately untouched.
export function normalizeEmptyTableCells(markdown) {
  const lines = String(markdown || '').split('\n')
  let index = 0
  while (index < lines.length) {
    if (!isTableLine(lines[index])) {
      index += 1
      continue
    }
    const start = index
    while (index < lines.length && isTableLine(lines[index])) index += 1
    const block = lines.slice(start, index)
    if (!block.some(isTableSeparatorLine)) continue
    for (let line = start; line < index; line += 1) {
      lines[line] = lines[line].replace(
        /(^|\|)(\s*)<br\s*\/?>\s*(?=\||$)/gi,
        '$1$2'
      )
    }
  }
  return lines.join('\n')
}
