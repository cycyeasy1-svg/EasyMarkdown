import { test, expect } from '@playwright/test'
import { launchApp, fixture } from './helpers.js'

test('desktop Keep renders sanitized raw HTML blocks and inline fragments', async () => {
  const { page, cleanup } = await launchApp([fixture('keep-html.md')])
  try {
    await page.locator('.tab', { hasText: 'keep-html.md' }).click()
    await expect(page.locator('.km-doc')).toBeVisible()

    const table = page.locator('.hm-html-block table').first()
    await expect(table).toBeVisible()
    await expect(table).toHaveAttribute('border', '1')
    await expect(table).not.toHaveAttribute('onclick', /.+/)
    await expect(table.locator('th').first()).toHaveAttribute('rowspan', '2')
    await expect(table.locator('th').nth(1)).toHaveAttribute('colspan', '2')

    const badge = table.locator('span', { hasText: 'Ready' })
    await expect(badge).toHaveCSS('background-color', 'rgb(255, 255, 0)')
    await expect(badge).toHaveCSS('position', 'static')
    await expect(badge).not.toHaveAttribute('onmouseover', /.+/)
    await expect(table.locator('script')).toHaveCount(0)

    const inline = page.locator('.hm-html-inline span', { hasText: 'red text' })
    await expect(inline).toHaveCSS('color', 'rgb(255, 0, 0)')

    const nestedStrike = page.locator('.hm-html-inline font s', { hasText: 'removed text' })
    await expect(nestedStrike).toBeVisible()
    await expect(nestedStrike).toHaveCSS('text-decoration-line', 'line-through')
    await expect(nestedStrike).toHaveCSS('color', 'rgb(255, 0, 0)')

    const shell = page.locator('.hm-html-block .markdown-shell')
    await expect(shell).toBeVisible()
    await expect(shell).not.toHaveAttribute('onclick', /.+/)
    await expect(shell.locator('.km-table')).toBeVisible()
    await expect(shell.locator('strong')).toHaveText('ok')
    await expect(shell).not.toContainText('|---|---|')

    // The desktop app's alternate Milkdown engine uses the same nested-Markdown
    // HTML renderer and keeps the exact raw source in its atomic HTML nodes.
    await page.locator('button[title*="切换编辑模式"]').click()
    const rich = page.locator('.ProseMirror:visible')
    await expect(rich).toBeVisible()
    await expect(rich.locator('.hm-html-inline font s', { hasText: 'removed text' })).toBeVisible()
    await expect(rich.locator('.hm-html-block .markdown-shell .km-table')).toBeVisible()
    await expect(rich.locator('.hm-html-block .markdown-shell strong')).toHaveText('ok')
  } finally {
    await cleanup()
  }
})
