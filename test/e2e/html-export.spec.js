import { test, expect } from '@playwright/test'
import { launchApp, fixture } from './helpers.js'

const sendMenu = (app, command) => app.evaluate(({ BrowserWindow }, value) => {
  BrowserWindow.getAllWindows()[0]?.webContents.send('menu', value)
}, command)

test('HTML studio previews a Keep document as portable script-free HTML', async () => {
  const { app, page, cleanup } = await launchApp([fixture('images.md')])
  try {
    await page.locator('.tab', { hasText: 'images.md' }).click()
    await expect(page.locator('.km-doc img')).toBeVisible()
    await sendMenu(app, 'exportHtml')

    await expect(page.locator('.hm-html-studio')).toBeVisible()
    const preview = page.frameLocator('.hm-html-preview iframe')
    await expect(preview.locator('.doc img')).toHaveAttribute('src', /^data:image\//)
    await expect(preview.locator('script')).toHaveCount(0)

    await page.locator('.hm-html-viewport-controls button').last().click()
    await expect(page.locator('.hm-html-preview-stage')).toHaveClass(/mobile/)
  } finally {
    await cleanup()
  }
})
