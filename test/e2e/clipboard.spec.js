import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp, fixture } from './helpers.js'

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

test('Keep table context menu copies cell, row, column and table to the system clipboard', async () => {
  const { app, page, cleanup } = await launchApp([fixture('filter.md')])
  try {
    await page.locator('.tab', { hasText: 'filter.md' }).click()
    const cell = page.locator('.km-doc table.km-table[data-ti="0"] tbody td[data-ci="0"]').first()
    await expect(cell).toHaveText('apple')

    const copyFromMenu = async (label, expectedText) => {
      await app.evaluate(({ clipboard }) => clipboard.writeText('clipboard-not-written'))
      await cell.click({ button: 'right' })
      await page.locator('.km-table-menu .km-tm-item', { hasText: label }).click()
      await expect
        .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
        .toBe(expectedText)
      return app.evaluate(({ clipboard }) => ({
        text: clipboard.readText(),
        html: clipboard.readHTML()
      }))
    }

    await copyFromMenu('复制当前单元格', 'apple')
    await copyFromMenu('复制当前行', 'apple\tred')
    await copyFromMenu('复制当前列', 'fruit\napple\nbanana\ncherry\ngrape')
    const tableText = [
      'fruit\tcolor',
      'apple\tred',
      'banana\tyellow',
      'cherry\tred',
      'grape\tpurple'
    ].join('\n')
    const wholeTable = await copyFromMenu('复制整个表格', tableText)
    expect(wholeTable.text).toBe(tableText)
    expect(wholeTable.html).toContain('<table')
    expect(wholeTable.html).toContain('apple')
  } finally {
    await cleanup()
  }
})
