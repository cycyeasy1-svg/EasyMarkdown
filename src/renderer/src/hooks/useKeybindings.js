import { useCallback, useMemo, useState } from 'react'
import {
  getEffectiveKeybindingMap,
  KEYBINDINGS_KEY,
  normalizeKeybindingOverrides
} from '../../../shared/keybindings.js'

const load = () => {
  try {
    const value = JSON.parse(localStorage.getItem(KEYBINDINGS_KEY) || '{}')
    return normalizeKeybindingOverrides(value.overrides)
  } catch {
    return {}
  }
}

export function useKeybindings(platform) {
  const [overrides, setOverrides] = useState(load)
  const persist = useCallback((next) => {
    const normalized = normalizeKeybindingOverrides(next)
    try {
      localStorage.setItem(KEYBINDINGS_KEY, JSON.stringify({ version: 1, overrides: normalized }))
    } catch {
      /* localStorage unavailable — keep the in-memory preference */
    }
    return normalized
  }, [])
  const update = useCallback((commandId, bindings) => {
    setOverrides((previous) => persist({ ...previous, [commandId]: bindings }))
  }, [persist])
  const reset = useCallback((commandId) => {
    setOverrides((previous) => {
      const next = { ...previous }
      delete next[commandId]
      return persist(next)
    })
  }, [persist])
  const resetAll = useCallback(() => setOverrides(persist({})), [persist])
  const effective = useMemo(
    () => getEffectiveKeybindingMap(overrides, platform),
    [overrides, platform]
  )
  return { overrides, effective, update, reset, resetAll }
}
