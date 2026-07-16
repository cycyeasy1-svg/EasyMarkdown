const DEFAULT_MAX_ENTRIES = 100
const DEFAULT_MAX_CHARS = 2_000_000

const entrySize = (before, after) =>
  before.reduce((sum, line) => sum + line.length + 1, 0) +
  after.reduce((sum, line) => sum + line.length + 1, 0)

export function createKeepHistoryPatch(lines, start, deleteCount, insertedLines = []) {
  const source = Array.isArray(lines) ? lines : []
  const at = Math.min(source.length, Math.max(0, Number(start) || 0))
  const count = Math.min(source.length - at, Math.max(0, Number(deleteCount) || 0))
  const before = source.slice(at, at + count)
  const after = Array.isArray(insertedLines) ? [...insertedLines] : []
  if (before.length === after.length && before.every((line, index) => line === after[index])) {
    return null
  }
  return { start: at, before, after, size: entrySize(before, after) }
}

/**
 * Build the smallest line-oriented patch that transforms beforeLines into
 * afterLines. Keep mode deliberately stores only the changed range so editing a
 * single cell in a very large table does not duplicate the whole document in
 * memory for every undo step.
 */
export function createKeepHistoryEntry(beforeLines, afterLines) {
  const before = Array.isArray(beforeLines) ? beforeLines : []
  const after = Array.isArray(afterLines) ? afterLines : []
  let start = 0
  const shared = Math.min(before.length, after.length)
  while (start < shared && before[start] === after[start]) start++
  if (start === before.length && start === after.length) return null

  let beforeEnd = before.length
  let afterEnd = after.length
  while (
    beforeEnd > start &&
    afterEnd > start &&
    before[beforeEnd - 1] === after[afterEnd - 1]
  ) {
    beforeEnd--
    afterEnd--
  }

  const removed = before.slice(start, beforeEnd)
  const inserted = after.slice(start, afterEnd)
  return {
    start,
    before: removed,
    after: inserted,
    size: entrySize(removed, inserted)
  }
}

export function applyKeepHistoryEntry(lines, entry, direction = 'redo') {
  if (!entry) return Array.isArray(lines) ? [...lines] : []
  const source = Array.isArray(lines) ? [...lines] : []
  const remove = direction === 'undo' ? entry.after : entry.before
  const insert = direction === 'undo' ? entry.before : entry.after
  source.splice(entry.start, remove.length, ...insert)
  return source
}

export function pushKeepHistory(
  stack,
  entry,
  { maxEntries = DEFAULT_MAX_ENTRIES, maxChars = DEFAULT_MAX_CHARS } = {}
) {
  if (!entry) return Array.isArray(stack) ? stack : []
  const next = [...(Array.isArray(stack) ? stack : []), entry]
  let chars = next.reduce((sum, item) => sum + (item.size || 0), 0)
  while (next.length > 1 && (next.length > maxEntries || chars > maxChars)) {
    chars -= next.shift().size || 0
  }
  return next
}
