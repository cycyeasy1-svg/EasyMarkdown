import { test, expect } from '@playwright/test'
import { launchApp, fixture, selectStatusViewMode } from './helpers.js'

test('Source + Keep stays mounted and synchronizes edits, position, and preview pinning', async () => {
  const { page, cleanup } = await launchApp([
    fixture('source-keep-split.md'),
    fixture('keep-structure.md')
  ])
  try {
    await page.locator('.tab', { hasText: 'source-keep-split.md' }).click()
    await expect(page.locator('.km-doc:visible')).toBeVisible()
    await expect(page.locator('.hm-engine-mode')).toContainText('保持')
    await expect(page.locator('.hm-view-mode-control .hm-view-mode-btn')).toHaveCount(1)
    await expect(page.locator('.hm-view-mode-btn')).toContainText('富文本')
    await expect(page.locator('.hm-view-mode-btn')).toHaveAttribute(
      'title',
      '切换显示方式（富文本 → 源码 → 富文本 + 源码）'
    )
    await expect(page.locator('.hm-mode-caret')).toHaveCount(0)

    await selectStatusViewMode(page, 'richSource')
    await expect(page.locator('.hm-view-mode-btn')).toContainText('富文本 + 源码')

    const source = page.locator('textarea.source-editor:visible')
    const keep = page.locator('.editor-scroll.km-scroll:visible .km-doc')
    const keepScroller = page.locator('.editor-scroll.km-scroll:visible')
    await expect(source).toBeVisible()
    await expect(keep).toBeVisible()
    await expect(page.locator('.hm-source-split-tools')).toBeVisible()

    await keep.evaluate((element) => {
      element.dataset.e2eMountToken = 'same-node'
    })
    const beforeBoxes = await Promise.all([source.boundingBox(), keep.boundingBox()])
    expect(beforeBoxes[0].x).toBeLessThan(beforeBoxes[1].x)
    await page.locator('.hm-source-split-tools button[title*="交换"]').click()
    const afterBoxes = await Promise.all([source.boundingBox(), keep.boundingBox()])
    expect(afterBoxes[0].x).toBeGreaterThan(afterBoxes[1].x)
    await expect(keep).toHaveAttribute('data-e2e-mount-token', 'same-node')

    const current = await source.inputValue()
    await source.fill(current.replace('Source Keep Sync', 'Source Keep Edited'))
    await expect(keep.getByRole('heading', { name: 'Source Keep Edited' })).toBeVisible()

    await keep.locator('.km-task-cb').check()
    await expect.poll(() => source.inputValue()).toContain('- [x] dual task')

    const targetBlock = keep.locator('.km-block', { hasText: 'Double-clicking this Keep block' })
    await targetBlock.dblclick()
    await expect.poll(async () => {
      return source.evaluate((element) =>
        element.value.slice(element.selectionStart, element.selectionEnd)
      )
    }).toContain('Double-clicking this Keep block')

    await source.evaluate((element) => {
      element.scrollTop = element.scrollHeight
      element.dispatchEvent(new Event('scroll'))
    })
    await expect.poll(() => keepScroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(500)

    const highlightOffset = await source.evaluate((element) => {
      const full = element.__hmSourceApi.getFullValue()
      return full.indexOf('Paragraph 10')
    })
    await source.evaluate((element, offset) => {
      element.__hmSourceApi.restoreFullSelection(
        { start: offset, end: offset },
        { focus: true, notify: true }
      )
    }, highlightOffset)
    await expect(keep.locator('.km-source-position')).toContainText('Paragraph 10')

    await page.locator('.hm-source-split-tools button[title*="固定当前"]').click()
    await page.locator('.tab', { hasText: 'keep-structure.md' }).click()
    await expect(source).toHaveValue(/Keep structure/)
    await expect(keep.getByRole('heading', { name: 'Source Keep Edited' })).toBeVisible()
    await expect(page.locator('.hm-source-split-label')).toContainText('source-keep-split.md')
  } finally {
    await cleanup()
  }
})
