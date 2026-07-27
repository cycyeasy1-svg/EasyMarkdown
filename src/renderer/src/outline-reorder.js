import { parseHeadingDetails } from './outline-model.js'

function parentHeadingIndex(headings, index) {
  const level = headings[index]?.level
  if (!level || level === 1) return -1
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (headings[cursor].level < level) return cursor
  }
  return -1
}

export function haveSameHeadingParent(headings, fromIndex, targetIndex) {
  if (headings[fromIndex]?.level !== headings[targetIndex]?.level) return false
  return parentHeadingIndex(headings, fromIndex) === parentHeadingIndex(headings, targetIndex)
}

export function headingSectionRange(markdown, headings, index) {
  const heading = headings[index]
  if (!heading || !Number.isFinite(heading.charOffset)) return null
  let end = markdown.length
  for (let cursor = index + 1; cursor < headings.length; cursor += 1) {
    if (headings[cursor].level <= heading.level) {
      end = headings[cursor].charOffset
      break
    }
  }
  return { start: heading.charOffset, end }
}

function joinAtLineBoundary(before, moved, after, eol) {
  let section = moved
  if (before && !before.endsWith('\n') && !before.endsWith('\r')) section = eol + section
  if (after && !section.endsWith('\n') && !section.endsWith('\r')) section += eol
  return before + section + after
}

// Moves a heading together with its complete descendant section. Only siblings
// can move, so drag-and-drop cannot silently change the document hierarchy.
// The returned source preserves every byte inside the moved and untouched
// ranges; a single EOL is added only when a last, unterminated section is moved
// in front of another heading.
export function moveHeadingSection(markdown, fromIndex, targetIndex, placement = 'before') {
  const source = String(markdown ?? '')
  const headings = parseHeadingDetails(source)
  if (
    fromIndex === targetIndex ||
    !haveSameHeadingParent(headings, fromIndex, targetIndex)
  ) return null
  const movedRange = headingSectionRange(source, headings, fromIndex)
  const targetRange = headingSectionRange(source, headings, targetIndex)
  if (!movedRange || !targetRange) return null

  const insertion = placement === 'after' ? targetRange.end : targetRange.start
  if (insertion >= movedRange.start && insertion <= movedRange.end) return null
  const moved = source.slice(movedRange.start, movedRange.end)
  const withoutMoved = source.slice(0, movedRange.start) + source.slice(movedRange.end)
  const adjusted = insertion > movedRange.start
    ? insertion - (movedRange.end - movedRange.start)
    : insertion
  const before = withoutMoved.slice(0, adjusted)
  const after = withoutMoved.slice(adjusted)
  const next = joinAtLineBoundary(before, moved, after, source.includes('\r\n') ? '\r\n' : '\n')
  return next === source ? null : next
}
