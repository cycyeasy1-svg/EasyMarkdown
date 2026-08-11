const normalizedLines = (content) => String(content || '').split('\n')

export function sourceOffsetForLine(content, line) {
  const lines = normalizedLines(content)
  const targetLine = Math.min(lines.length - 1, Math.max(0, Math.floor(Number(line) || 0)))
  let offset = 0
  for (let index = 0; index < targetLine; index += 1) offset += lines[index].length + 1
  return offset
}

export function sourceLineForOffset(content, offset) {
  const value = String(content || '')
  const targetOffset = Math.min(value.length, Math.max(0, Math.floor(Number(offset) || 0)))
  return value.slice(0, targetOffset).split('\n').length - 1
}

export function sourceLineForScroll({
  scrollTop,
  lineHeight,
  paddingTop = 0,
  lineCount = Number.POSITIVE_INFINITY
}) {
  const height = Number(lineHeight)
  if (!Number.isFinite(height) || height <= 0) return 0
  const contentTop = Math.max(0, Number(scrollTop) - Math.max(0, Number(paddingTop) || 0))
  const line = Math.max(0, Math.floor(contentTop / height))
  const maxLine = Number.isFinite(lineCount) ? Math.max(0, Math.floor(lineCount) - 1) : line
  return Math.min(line, maxLine)
}
