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
    resolvers[1]()
    await expect(first).resolves.toEqual({ stale: true })
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
})
