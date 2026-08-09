import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createCrashLoopTracker,
  markCrashLoopHealthy,
  planCrashLoopLaunch
} from '../src/main/crash-loop.js'

const temporaryDirectories = []

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('crash-loop planning', () => {
  it('enters safe mode after three recent unclean launches', () => {
    let state
    let launch
    for (let index = 0; index <= 3; index++) {
      launch = planCrashLoopLaunch(state, 1000 + index * 100)
      state = launch.state
    }
    expect(launch.safeMode).toBe(true)
    expect(state.consecutiveFailures).toBe(3)
  })

  it('resets the failure count after a healthy renderer mount', () => {
    const launch = planCrashLoopLaunch({
      running: true,
      startedAt: 900,
      consecutiveFailures: 2
    }, 1000)
    expect(launch.safeMode).toBe(true)
    expect(markCrashLoopHealthy(launch.state, 1100)).toMatchObject({
      running: false,
      consecutiveFailures: 0,
      lastHealthyAt: 1100
    })
  })

  it('persists launch and healthy state without throwing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'easymarkdown-crash-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'state.json')
    let clock = 1000
    const first = createCrashLoopTracker({ filePath, now: () => clock++ })
    expect(first.safeMode).toBe(false)

    const second = createCrashLoopTracker({ filePath, now: () => clock++ })
    expect(second.getState().consecutiveFailures).toBe(1)
    second.markHealthy()

    const third = createCrashLoopTracker({ filePath, now: () => clock++ })
    expect(third.getState().consecutiveFailures).toBe(0)
  })
})
