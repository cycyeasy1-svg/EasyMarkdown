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

test('Keep table context menu keeps source, layout and structural actions wired', async () => {
  const { page, cleanup } = await openTableFixture()
  try {
    const table = page.locator('.km-doc table.km-table[data-ti="0"]')
    const firstCell = table.locator('tbody tr[data-ri="0"] td[data-ci="0"]')
    const firstHeader = table.locator('thead th[data-ci="0"]')
    const rows = table.locator('tbody tr')
    const columns = table.locator('thead th')
    const undo = page.locator('.status-history-btn.undo')
    const choose = async (target, label) => {
      await target.click({ button: 'right' })
      await page
        .locator('.km-table-menu')
        .getByRole('button', { name: label, exact: true })
        .click()
    }
    const undoTo = async (locator, count) => {
      await expect(undo).toBeEnabled()
      await undo.click()
      await expect(locator).toHaveCount(count)
    }

    await choose(firstCell, '在上方插入行')
    await expect(rows).toHaveCount(5)
    await expect(rows.first().locator('td[data-ci="0"]')).toHaveAttribute('data-raw', '')
    await undoTo(rows, 4)

    await choose(firstCell, '在下方插入行')
    await expect(rows).toHaveCount(5)
    await expect(rows.nth(1).locator('td[data-ci="0"]')).toHaveAttribute('data-raw', '')
    await undoTo(rows, 4)

    await choose(firstHeader, '插入行')
    await expect(rows).toHaveCount(5)
    await expect(rows.first().locator('td[data-ci="0"]')).toHaveAttribute('data-raw', '')
    await undoTo(rows, 4)

    await choose(firstCell, '在左侧插入列')
    await expect(columns).toHaveCount(3)
    await expect(columns.first()).toHaveAttribute('data-raw', '')
    await undoTo(columns, 2)

    await choose(firstCell, '在右侧插入列')
    await expect(columns).toHaveCount(3)
    await expect(columns.nth(1)).toHaveAttribute('data-raw', '')
    await undoTo(columns, 2)

    await choose(firstCell, '删除本行')
    await expect(rows).toHaveCount(3)
    await expect(table.locator('tbody')).not.toContainText('apple')
    await undoTo(rows, 4)

    await choose(firstCell, '删除本列')
    await expect(columns).toHaveCount(1)
    await expect(columns.first()).toHaveAttribute('data-raw', 'color')
    await firstCell.click({ button: 'right' })
    await expect(
      page.locator('.km-table-menu').getByRole('button', { name: '删除本列', exact: true })
    ).toHaveClass(/disabled/)
    await page.keyboard.press('Escape')
    await undoTo(columns, 2)

    const widths = () => table.locator('col').evaluateAll((cols) => cols.map((col) => col.style.width))
    const parserWidths = await widths()
    const firstWidth = () => table.locator('col').first().evaluate((col) => col.style.width)
    const initialFirstWidth = parserWidths[0]
    const firstResize = firstHeader.locator(':scope > .km-col-resize')
    await firstResize.focus()
    await firstResize.press('ArrowRight')
    await expect.poll(firstWidth).not.toBe(initialFirstWidth)
    await choose(firstCell, '本列宽度自适应')
    await expect.poll(firstWidth).toBe(initialFirstWidth)

    await firstResize.focus()
    await firstResize.press('ArrowRight')
    const secondResize = table.locator('thead th[data-ci="1"] > .km-col-resize')
    await secondResize.focus()
    await secondResize.press('ArrowRight')
    await expect.poll(widths).not.toEqual(parserWidths)
    await choose(firstCell, '全部列宽自适应')
    await expect.poll(widths).toEqual(parserWidths)

    await choose(firstCell, '隐藏“fruit”列')
    await expect(firstHeader).toBeHidden()
    const hiddenColumns = page.locator('.km-table-hidden-columns').first()
    await expect(hiddenColumns).toContainText('已隐藏 1 列')
    await hiddenColumns.click()
    await page.locator('.km-column-pop-item[data-ci="0"]').click()
    await expect(firstHeader).toBeVisible()

    await choose(firstCell, '在此打开源码')
    await expect(page.locator('textarea.source-editor:visible')).toBeVisible()
  } finally {
    await cleanup()
  }
})

test('Keep table keyboard navigation reveals cells below the floating header', async () => {
  const { page, cleanup } = await openTableFixture()
  try {
    // Exercise CSS zoom too because the live table and its fixed clone sit in
    // different zoom/positioning contexts.
    await page.evaluate(() => document.documentElement.style.setProperty('--editor-zoom', '1.25'))
    const table = page.locator('.km-doc table.km-table[data-ti="0"]')
    const target = table.locator('tbody tr[data-ri="2"] td[data-ci="0"]')
    const current = table.locator('tbody tr[data-ri="3"] td[data-ci="0"]')
    await current.click()

    // Put the previous row just inside the editor viewport. Native
    // scrollIntoView considers this visible even though the fixed header covers it.
    await target.evaluate((cell) => {
      const scroller = cell.closest('.editor-scroll')
      const gap = cell.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      scroller.scrollTop += gap - 2
      scroller.dispatchEvent(new Event('scroll'))
    })
    await expect(page.locator('.km-float-header.km-visible')).toBeVisible()

    await page.keyboard.press('ArrowUp')
    await expect(target).toHaveClass(/km-cell-selected/)
    const gapBelowHeader = () =>
      target.evaluate((cell) => {
        const pane = cell.closest('.pane-center')
        const header = pane?.querySelector('.km-float-header.km-visible')
        if (!header) return -Infinity
        return cell.getBoundingClientRect().top - header.getBoundingClientRect().bottom
      })
    await expect
      .poll(gapBelowHeader)
      .toBeGreaterThanOrEqual(0)
    await expect.poll(gapBelowHeader).toBeLessThanOrEqual(4)
  } finally {
    await cleanup()
  }
})

test('Keep floating table header supports selection and the table context menu', async () => {
  const { app, page, cleanup } = await openTableFixture()
  try {
    const table = page.locator('.km-doc table.km-table[data-ti="0"]')
    const target = table.locator('tbody tr[data-ri="2"] td[data-ci="0"]')
    await target.evaluate((cell) => {
      const scroller = cell.closest('.editor-scroll')
      const gap = cell.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      scroller.scrollTop += gap
      scroller.dispatchEvent(new Event('scroll'))
    })

    const floatingHeader = page.locator('.km-float-header.km-visible th[data-ci="0"]')
    const floatingContent = floatingHeader.locator('.km-th-content')
    const liveHeader = table.locator('thead th[data-ci="0"]')
    await expect(floatingHeader).toBeVisible()

    await floatingContent.click()
    await expect(liveHeader).toHaveClass(/km-cell-selected/)
    await expect(floatingHeader).toHaveClass(/km-cell-selected/)

    await floatingContent.click({ button: 'right' })
    await expect(page.locator('.km-table-menu')).toBeVisible()
    await app.evaluate(({ clipboard }) => clipboard.writeText('clipboard-not-written'))
    await page
      .locator('.km-table-menu')
      .getByRole('button', { name: '复制当前单元格', exact: true })
      .click()
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('fruit')
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
