import { describe, expect, it } from 'vitest'
import { createLatestTaskRunner } from '../src/main/latest-task-runner.js'

describe('createLatestTaskRunner', () => {
  it('marks the older task stale when a newer task uses the same key', async () => {
    const resolvers = []
    const runner = createLatestTaskRunner((value) =>
      new Promise((resolve) => resolvers.push(() => resolve(value))))
    const first = runner.run('window', 'first')
    const second = runner.run('window', 'second')
    resolvers[0]()
    await first
    await Promise.resolve()
    resolvers[1]()
    await expect(second).resolves.toEqual({ stale: false, value: 'second' })
  })

  it('cancels an active task explicitly', async () => {
    let finish
    const runner = createLatestTaskRunner((value) =>
      new Promise((resolve) => { finish = () => resolve(value) }))
    const task = runner.run('window', 'preview')
    expect(runner.cancel('window')).toBe(true)
    finish()
    await expect(task).resolves.toEqual({ stale: true })
    expect(runner.cancel('window')).toBe(false)
  })

  it('waits for asynchronous abort cleanup before starting the replacement', async () => {
    let running = 0
    let maxRunning = 0
    const starts = []
    const runner = createLatestTaskRunner((value, signal) => new Promise((resolve, reject) => {
      starts.push(value)
      running += 1
      maxRunning = Math.max(maxRunning, running)
      const finish = (callback) => setTimeout(() => {
        running -= 1
        callback()
      }, 10)
      signal.addEventListener('abort', () => finish(() => reject(new Error('canceled'))), { once: true })
      if (value === 'latest') finish(() => resolve(value))
    }))

    const first = runner.run('window', 'printing')
    const latest = runner.run('window', 'latest')
    expect(starts).toEqual(['printing'])
    await expect(first).resolves.toEqual({ stale: true })
    await expect(latest).resolves.toEqual({ stale: false, value: 'latest' })
    expect(starts).toEqual(['printing', 'latest'])
    expect(maxRunning).toBe(1)
  })
})
