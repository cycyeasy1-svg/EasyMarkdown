// Keep a small warm set of inactive Keep editors while allowing safe, read-only
// tabs to release their DOM. Dirty editors and editors carrying transient state
// must remain resident so hibernation never drops a draft or Undo/Redo history.
export const MAX_IDLE_KEEP_EDITORS = 3

export function planEditorResidency({
  mountedIds,
  tabs,
  recentIds = [],
  protectedIds = [],
  milkdownIds = new Set(),
  draftIds = new Set(),
  historyById = {},
  filtersById = {},
  maxIdleKeepEditors = MAX_IDLE_KEEP_EDITORS
}) {
  const tabById = new Map((tabs || []).map((tab) => [tab.id, tab]))
  const mounted = new Set(mountedIds || [])
  const protectedSet = new Set(protectedIds || [])
  // Mount registration and warm-set pruning can run in the same React commit.
  // Include visible ids here so pruning a stale snapshot never overwrites the
  // registration update for the editor the user just activated.
  for (const id of protectedSet) if (tabById.has(id)) mounted.add(id)
  const rank = new Map((recentIds || []).map((id, index) => [id, index]))
  const eligible = []

  for (const id of mounted) {
    const tab = tabById.get(id)
    const history = historyById?.[id]
    if (
      !tab ||
      protectedSet.has(id) ||
      milkdownIds.has(id) ||
      draftIds.has(id) ||
      tab.content !== tab.savedContent ||
      history?.canUndo ||
      history?.canRedo ||
      filtersById?.[id]
    ) continue
    eligible.push(id)
  }

  eligible.sort((left, right) =>
    (rank.get(left) ?? Number.MAX_SAFE_INTEGER) -
    (rank.get(right) ?? Number.MAX_SAFE_INTEGER)
  )
  const keepCount = Math.max(0, Math.floor(Number(maxIdleKeepEditors) || 0))
  const hibernateIds = eligible.slice(keepCount)
  const residentIds = new Set(mounted)
  hibernateIds.forEach((id) => residentIds.delete(id))
  return { residentIds, hibernateIds }
}

export function sameEditorIdSet(left, right) {
  if (left === right) return true
  if (left?.size !== right?.size) return false
  for (const id of left || []) if (!right.has(id)) return false
  return true
}
