import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp } from './helpers.js'

test('sidebar context menu copies the file path and name to the system clipboard', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'em-clipboard-'))
  const file = join(dir, 'copy-me.md')
  writeFileSync(file, '# Clipboard\n', 'utf8')

  const { app, page, cleanup } = await launchApp([dir])
  try {
    const row = page.locator('.tree-row[role="treeitem"]', {
      has: page.locator('.tree-label', { hasText: /^copy-me\.md$/ })
    })
    await expect(row).toBeVisible()

    await row.click({ button: 'right' })
    await page.getByRole('menuitem', { name: '复制文件路径' }).click()
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(file)

    await row.click({ button: 'right' })
    await page.getByRole('menuitem', { name: '复制文件名' }).click()
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('copy-me.md')
  } finally {
    await cleanup()
    rmSync(dir, { recursive: true, force: true })
  }
})
