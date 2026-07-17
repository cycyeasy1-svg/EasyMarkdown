const DEFAULT_LOOKAHEAD = 80
const DEFAULT_MAX_CHANGES = 200

const asLines = (value) => String(value ?? '').split('\n')

function findAnchor(before, after, beforeAt, afterAt, beforeEnd, afterEnd, lookahead) {
  const beforeLimit = Math.min(beforeEnd - beforeAt, lookahead)
  const afterLimit = Math.min(afterEnd - afterAt, lookahead)
  let best = null

  for (let total = 1; total <= beforeLimit + afterLimit; total++) {
    const minBefore = Math.max(0, total - afterLimit)
    const maxBefore = Math.min(beforeLimit, total)
    for (let beforeDelta = minBefore; beforeDelta <= maxBefore; beforeDelta++) {
      const afterDelta = total - beforeDelta
      if (before[beforeAt + beforeDelta] !== after[afterAt + afterDelta]) continue
      const candidate = { beforeDelta, afterDelta }
      if (
        !best ||
        Math.max(beforeDelta, afterDelta) < Math.max(best.beforeDelta, best.afterDelta)
      ) {
        best = candidate
      }
    }
    if (best) return best
  }
  return null
}

function createChange(beforeStart, afterStart, beforeLines, afterLines, coarse = false) {
  const kind =
    beforeLines.length === 0 ? 'added' : afterLines.length === 0 ? 'deleted' : 'modified'
  const line = Math.max(1, afterStart + 1)
  return {
    id: `${beforeStart}:${afterStart}:${beforeLines.length}:${afterLines.length}`,
    kind,
    baselineStart: beforeStart,
    currentStart: afterStart,
    before: beforeLines,
    after: afterLines,
    line,
    coarse
  }
}

/**
 * Build bounded, line-oriented review hunks.
 *
 * Keep edits are normally small and localized, so an 80-line synchronization
 * window finds the next unchanged line without scanning the full remainder for
 * every mismatch. If a large rewrite has no nearby anchor, the remainder is
 * deliberately represented as one coarse hunk. This keeps opening the review
 * dialog linear for large tables instead of introducing an unbounded diff task.
 */
export function buildKeepReviewChanges(
  baseline,
  current,
  { lookahead = DEFAULT_LOOKAHEAD, maxChanges = DEFAULT_MAX_CHANGES } = {}
) {
  const before = asLines(baseline)
  const after = asLines(current)
  let prefix = 0
  const shared = Math.min(before.length, after.length)
  while (prefix < shared && before[prefix] === after[prefix]) prefix++
  if (prefix === before.length && prefix === after.length) {
    return { changes: [], coarse: false, truncated: false }
  }

  let beforeEnd = before.length
  let afterEnd = after.length
  while (
    beforeEnd > prefix &&
    afterEnd > prefix &&
    before[beforeEnd - 1] === after[afterEnd - 1]
  ) {
    beforeEnd--
    afterEnd--
  }

  const changes = []
  let beforeAt = prefix
  let afterAt = prefix
  let coarse = false
  let truncated = false

  while (beforeAt < beforeEnd || afterAt < afterEnd) {
    if (
      beforeAt < beforeEnd &&
      afterAt < afterEnd &&
      before[beforeAt] === after[afterAt]
    ) {
      beforeAt++
      afterAt++
      continue
    }

    if (changes.length >= Math.max(1, maxChanges) - 1) {
      changes.push(
        createChange(
          beforeAt,
          afterAt,
          before.slice(beforeAt, beforeEnd),
          after.slice(afterAt, afterEnd),
          true
        )
      )
      coarse = true
      truncated = true
      break
    }

    const anchor = findAnchor(
      before,
      after,
      beforeAt,
      afterAt,
      beforeEnd,
      afterEnd,
      Math.max(1, lookahead)
    )
    if (!anchor) {
      changes.push(
        createChange(
          beforeAt,
          afterAt,
          before.slice(beforeAt, beforeEnd),
          after.slice(afterAt, afterEnd),
          true
        )
      )
      coarse = true
      break
    }

    changes.push(
      createChange(
        beforeAt,
        afterAt,
        before.slice(beforeAt, beforeAt + anchor.beforeDelta),
        after.slice(afterAt, afterAt + anchor.afterDelta)
      )
    )
    beforeAt += anchor.beforeDelta
    afterAt += anchor.afterDelta
  }

  return { changes, coarse, truncated }
}

export function restoreKeepReviewChange(current, change) {
  const lines = asLines(current)
  if (!change) return lines.join('\n')
  lines.splice(change.currentStart, change.after.length, ...change.before)
  return lines.join('\n')
}
