import { dirname } from 'node:path'

export const MAX_SAVE_DIR_ENTRIES = 200

export function resolveSaveDir(state, sourcePath) {
  if (sourcePath) return state.saveDirs?.[sourcePath] || dirname(sourcePath)
  return state.lastSaveDir || ''
}

export function withRecordedSaveDir(state, sourcePath, chosenDir) {
  if (!chosenDir) return state
  const next = { saveDirs: { ...(state.saveDirs || {}) }, lastSaveDir: chosenDir }
  if (!sourcePath) return next
  const entries = Object.entries(next.saveDirs).filter(([key]) => key !== sourcePath)
  entries.push([sourcePath, chosenDir])
  while (entries.length > MAX_SAVE_DIR_ENTRIES) entries.shift()
  next.saveDirs = Object.fromEntries(entries)
  return next
}
