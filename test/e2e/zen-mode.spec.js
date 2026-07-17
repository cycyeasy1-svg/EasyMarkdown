import { test, expect } from '@playwright/test'

import { fixture, launchApp } from './helpers.js'

test('Zen mode hides chrome, reveals it at the screen edge, and exits without losing the editor', async () => {
  const { page, cleanup } = await launchApp([fixture('keep-structure.md')])
  try {
    await page.locator('.tab', { hasText: 'keep-structure.md' }).click()
    await expect(page.locator('.km-doc:visible')).toBeVisible()

    await page.keyboard.press('Control+K')
    await page.keyboard.press('z')
    const app = page.locator('.app')
    await expect(app).toHaveClass(/zen-mode/)
    await expect(page.locator('.topbar')).toBeHidden()
    await expect(page.locator('.statusbar')).toBeHidden()
    await expect(page.locator('.pane-left')).toBeHidden()
    await expect(page.locator('.km-doc:visible')).toContainText('Keep structure')

    await page.mouse.move(400, 1)
    await expect(app).toHaveClass(/zen-reveal/)
    await expect(page.locator('.topbar')).toBeVisible()

    await page.locator('.hm-zen-exit').click()
    await expect(app).not.toHaveClass(/zen-mode/)
    await expect(page.locator('.topbar')).toBeVisible()
    await expect(page.locator('.km-doc:visible')).toContainText('Keep structure')
  } finally {
    await cleanup()
  }
})
