import { test, expect } from '@playwright/test'
import { launchApp, fixture } from './helpers.js'

test('desktop Keep renders sanitized raw HTML blocks and inline fragments', async () => {
  const { page, cleanup } = await launchApp([fixture('keep-html.md')])
  try {
    await page.locator('.tab', { hasText: 'keep-html.md' }).click()
    await expect(page.locator('.km-doc')).toBeVisible()

    const table = page.locator('.hm-html-block table')
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
  } finally {
    await cleanup()
  }
})
