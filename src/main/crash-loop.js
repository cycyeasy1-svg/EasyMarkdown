import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const CRASH_LOOP_WINDOW_MS = 5 * 60 * 1000
export const CRASH_LOOP_THRESHOLD = 3

const emptyState = () => ({
  version: 1,
  running: false,
  startedAt: 0,
  consecutiveFailures: 0,
  lastHealthyAt: 0
})

export function planCrashLoopLaunch(
  previous,
  now,
  { windowMs = CRASH_LOOP_WINDOW_MS, threshold = CRASH_LOOP_THRESHOLD } = {}
) {
  const prior = previous && typeof previous === 'object' ? previous : emptyState()
  const previousStart = Number(prior.startedAt) || 0
  const recentUncleanLaunch =
    prior.running === true && previousStart > 0 && now >= previousStart && now - previousStart <= windowMs
  const consecutiveFailures = recentUncleanLaunch
    ? Math.max(0, Number(prior.consecutiveFailures) || 0) + 1
    : 0

  return {
    safeMode: consecutiveFailures >= threshold,
    state: {
      version: 1,
      running: true,
      startedAt: now,
      consecutiveFailures,
      lastHealthyAt: Number(prior.lastHealthyAt) || 0
    }
  }
}

export function markCrashLoopHealthy(state, now) {
  return {
    ...emptyState(),
    startedAt: Number(state?.startedAt) || 0,
    lastHealthyAt: now
  }
}

export function createCrashLoopTracker({ filePath, now = () => Date.now() }) {
  const readState = () => {
    try {
      if (!existsSync(filePath)) return emptyState()
      return JSON.parse(readFileSync(filePath, 'utf8'))
    } catch {
      return emptyState()
    }
  }

  const writeState = (value) => {
    try {
      mkdirSync(dirname(filePath), { recursive: true })
      const temporaryPath = `${filePath}.tmp`
      writeFileSync(temporaryPath, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 })
      if (existsSync(filePath)) rmSync(filePath, { force: true })
      renameSync(temporaryPath, filePath)
    } catch {
      // Recovery metadata must never prevent the editor from launching.
    }
  }

  const launch = planCrashLoopLaunch(readState(), now())
  let state = launch.state
  writeState(state)

  return {
    safeMode: launch.safeMode,
    getState: () => ({ ...state }),
    markHealthy() {
      state = markCrashLoopHealthy(state, now())
      writeState(state)
    }
  }
}
