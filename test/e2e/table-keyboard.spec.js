import { test, expect } from '@playwright/test'
import { launchApp, fixture } from './helpers.js'

async function openTableFixture() {
  const result = await launchApp([fixture('filter.md')])
  await result.page.locator('.tab', { hasText: 'filter.md' }).click()
  await expect(result.page.locator('.km-doc')).toBeVisible()
  return result
}

test('Keep table supports keyboard navigation, editing, filtering and context actions', async () => {
  const { page, cleanup } = await openTableFixture()
  try {
    const table = page.locator('.km-doc table.km-table[data-ti="0"]')
    const apple = table.locator('tbody tr[data-ri="0"] td[data-ci="0"]')
    await apple.click()

    await expect(apple).toHaveClass(/km-cell-selected/)
    await expect(apple).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.km-cell-tools')).toHaveCount(0)

    await page.keyboard.press('ArrowRight')
    await expect(table.locator('tbody tr[data-ri="0"] td[data-ci="1"]')).toHaveClass(
      /km-cell-selected/
    )
    await page.keyboard.press('ArrowDown')
    await expect(table.locator('tbody tr[data-ri="1"] td[data-ci="1"]')).toHaveClass(
      /km-cell-selected/
    )
    await page.keyboard.press('Shift+Tab')
    const banana = table.locator('tbody tr[data-ri="1"] td[data-ci="0"]')
    await expect(banana).toHaveClass(/km-cell-selected/)

    await page.keyboard.press('Enter')
    await expect(page.locator('.km-cell-pop .km-cp-input')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.km-cell-pop')).toHaveCount(0)
    await expect(banana).toHaveClass(/km-cell-selected/)

    await page.keyboard.press('Alt+ArrowDown')
    await expect(page.locator('.km-filter-pop')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.km-filter-pop')).toHaveCount(0)

    await page.keyboard.press('Shift+F10')
    await expect(page.locator('.km-table-menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.km-table-menu')).toHaveCount(0)
  } finally {
    await cleanup()
  }
})

test('Keep table pastes a TSV rectangle as one undo transaction and exposes commands', async () => {
  const { page, cleanup } = await openTableFixture()
  try {
    const table = page.locator('.km-doc table.km-table[data-ti="0"]')
    const apple = table.locator('tbody tr[data-ri="0"] td[data-ci="0"]')
    await apple.click()
    await apple.evaluate((cell) => {
      const data = new DataTransfer()
      data.setData('text/plain', 'alpha\tred-2\nbeta\tyellow-2')
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', { value: data })
      cell.dispatchEvent(event)
    })

    await expect(table.locator('tbody tr[data-ri="0"] td[data-ci="0"]')).toHaveAttribute(
      'data-raw',
      'alpha'
    )
    await expect(table.locator('tbody tr[data-ri="0"] td[data-ci="1"]')).toHaveAttribute(
      'data-raw',
      'red-2'
    )
    await expect(table.locator('tbody tr[data-ri="1"] td[data-ci="0"]')).toHaveAttribute(
      'data-raw',
      'beta'
    )
    await expect(table.locator('tbody tr[data-ri="1"] td[data-ci="1"]')).toHaveAttribute(
      'data-raw',
      'yellow-2'
    )
    await expect(page.locator('.hm-toast')).toContainText('已粘贴 2 × 2 个单元格')

    // One Undo restores the whole rectangle, proving it was recorded as one
    // Keep history transaction instead of four cell edits.
    await page.locator('.status-history-btn.undo').click()
    await expect(table.locator('tbody tr[data-ri="0"] td[data-ci="0"]')).toHaveAttribute(
      'data-raw',
      'apple'
    )
    await expect(table.locator('tbody tr[data-ri="1"] td[data-ci="1"]')).toHaveAttribute(
      'data-raw',
      'yellow'
    )

    // The selected cell remains the command target while the palette has focus.
    await page.locator('button[title^="Command palette"]').click()
    const input = page.locator('.palette-input input')
    await input.fill('>表格：在下方插入行')
    await page.locator('.palette-item[data-kind="cmd"]', {
      hasText: '表格：在下方插入行'
    }).click()
    await expect(table.locator('tbody tr')).toHaveCount(5)
  } finally {
    await cleanup()
  }
})
