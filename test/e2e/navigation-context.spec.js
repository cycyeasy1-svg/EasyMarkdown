import { test, expect } from '@playwright/test'
import { launchApp, fixture, selectStatusViewMode } from './helpers.js'

test('navigation history restores Keep table and folding context', async () => {
  const { page, cleanup } = await launchApp([fixture('navigation-context.md')])
  try {
    await page.locator('.tab', { hasText: 'navigation-context.md' }).click()
    await expect(page.locator('.km-doc')).toBeVisible()

    const table = page.locator('.km-doc table.km-table[data-ti="0"]')
    const wrap = table.locator('xpath=..')
    const bananaRow = table.locator('tbody tr', { hasText: 'banana' })

    // Capture a temporary filter, a wide horizontal position, a selected cell,
    // and an unrelated collapsed heading in one navigation entry.
    await table.locator('.km-filter-btn[data-ci="0"]').click()
    const filter = page.locator('.km-filter-pop')
    await filter.locator('input[data-v="banana"]').setChecked(false)
    await filter.locator('.km-fp-actions .ok').click()
    await expect(bananaRow).toBeHidden()

    const selected = table.locator('tbody tr', { hasText: 'apple' }).locator('td[data-ci="6"]')
    await selected.click()
    await wrap.evaluate((element) => {
      element.scrollLeft = Math.min(420, element.scrollWidth - element.clientWidth)
      element.dispatchEvent(new Event('scroll'))
    })
    const capturedScroll = await wrap.evaluate((element) => element.scrollLeft)
    expect(capturedScroll).toBeGreaterThan(20)

    const collapsedHeading = page.locator('.km-block[data-hlevel="2"]', {
      hasText: 'Collapsed notes'
    })
    await collapsedHeading.locator('.km-collapse-toggle').click()
    await expect(collapsedHeading).toHaveClass(/km-collapsed/)

    await page.locator('button[title^="Command palette"]').click()
    const input = page.locator('.palette-input input')
    await input.fill('@Far Context Target')
    await page.locator('.palette-item[data-kind="heading"]', {
      hasText: 'Far Context Target'
    }).click()

    const scroller = page.locator('.editor-scroll.km-scroll.hm-pane-left')
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(1000)

    // Deliberately destroy every preview-only part of the captured context.
    await page.locator('.status-filter').click()
    await expect(bananaRow).toBeVisible()
    await wrap.evaluate((element) => {
      element.scrollLeft = 0
      element.dispatchEvent(new Event('scroll'))
    })
    await page.locator('.km-block[data-hlevel="2"]', { hasText: 'Far Context Target' }).click()
    await collapsedHeading.locator('.km-collapse-toggle').evaluate((button) => button.click())
    await expect(collapsedHeading).not.toHaveClass(/km-collapsed/)

    await page.keyboard.press('Alt+ArrowLeft')
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeLessThan(700)
    await expect(bananaRow).toBeHidden()
    await expect(page.locator('.status-filter')).toBeVisible()
    await expect.poll(() => wrap.evaluate((element) => element.scrollLeft)).toBeGreaterThan(20)
    await expect(table.locator('tbody tr', { hasText: 'apple' }).locator('td[data-ci="6"]')).toHaveClass(
      /km-cell-selected/
    )
    await expect(collapsedHeading).toHaveClass(/km-collapsed/)
  } finally {
    await cleanup()
  }
})

test('navigation history restores the source selection range', async () => {
  const { page, cleanup } = await launchApp([fixture('navigation-context.md')])
  try {
    await page.locator('.tab', { hasText: 'navigation-context.md' }).click()
    await selectStatusViewMode(page, 'source')
    const source = page.locator('textarea.source-editor')
    await expect(source).toBeVisible()

    const range = await source.evaluate((element) => {
      const full = element.__hmSourceApi.getFullValue()
      const start = full.indexOf('APPLE-REFERENCE')
      const selection = { start, end: start + 'APPLE-REFERENCE'.length }
      element.__hmSourceApi.restoreFullSelection(selection, { focus: true })
      return selection
    })
    await expect.poll(() => source.evaluate((element) => element.selectionEnd - element.selectionStart))
      .toBe('APPLE-REFERENCE'.length)

    await page.locator('button[title^="Command palette"]').click()
    const input = page.locator('.palette-input input')
    await input.fill('@Far Context Target')
    await page.locator('.palette-item[data-kind="heading"]', {
      hasText: 'Far Context Target'
    }).click()
    await expect.poll(() => source.evaluate((element) => element.__hmSourceApi.getFullSelection().start))
      .toBeGreaterThan(range.end)

    await page.keyboard.press('Alt+ArrowLeft')
    await expect.poll(() => source.evaluate((element) => element.__hmSourceApi.getFullSelection()))
      .toEqual(range)
  } finally {
    await cleanup()
  }
})
