const normalizeTextareaNewlines = (value) =>
  String(value || '').replace(/\r\n?|\n/g, '\n')

const commonChange = (previous, next) => {
  let start = 0
  const minimum = Math.min(previous.length, next.length)
  while (start < minimum && previous[start] === next[start]) start += 1

  let previousEnd = previous.length
  let nextEnd = next.length
  while (
    previousEnd > start &&
    nextEnd > start &&
    previous[previousEnd - 1] === next[nextEnd - 1]
  ) {
    previousEnd -= 1
    nextEnd -= 1
  }
  return { start, previousEnd, nextEnd }
}

const lineEndingNear = (source, offset) => {
  const next = source.indexOf('\n', Math.max(0, offset))
  if (next >= 0) return source[next - 1] === '\r' ? '\r\n' : '\n'
  const previous = source.lastIndexOf('\n', Math.max(0, offset - 1))
  if (previous >= 0) return source[previous - 1] === '\r' ? '\r\n' : '\n'
  return source.includes('\r\n') ? '\r\n' : '\n'
}

export const sourceOffsetFromTextareaOffset = (source, textareaOffset) => {
  const target = Math.max(0, Math.round(textareaOffset || 0))
  let normalized = 0
  let raw = 0
  while (raw < source.length && normalized < target) {
    if (source[raw] === '\r') raw += source[raw + 1] === '\n' ? 2 : 1
    else raw += 1
    normalized += 1
  }
  return raw
}

export const textareaOffsetFromSourceOffset = (source, sourceOffset) => {
  const target = Math.max(0, Math.min(Math.round(sourceOffset || 0), source.length))
  let normalized = 0
  let raw = 0
  while (raw < target) {
    if (source[raw] === '\r') {
      if (source[raw + 1] === '\n' && raw + 1 < target) raw += 2
      else raw += 1
    } else raw += 1
    normalized += 1
  }
  return normalized
}

// Browsers expose textarea newlines as LF. Apply only the visible edit back to
// the raw snapshot so untouched CRLF/LF bytes and a leading BOM survive.
export const preserveTextareaSourceEdit = (previousSource, nextTextareaValue) => {
  const source = String(previousSource || '')
  const previous = normalizeTextareaNewlines(source)
  const next = normalizeTextareaNewlines(nextTextareaValue)
  if (previous === next) return source

  const { start, previousEnd, nextEnd } = commonChange(previous, next)
  const rawStart = sourceOffsetFromTextareaOffset(source, start)
  const rawEnd = sourceOffsetFromTextareaOffset(source, previousEnd)
  const eol = lineEndingNear(source, rawStart)
  const replacement = next.slice(start, nextEnd).replace(/\n/g, eol)
  return source.slice(0, rawStart) + replacement + source.slice(rawEnd)
}
