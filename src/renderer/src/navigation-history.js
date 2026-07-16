const DEFAULT_LIMIT = 100

export function sameNavigationLocation(a, b) {
  return !!a && !!b &&
    a.tabId === b.tabId &&
    a.rawOffset === b.rawOffset &&
    !!a.sourceMode === !!b.sourceMode
}

export function pushNavigationLocation(stack, location, limit = DEFAULT_LIMIT) {
  if (!location?.tabId || !Number.isFinite(location.rawOffset)) return [...(stack || [])]
  const next = [...(stack || [])]
  if (sameNavigationLocation(next.at(-1), location)) return next
  next.push({
    tabId: location.tabId,
    rawOffset: Math.max(0, location.rawOffset),
    sourceMode: !!location.sourceMode
  })
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
