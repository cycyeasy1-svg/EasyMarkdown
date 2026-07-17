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
    const modeSelect = page.locator('.palette-mode-control select')
    await expect(modeSelect).toHaveValue('files')
    await expect(input).toHaveAttribute('placeholder', '搜索最近文件和工作区文件…')
    await expect(page.locator('.palette-item[data-kind="cmd"]')).toHaveCount(0)
    await expect(page.locator('.palette-item[data-kind="file"]')).toHaveCount(2)
    const fileIconSizes = await page.locator('.palette-item[data-kind="file"] > svg').evaluateAll((icons) =>
      icons.map((icon) => ({ width: icon.getBoundingClientRect().width, height: icon.getBoundingClientRect().height }))
    )
    const iconWidths = fileIconSizes.map(({ width }) => width)
    const iconHeights = fileIconSizes.map(({ height }) => height)
    expect(Math.max(...iconWidths) - Math.min(...iconWidths)).toBeLessThan(0.01)
    expect(Math.max(...iconHeights) - Math.min(...iconHeights)).toBeLessThan(0.01)
    expect(fileIconSizes.every(({ width, height }) => width > 15 && height > 15)).toBe(true)

    await input.fill('beta')
    await input.press('Enter')
    await expect(page.locator('.tab', { hasText: 'beta.md' })).toBeVisible()
    await expect(page.locator('.km-doc:visible')).toContainText('Beta Home')

    // The just-opened file is promoted by palette MRU when no prefix is used.
    await openPalette(page)
    await expect(page.locator('.palette-item[data-kind="file"]').first()).toContainText('beta.md')

    await modeSelect.selectOption('commands')
    await expect(input).toHaveAttribute('placeholder', '搜索可执行命令…')
    await input.fill('保存')
    const save = page.locator('.palette-item[data-kind="cmd"]', { hasText: '保存' }).first()
    await expect(save).toBeVisible()
    await expect(save.locator('.pi-shortcut')).toHaveText('Ctrl+S')

    await modeSelect.selectOption('headings')
    await input.fill('Shared Beta')
    await expect(page.locator('.palette-item[data-kind="heading"]')).toContainText('Shared Beta Topic')

    await modeSelect.selectOption('workspaceHeadings')
    await input.fill('Shared Alpha')
    await expect(modeSelect).toHaveValue('workspaceHeadings')
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
    await modeSelect.selectOption('line')
    await input.fill('5')
    await input.press('Enter')
    await expect.poll(() =>
      source.evaluate((element) => element.value.slice(element.selectionStart, element.selectionEnd))
    ).toContain('## Shared Alpha Topic')

    await openPalette(page)
    await input.fill('?')
    await expect(modeSelect).toHaveValue('help')
    await expect(page.locator('.palette-item[data-kind="help"]')).toHaveCount(5)
    await page.locator('.palette-item[data-kind="help"]', { hasText: '命令' }).click()
    await expect(input).toHaveValue('')
    await expect(modeSelect).toHaveValue('commands')
  } finally {
    await cleanup()
  }
})
