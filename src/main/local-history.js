export const LOCAL_HISTORY_MAX_ENTRIES = 30
export const LOCAL_HISTORY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
export const LOCAL_HISTORY_AUTOSAVE_WINDOW_MS = 10 * 60 * 1000

export function appendLocalHistorySnapshot(
  record,
  snapshot,
  {
    now = Date.now(),
    maxEntries = LOCAL_HISTORY_MAX_ENTRIES,
    maxAgeMs = LOCAL_HISTORY_MAX_AGE_MS,
    autosaveWindowMs = LOCAL_HISTORY_AUTOSAVE_WINDOW_MS
  } = {}
) {
  const cutoff = now - maxAgeMs
  const previous = Array.isArray(record?.snapshots) ? record.snapshots : []
  let snapshots = previous.filter(
    (item) =>
      item &&
      typeof item.id === 'string' &&
      typeof item.content === 'string' &&
      Number(item.createdAt) >= cutoff
  )
  const pruned = snapshots.length !== previous.length
  const latest = snapshots[0]
  if (latest?.content === snapshot.content) {
    return { changed: pruned, record: { ...record, snapshots } }
  }
  if (
    snapshot.reason === 'autosave' &&
    latest?.reason === 'autosave' &&
    now - Number(latest.createdAt) < autosaveWindowMs
  ) {
    return { changed: pruned, record: { ...record, snapshots } }
  }
  snapshots = [{ ...snapshot, createdAt: now }, ...snapshots].slice(0, maxEntries)
  return {
    changed: true,
    record: {
      version: 1,
      path: snapshot.path || record?.path || '',
      snapshots
    }
  }
}

export function localHistoryMetadata(record) {
  return (record?.snapshots || []).map(({ id, createdAt, reason, size }) => ({
    id,
    createdAt,
    reason,
    size
  }))
}
