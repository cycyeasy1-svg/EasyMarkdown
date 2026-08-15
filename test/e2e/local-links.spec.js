import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { launchApp } from './helpers.js'

test('Markdown stays in-app while safe attachments use the guarded shell path', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'em-local-links-'))
  const source = join(dir, 'source.md')
  const target = join(dir, 'target.md')
  const report = join(dir, 'report.txt')
  const blocked = join(dir, 'payload.cmd')
  writeFileSync(target, '# Target\n\n## Destination\n', 'utf8')
  writeFileSync(report, 'safe attachment', 'utf8')
  writeFileSync(blocked, 'echo blocked', 'utf8')
  writeFileSync(
    source,
    [
      '# Links',
      '',
      '[Markdown](target.md#destination)',
      '',
      '[File URL](' + pathToFileURL(target).href + '#destination)',
      '',
      '[Report](report.txt)',
      '',
      '[Blocked](payload.cmd)'
    ].join('\n'),
    'utf8'
  )

  const { app, page, cleanup } = await launchApp([source])
  try {
    await app.evaluate(({ shell }) => {
      globalThis.__hmE2eOpenedPaths = []
      shell.openPath = async (path) => {
        globalThis.__hmE2eOpenedPaths.push(path)
        return ''
      }
    })
    const doc = page.locator('.km-doc:visible')
    await doc.getByRole('link', { name: 'Markdown' }).click()
    await expect(page.locator('.tab', { hasText: 'target.md' })).toBeVisible()
    expect(await app.evaluate(() => globalThis.__hmE2eOpenedPaths)).toEqual([])

    await page.locator('.tab', { hasText: 'source.md' }).click()
    await doc.getByRole('link', { name: 'Report' }).click()
    await expect.poll(() => app.evaluate(() => globalThis.__hmE2eOpenedPaths.length)).toBe(1)
    await doc.getByRole('link', { name: 'Blocked' }).click()
    await expect(page.locator('.hm-toast')).toContainText(/Blocked unsafe file type/i)
    expect(await app.evaluate(() => globalThis.__hmE2eOpenedPaths.length)).toBe(1)

    await doc.getByRole('link', { name: 'File URL' }).click()
    await expect(page.locator('.tab', { hasText: 'target.md' })).toBeVisible()
    expect(await app.evaluate(() => globalThis.__hmE2eOpenedPaths.length)).toBe(1)
  } finally {
    await cleanup()
    rmSync(dir, { recursive: true, force: true })
  }
})
