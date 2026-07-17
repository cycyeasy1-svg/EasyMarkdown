const DEFAULT_LIMIT = 100
const MAX_COLLAPSED = 50
const MAX_FILTER_COLUMNS = 16
const MAX_FILTER_VALUES = 200

const finiteInt = (value, fallback = 0) =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback

export function sanitizeNavigationContext(context) {
  if (!context || typeof context !== 'object') return null
  const next = {}
  if (context.sourceSelection && typeof context.sourceSelection === 'object') {
    const start = finiteInt(context.sourceSelection.start)
    const end = finiteInt(context.sourceSelection.end, start)
    next.sourceSelection = { start: Math.min(start, end), end: Math.max(start, end) }
  }
  if (Array.isArray(context.collapsed)) {
    const collapsed = context.collapsed
      .filter((key) => typeof key === 'string' && key)
      .slice(0, MAX_COLLAPSED)
      .map((key) => key.slice(0, 256))
    next.collapsed = collapsed
  }
  if (context.table && typeof context.table === 'object') {
    const table = {
      ti: finiteInt(context.table.ti),
      scrollLeft: Math.min(10_000_000, Math.max(0, Number(context.table.scrollLeft) || 0))
    }
    if (context.table.restoreFilters) table.restoreFilters = true
    const selection = context.table.selection
    if (selection && typeof selection === 'object') {
      table.selection = {
        ti: finiteInt(selection.ti, table.ti),
        ri: finiteInt(selection.ri),
        ci: finiteInt(selection.ci),
        isHeader: !!selection.isHeader,
        line: finiteInt(selection.line)
      }
    }
    if (Array.isArray(context.table.filters)) {
      let remaining = MAX_FILTER_VALUES
      const filters = []
      for (const filter of context.table.filters.slice(0, MAX_FILTER_COLUMNS)) {
        if (remaining <= 0 || !filter || !Array.isArray(filter.excluded)) break
        const excluded = filter.excluded
          .filter((value) => typeof value === 'string')
          .slice(0, remaining)
          .map((value) => value.slice(0, 500))
        remaining -= excluded.length
        if (excluded.length) filters.push({ column: finiteInt(filter.column), excluded })
      }
      if (filters.length) table.filters = filters
    }
    next.table = table
  }
  return Object.keys(next).length ? next : null
}

function normalizeNavigationLocation(location) {
  const next = {
    tabId: location.tabId,
    rawOffset: Math.max(0, location.rawOffset),
    sourceMode: !!location.sourceMode
  }
  if (location.pane === 'right') next.pane = 'right'
  const context = sanitizeNavigationContext(location.context)
  if (context) next.context = context
  return next
}

export function sameNavigationLocation(a, b) {
  return !!a && !!b &&
    a.tabId === b.tabId &&
    a.rawOffset === b.rawOffset &&
    !!a.sourceMode === !!b.sourceMode &&
    (a.pane === 'right' ? 'right' : 'left') === (b.pane === 'right' ? 'right' : 'left')
}

export function pushNavigationLocation(stack, location, limit = DEFAULT_LIMIT) {
  if (!location?.tabId || !Number.isFinite(location.rawOffset)) return [...(stack || [])]
  const next = [...(stack || [])]
  const normalized = normalizeNavigationLocation(location)
  if (sameNavigationLocation(next.at(-1), normalized)) {
    next[next.length - 1] = normalized
    return next
  }
  next.push(normalized)
  if (next.length > limit) next.splice(0, next.length - limit)
  return next
}

export function recordNavigationLocation(state, location, limit = DEFAULT_LIMIT) {
  return {
    back: pushNavigationLocation(state?.back, location, limit),
    forward: []
  }
}

export function pruneNavigationHistory(state, validIds) {
  const valid = validIds instanceof Set ? validIds : new Set(validIds || [])
  return {
    back: (state?.back || []).filter((item) => valid.has(item.tabId)),
    forward: (state?.forward || []).filter((item) => valid.has(item.tabId))
  }
}

export function stepNavigationHistory(state, current, direction) {
  const from = direction === 'forward' ? 'forward' : 'back'
  const source = [...(state?.[from] || [])]
  let target = source.pop() || null
  while (target && sameNavigationLocation(target, current)) target = source.pop() || null
  if (!target) return { state: { back: state?.back || [], forward: state?.forward || [] }, target: null }

  return {
    state: {
      back: from === 'back' ? source : pushNavigationLocation(state?.back, current),
      forward: from === 'forward' ? source : pushNavigationLocation(state?.forward, current)
    },
    target
  }
}
