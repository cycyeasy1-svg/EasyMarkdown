// Pure helpers for closed-tab history and MRU switching. Keeping these outside
// App makes the restoration/order contracts deterministic and unit-testable.

export const CLOSED_TABS_MAX = 20

const normalizePath = (value) => String(value || '').replace(/\\/g, '/')

export function sanitizeClosedTabs(input, max = CLOSED_TABS_MAX) {
  if (!Array.isArray(input)) return []
  return input
    .filter((entry) => entry && typeof entry.path === 'string' && entry.path)
    .map((entry, index) => ({
      closedId: String(entry.closedId || `legacy:${index}:${entry.path}`),
      path: entry.path,
      title: String(entry.title || entry.path.split(/[\\/]/).pop() || 'Untitled'),
      index: Math.max(0, Number(entry.index) || 0),
      pinned: !!entry.pinned,
      viewMode: ['source', 'milkdown', 'keep'].includes(entry.viewMode) ? entry.viewMode : 'keep',
      richForced: !!entry.richForced,
      discardedChanges: !!entry.discardedChanges,
      closedAt: Number(entry.closedAt) || 0
    }))
    .slice(-Math.max(1, max))
}

export function createClosedTabEntry(tab, index, options = {}) {
  if (!tab?.path) return null
  const closedAt = Number(options.closedAt) || Date.now()
  return {
    closedId: String(options.closedId || `${tab.id || normalizePath(tab.path)}:${closedAt}`),
    path: tab.path,
    title: tab.title || tab.path.split(/[\\/]/).pop() || 'Untitled',
    index: Math.max(0, Number(index) || 0),
    pinned: !!tab.pinned,
    viewMode: options.viewMode || 'keep',
    richForced: !!options.richForced,
    discardedChanges: !!options.discardedChanges,
    closedAt
  }
}

// History is stored oldest → newest, so reopening takes the last entry. A path
// appears only once: closing the same document again replaces its stale record.
export function pushClosedTabEntries(history, entries, max = CLOSED_TABS_MAX) {
  let next = sanitizeClosedTabs(history, max)
  for (const entry of entries || []) {
    if (!entry?.path) continue
    const path = normalizePath(entry.path)
    next = next.filter((item) => normalizePath(item.path) !== path)
    next.push(entry)
  }
  return next.slice(-Math.max(1, max))
}

export function removeClosedTabEntry(history, closedId) {
  return (history || []).filter((entry) => entry.closedId !== closedId)
}

// Restore at the original strip position while preserving the invariant that
// pinned tabs stay before unpinned tabs.
export function insertRestoredTab(tabs, tab, originalIndex) {
  const list = [...(tabs || [])]
  const pinnedCount = list.filter((item) => item.pinned).length
  const requested = Math.max(0, Number(originalIndex) || 0)
  const index = tab?.pinned
    ? Math.min(requested, pinnedCount)
    : Math.min(list.length, Math.max(pinnedCount, requested))
  list.splice(index, 0, tab)
  return list
}

export function touchTabMru(mruIds, id, liveIds) {
  const live = liveIds instanceof Set ? liveIds : new Set(liveIds || [])
  if (!id || !live.has(id)) return (mruIds || []).filter((item) => live.has(item))
  return [id, ...(mruIds || []).filter((item) => item !== id && live.has(item))]
}

// Current tab first, then previously-used tabs, then never-visited tabs in strip
// order. Ctrl/Cmd+Tab selects index 1 on its first press.
export function buildMruTabOrder(tabs, mruIds, activeId) {
  const tabIds = (tabs || []).map((tab) => tab.id)
  const live = new Set(tabIds)
  const order = []
  const add = (id) => {
    if (id && live.has(id) && !order.includes(id)) order.push(id)
  }
  add(activeId)
  for (const id of mruIds || []) add(id)
  for (const id of tabIds) add(id)
  return order
}

export function stepWrappedIndex(index, delta, length) {
  if (!length) return -1
  return (Math.max(0, Number(index) || 0) + delta + length) % length
}
