import { test, expect } from '@playwright/test'
import { dirname } from 'node:path'
import { launchApp, fixture, selectStatusViewMode } from './helpers.js'

const workspace = dirname(fixture('palette-workspace/alpha.md'))
const openPalette = (page) => page.locator('button[title^="Command palette"]').click()

test('command palette separates files, commands, headings, workspace headings, line, and help modes', async () => {
  const { page, cleanup } = await launchApp([workspace])
  try {
    await openPalette(page)
    const input = page.locator('.palette-input input')
    await expect(page.locator('.palette-mode-badge')).toHaveText('文件')
    await expect(page.locator('.palette-item[data-kind="cmd"]')).toHaveCount(0)
    await expect(page.locator('.palette-item[data-kind="file"]')).toHaveCount(2)

    await input.fill('beta')
    await input.press('Enter')
    await expect(page.locator('.tab', { hasText: 'beta.md' })).toBeVisible()
    await expect(page.locator('.km-doc:visible')).toContainText('Beta Home')

    // The just-opened file is promoted by palette MRU when no prefix is used.
    await openPalette(page)
    await expect(page.locator('.palette-item[data-kind="file"]').first()).toContainText('beta.md')

    await input.fill('>保存')
    const save = page.locator('.palette-item[data-kind="cmd"]', { hasText: '保存' }).first()
    await expect(save).toBeVisible()
    await expect(save.locator('.pi-shortcut')).toHaveText('Ctrl+S')

    await input.fill('@Shared Beta')
    await expect(page.locator('.palette-item[data-kind="heading"]')).toContainText('Shared Beta Topic')

    await input.fill('#Shared Alpha')
    await expect(page.locator('.palette-mode-badge')).toHaveText('工作区标题')
    const workspaceHeading = page.locator('.palette-item[data-kind="workspace-heading"]', {
      hasText: 'Shared Alpha Topic'
    })
    await expect(workspaceHeading).toBeVisible()
    await expect(workspaceHeading.locator('.pi-hint')).toContainText('palette-workspace/alpha.md')
    await workspaceHeading.click()
    await expect(page.locator('.tab', { hasText: 'alpha.md' })).toBeVisible()

    await selectStatusViewMode(page, 'source')
    const source = page.locator('textarea.source-editor')
    await expect(source).toBeVisible()
    await openPalette(page)
    await input.fill(':5')
    await input.press('Enter')
    await expect.poll(() =>
      source.evaluate((element) => element.value.slice(element.selectionStart, element.selectionEnd))
    ).toContain('## Shared Alpha Topic')

    await openPalette(page)
    await input.fill('?')
    await expect(page.locator('.palette-item[data-kind="help"]')).toHaveCount(5)
    await page.locator('.palette-item[data-kind="help"]', { hasText: '命令' }).click()
    await expect(input).toHaveValue('>')
    await expect(page.locator('.palette-mode-badge')).toHaveText('命令')
  } finally {
    await cleanup()
  }
})
