import { test, expect } from '@playwright/test'
import { launchApp, fixture } from './helpers.js'

test('help center opens with F1, searches localized content, and returns to the mounted editor', async () => {
  const { page, cleanup } = await launchApp([fixture('welcome.md')])
  try {
    await page.locator('.tab', { hasText: 'welcome.md' }).click()
    await expect(page.locator('.km-doc')).toBeVisible()

    await page.keyboard.press('F1')
    const help = page.locator('.hm-help')
    await expect(help).toBeVisible()
    await expect(help.getByRole('heading', { level: 1 })).toHaveText('3 分钟快速上手')
    await expect(help.locator('.hm-help-prose')).not.toContainText('**')

    const search = help.getByRole('searchbox', { name: '搜索使用指南' })
    await search.fill('表格 筛选')
    await expect(help.locator('.hm-help-result-count')).toHaveText(/条结果/)
    await help.locator('.hm-help-topic', { hasText: '表格与类 Excel 编辑' }).click()
    await expect(help.getByRole('heading', { level: 1 })).toHaveText('表格与类 Excel 编辑')

    await page.setViewportSize({ width: 900, height: 700 })
    const mobileContents = help.getByRole('combobox', { name: '目录' })
    await expect(mobileContents).toBeVisible()
    await expect(help.locator('.hm-help-topic-list')).toBeHidden()
    await mobileContents.selectOption('shortcuts')
    await expect(help.getByRole('heading', { level: 1 })).toHaveText('键盘快捷键速查')

    // First Esc clears the active search; second Esc leaves the internal page.
    await page.keyboard.press('Escape')
    await expect(search).toHaveValue('')
    await page.keyboard.press('Escape')
    await expect(help).toHaveCount(0)
    await expect(page.locator('.km-doc')).toBeVisible()
  } finally {
    await cleanup()
  }
})

test('welcome, status bar, and command palette expose help entry points', async () => {
  const { page, cleanup } = await launchApp([fixture('welcome.md')])
  try {
    await page.locator('.activity-home').click()
    await page.locator('.welcome-help').click()
    await expect(page.locator('.hm-help')).toBeVisible()
    await page.locator('.hm-help-close').click()

    await page.locator('.tab', { hasText: 'welcome.md' }).click()
    await page.locator('.statusbar button[title^="帮助与学习"]').click()
    await page.locator('.hm-help-pop-item', { hasText: '键盘快捷键' }).click()
    await expect(page.locator('.hm-help h1')).toHaveText('键盘快捷键速查')
    await page.locator('.hm-help-close').click()

    await page.locator('button[title^="Command palette"]').click()
    await page.getByRole('combobox', { name: '搜索范围' }).selectOption('commands')
    await page.locator('.palette-input input').fill('使用指南')
    await expect(page.locator('.palette-item', { hasText: '打开使用指南' })).toBeVisible()
  } finally {
    await cleanup()
  }
})
