import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createLocalLogger } from '../src/main/local-logger.js'

const temporaryDirectories = []

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('local structured logger', () => {
  it('writes NDJSON and exports a redacted bundle', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'easymarkdown-log-'))
    temporaryDirectories.push(directory)
    let clock = 1000
    const logger = createLocalLogger({
      directory,
      context: { appVersion: '1.4.0', userDataPath: directory },
      now: () => clock++
    })

    logger.error('renderer.failure', {
      documentContent: '# do not export',
      message: 'Failure in C:\\Users\\Alice\\draft.md',
      token: 'secret-token'
    })

    const line = await readFile(join(directory, 'main.ndjson'), 'utf8')
    expect(JSON.parse(line)).toMatchObject({ level: 'error', event: 'renderer.failure' })
    const bundle = logger.createBundle({ platform: 'win32' })
    const json = JSON.stringify(bundle)
    expect(bundle.entries).toHaveLength(1)
    expect(json).not.toContain('do not export')
    expect(json).not.toContain('Alice')
    expect(json).not.toContain('secret-token')
    expect(json).not.toContain(directory)
  })

  it('rotates bounded log files before appending', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'easymarkdown-log-'))
    temporaryDirectories.push(directory)
    const logger = createLocalLogger({ directory, maxBytes: 220, maxFiles: 3 })
    for (let index = 0; index < 12; index++) {
      logger.info('rotation.test', { index, message: 'x'.repeat(70) })
    }
    expect(existsSync(join(directory, 'main.ndjson'))).toBe(true)
    expect(existsSync(join(directory, 'main.ndjson.1'))).toBe(true)
    expect(existsSync(join(directory, 'main.ndjson.2'))).toBe(true)
    expect(existsSync(join(directory, 'main.ndjson.3'))).toBe(false)
  })
})
