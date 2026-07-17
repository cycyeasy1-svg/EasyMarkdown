import { test, expect } from '@playwright/test'
import { launchApp, fixture } from './helpers.js'

async function openFixture() {
  const result = await launchApp([fixture('keep-structure.md')])
  await result.page.locator('.tab', { hasText: 'keep-structure.md' }).click()
  await expect(result.page.locator('.km-doc')).toBeVisible()
  return result
}

test('Keep tasks toggle as one undoable source-line transaction', async () => {
  const { page, cleanup } = await openFixture()
  try {
    const firstTask = page.locator('.km-task-cb[data-line="2"]')
    await expect(firstTask).toBeEnabled()
    await expect(firstTask).not.toBeChecked()
    await firstTask.check()
    await expect(page.locator('.hm-toast')).toContainText('任务已完成')
    await expect(page.locator('.km-task-cb[data-line="2"]')).toBeChecked()

    await page.locator('.status-history-btn.undo').click()
    await expect(page.locator('.km-task-cb[data-line="2"]')).not.toBeChecked()
    await page.locator('.status-history-btn.redo').click()
    await expect(page.locator('.km-task-cb[data-line="2"]')).toBeChecked()
  } finally {
    await cleanup()
  }
})

test('Keep block actions insert, duplicate and delete complete blocks with draft protection', async () => {
  const { page, cleanup } = await openFixture()
  try {
    const alpha = page.locator('.km-block', { hasText: 'Paragraph alpha.' })
    await alpha.click()
    await page.locator('button[title^="Command palette"]').click()
    const paletteInput = page.locator('.palette-input input')
    await paletteInput.fill('>内容块：在上方插入')
    await page.locator('.palette-item[data-kind="cmd"]', {
      hasText: '内容块：在上方插入'
    }).click()

    const insertEditor = page.locator('.km-block-insert .km-src-editor')
    await expect(insertEditor).toBeFocused()
    await insertEditor.fill('Inserted paragraph.')

    // A structural command cannot bypass a pending Keep draft.
    await page.locator('button[title^="Command palette"]').click()
    await paletteInput.fill('>内容块：删除')
    await page.locator('.palette-item[data-kind="cmd"]', { hasText: '内容块：删除' }).click()
    await expect(page.locator('.hm-toast')).toContainText('请先确认或取消当前的 Keep 编辑')
    await expect(insertEditor).toBeFocused()

    await insertEditor.press('Control+Enter')
    await expect(page.locator('.km-block', { hasText: 'Inserted paragraph.' })).toBeVisible()

    // Right-clicking the complete nested list duplicates the parent, child and
    // continuation together. One Undo removes the whole duplicate.
    const nestedList = page.locator('.km-block', { hasText: 'Parent item' })
    await nestedList.click({ button: 'right' })
    await page.locator('.km-table-menu .km-tm-item', { hasText: '复制内容块' }).click()
    await expect(page.locator('.km-doc li', { hasText: 'Parent item' })).toHaveCount(2)
    await expect(page.locator('.km-doc li li', { hasText: 'Nested child' })).toHaveCount(2)
    await page.locator('.status-history-btn.undo').click()
    await expect(page.locator('.km-doc li', { hasText: 'Parent item' })).toHaveCount(1)
    await expect(page.locator('.km-doc li li', { hasText: 'Nested child' })).toHaveCount(1)

    const beta = page.locator('.km-block', { hasText: 'Paragraph beta.' })
    await beta.click({ button: 'right' })
    await page.locator('.km-table-menu .km-tm-item', { hasText: '删除内容块' }).click()
    await expect(page.getByText('Paragraph beta.', { exact: true })).toHaveCount(0)
    await page.locator('.status-history-btn.undo').click()
    await expect(page.getByText('Paragraph beta.', { exact: true })).toHaveCount(1)
  } finally {
    await cleanup()
  }
})
