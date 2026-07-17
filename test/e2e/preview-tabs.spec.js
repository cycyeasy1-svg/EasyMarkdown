import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { launchApp } from './helpers.js'

test('file-tree single clicks reuse one preview tab while double-click and edits keep tabs open', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'em-preview-tabs-'))
  for (const name of ['a.md', 'b.md', 'c.md']) {
    writeFileSync(join(dir, name), `# ${name[0].toUpperCase()}\n\n${name} body\n`, 'utf8')
  }

  const { page, cleanup } = await launchApp([dir])
  try {
    const row = (name) => page.locator('.tree-row', { hasText: name }).filter({ has: page.locator('.tree-icon') })
    const tab = (name) => page.locator('.tab', { hasText: name })

    await expect(row('a.md')).toBeVisible()
    await row('a.md').click()
    await expect(tab('a.md')).toHaveClass(/preview/)
    await expect(page.locator('.tab.preview')).toHaveCount(1)

    await row('b.md').click()
    await expect(tab('a.md')).toHaveCount(0)
    await expect(tab('b.md')).toHaveClass(/preview/)
    await expect(page.locator('.tab.preview')).toHaveCount(1)

    await row('b.md').dblclick()
    await expect(tab('b.md')).not.toHaveClass(/preview/)
    await expect(page.locator('.tab.preview')).toHaveCount(0)

    await row('c.md').click()
    await expect(tab('b.md')).toBeVisible()
    await expect(tab('c.md')).toHaveClass(/preview/)
    await expect(page.locator('.tab')).toHaveCount(3)

    const activeKeep = page.locator('.editor-scroll.km-scroll:visible')
    await activeKeep.locator('.km-block[data-bi="0"] .km-src-edit').click()
    await activeKeep.locator('.km-src-editor').fill('# C edited')
    await activeKeep.locator('.km-src-actions .ok').click()
    await expect(tab('c.md')).not.toHaveClass(/preview/)

    await row('a.md').click()
    await expect(tab('a.md')).toHaveClass(/preview/)
    await expect(tab('b.md')).toBeVisible()
    await expect(tab('c.md')).toBeVisible()
    await expect(page.locator('.tab')).toHaveCount(4)

    await tab('a.md').click({ button: 'right' })
    await page.locator('.tab-ctxmenu .tab-menu-item', { hasText: '保留此标签' }).click()
    await expect(tab('a.md')).not.toHaveClass(/preview/)
  } finally {
    await cleanup()
    rmSync(dir, { recursive: true, force: true })
  }
})
