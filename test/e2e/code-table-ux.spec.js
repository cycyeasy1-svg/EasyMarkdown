import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp, selectStatusViewMode } from './helpers.js'

const markdown = [
  '# Code and table UX',
  '',
  '```javascript',
  'alpha',
  '',
  'omega',
  '```',
  '',
  '| first | second |',
  '| --- | --- |',
  '| editable | value |',
  ''
].join('\n')

const withDocument = async (run) => {
  const dir = mkdtempSync(join(tmpdir(), 'em-code-table-'))
  const file = join(dir, 'code-table.md')
  writeFileSync(file, markdown, 'utf8')
  const session = await launchApp([file])
  try {
    await session.page.locator('.tab', { hasText: 'code-table.md' }).click()
    await run(session)
  } finally {
    await session.cleanup()
    rmSync(dir, { recursive: true, force: true })
  }
}

test('shared Keep code rows show CSS line numbers and copy source without counters', async () => {
  await withDocument(async ({ app, page }) => {
    const rows = page.locator('.km-doc:visible .hm-code-line')
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0).locator('.hm-code-line-text')).toHaveText('alpha')
    await expect(rows.nth(1).locator('.hm-code-line-text')).toHaveText('')
    await expect(rows.nth(2).locator('.hm-code-line-text')).toHaveText('omega')

    const counterStyles = await rows.evaluateAll((elements) =>
      elements.map((element) => ({
        content: getComputedStyle(element, '::before').content,
        increment: getComputedStyle(element).counterIncrement
      }))
    )
    expect(counterStyles).toEqual([
      { content: 'counter(hm-code-line)', increment: 'hm-code-line 1' },
      { content: 'counter(hm-code-line)', increment: 'hm-code-line 1' },
      { content: 'counter(hm-code-line)', increment: 'hm-code-line 1' }
    ])

    await page.locator('.km-doc:visible code.hm-code-lines').evaluate((code) => {
      const range = document.createRange()
      range.selectNodeContents(code)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
    })
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C')
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe('alpha\n\nomega')
  })
})

test('Milkdown edits a table on first click while Keep keeps selection-first behavior', async () => {
  await withDocument(async ({ page }) => {
    const keepCell = page.locator('.km-doc:visible .km-table td', { hasText: 'editable' })
    await keepCell.click()
    await expect(page.locator('.km-cell-pop')).toHaveCount(0)
    await page.keyboard.press('Enter')
    await expect(page.locator('.km-cell-pop .km-cp-input')).toBeVisible()
    await page.locator('.km-cell-pop .km-cp-actions button:not(.ok)').click()

    await page.locator('button.hm-engine-mode').click()
    await expect(page.locator('.ProseMirror:visible')).toBeVisible()
    const gutterNumbers = page.locator(
      '.ProseMirror:visible .milkdown-code-block .cm-lineNumbers .cm-gutterElement'
    )
    await expect(gutterNumbers.filter({ hasText: /^1$/ })).toHaveCount(1)
    await expect(gutterNumbers.filter({ hasText: /^3$/ })).toHaveCount(1)

    const milkdownCell = page.locator('.ProseMirror:visible .milkdown-table-block td').first()
    await expect(milkdownCell).toHaveText('editable')
    await milkdownCell.click({ position: { x: 24, y: 14 } })
    await page.keyboard.type('X')
    await expect(milkdownCell).toContainText('X')

    await selectStatusViewMode(page, 'source')
    await expect(page.locator('textarea.source-editor:visible')).toHaveValue(/X/)
  })
})
