import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { launchApp, selectStatusViewMode } from './helpers.js'

const selectMode = async (page, mode) => {
  const viewMode = mode === 'source' ? 'source' : 'rich'
  await selectStatusViewMode(page, viewMode)
}

async function removeFixture(cleanup, dir) {
  await cleanup()
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // Electron can briefly retain a file handle on Windows.
  }
}

test('source mode is remembered per tab and keeps the Keep editor mounted', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'em-source-mode-'))
  const first = join(dir, 'first.md')
  const second = join(dir, 'second.md')
  writeFileSync(first, '# First source tab\n\nOriginal body\n', 'utf8')
  writeFileSync(second, '# Second preview tab\n\nSecond body\n', 'utf8')

  const { page, cleanup } = await launchApp([first, second])
  try {
    await page.locator('.tab', { hasText: 'first.md' }).click()
    const keep = page.locator('.km-doc', { hasText: 'First source tab' })
    await expect(keep).toBeVisible()
    await keep.evaluate((node) => { node.dataset.sourceModeToken = 'kept' })

    await selectMode(page, 'source')
    const source = page.locator('textarea.source-editor')
    await expect(source).toBeVisible()
    await expect(keep).toBeAttached()
    await expect(keep).toBeHidden()

    await page.locator('.tab', { hasText: 'second.md' }).click()
    await expect(page.locator('.km-doc', { hasText: 'Second preview tab' })).toBeVisible()
    await page.locator('.tab', { hasText: 'first.md' }).click()
    await expect(source).toBeVisible()

    const updated = '# First source tab\n\nUpdated through full source\n'
    await source.fill(updated)
    await selectMode(page, 'keep')
    await expect(keep).toBeVisible()
    await expect(keep).toHaveAttribute('data-source-mode-token', 'kept')
    await expect(keep).toContainText('Updated through full source')

    await page.locator('.hm-save-fab').click()
    await expect.poll(() => readFileSync(first, 'utf8')).toBe(updated)
  } finally {
    await removeFixture(cleanup, dir)
  }
})

test('source outline and find work without taking focus from the find input', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'em-source-nav-'))
  const file = join(dir, 'navigation.md')
  const body = Array.from({ length: 90 }, (_, index) => `line ${index} needle`).join('\n')
  const content = `# Start\n\n${body}\n\n## Tail target\n\nlast needle\n`
  writeFileSync(file, content, 'utf8')

  const { page, cleanup } = await launchApp([file])
  try {
    await page.locator('.tab', { hasText: 'navigation.md' }).click()
    await selectMode(page, 'source')
    const source = page.locator('textarea.source-editor')
    await expect(source).toBeVisible()

    await page.locator('button[title="大纲"]').click()
    const tail = page.locator('.outline-item', { hasText: 'Tail target' })
    await tail.click()
    await expect(tail).toHaveClass(/active/)
    await expect.poll(() => source.evaluate((el) => el.__hmSourceApi?.getFullSelection?.().end || 0))
      .toBeGreaterThan(content.indexOf('## Tail target') - 1)
    await expect.poll(() => source.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)

    await source.evaluate((el) => el.__hmSourceApi?.scrollToOffset?.(0, { align: 'top' }))
    await expect.poll(() => source.evaluate((el) => el.scrollTop)).toBe(0)
    const firstFold = page.locator('.source-fold-toggle').first()
    await firstFold.click()
    await expect(firstFold).toHaveClass(/is-collapsed/)

    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f')
    const findInput = page.locator('.findbar input').first()
    await findInput.fill('needle')
    await expect(page.locator('.findbar-count')).toHaveText(/1\/91/)
    await expect(firstFold).not.toHaveClass(/is-collapsed/)
    await expect(page.locator('.hm-source-find-current')).toHaveCount(1)
    await expect(findInput).toBeFocused()
  } finally {
    await removeFixture(cleanup, dir)
  }
})

test('Milkdown survives source round-trips and maps the caret structurally', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'em-source-rich-'))
  const file = join(dir, 'rich-map.md')
  const original = '# Rich map\n\nBefore paragraph.\n\nTarget **formatted** paragraph.\n\nAfter paragraph.\n'
  writeFileSync(file, original, 'utf8')

  const { page, cleanup } = await launchApp([file])
  try {
    await page.locator('.tab', { hasText: 'rich-map.md' }).click()
    await page.locator('.mode-switch-wrap > button').click()
    const rich = page.locator('.ProseMirror', { hasText: 'Rich map' })
    await expect(rich).toBeVisible()
    await expect(page.locator('.hm-engine-mode')).toContainText('Milkdown')
    await expect(page.locator('.hm-view-mode-control .hm-view-mode-btn')).toHaveCount(1)
    await expect(page.locator('.hm-view-mode-btn')).toHaveAttribute(
      'title',
      '切换显示方式（富文本 ⇄ 源码）'
    )
    await rich.evaluate((node) => { node.dataset.sourceModeToken = 'rich-kept' })

    const target = rich.locator('p', { hasText: 'Target formatted paragraph.' })
    await target.click()
    await page.keyboard.press('End')
    await selectMode(page, 'source')
    const source = page.locator('textarea.source-editor')
    await expect(source).toBeVisible()
    await expect(rich).toBeAttached()
    await expect(rich).toBeHidden()

    const selectionEnd = await source.evaluate((el) => el.__hmSourceApi?.getFullSelection?.().end || 0)
    expect(selectionEnd).toBeGreaterThanOrEqual(original.indexOf('Target'))
    expect(selectionEnd).toBeLessThanOrEqual(original.indexOf('After paragraph.'))

    const updated = original.replace('Target **formatted** paragraph.', 'Target **updated** paragraph.')
    await source.fill(updated)
    await selectMode(page, 'milkdown')
    await expect(rich).toBeVisible()
    await expect(rich).toHaveAttribute('data-source-mode-token', 'rich-kept')
    await expect(rich).toContainText('Target updated paragraph.')
  } finally {
    await removeFixture(cleanup, dir)
  }
})

test('Keep maps the visible body row of a tall table to source and back', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'em-source-table-'))
  const file = join(dir, 'table-map.md')
  const rows = Array.from({ length: 80 }, (_, index) => `| row-${index + 1} | value-${index + 1} |`)
  const content = ['# Table map', '', '| Name | Value |', '| --- | --- |', ...rows, ''].join('\n')
  writeFileSync(file, content, 'utf8')

  const { page, cleanup } = await launchApp([file])
  try {
    await page.locator('.tab', { hasText: 'table-map.md' }).click()
    const targetIndex = 44
    const targetLine = 4 + targetIndex
    const targetRow = page.locator('.km-table tbody tr').nth(targetIndex)
    await targetRow.evaluate((row) => row.scrollIntoView({ block: 'start' }))

    await selectMode(page, 'source')
    const source = page.locator('textarea.source-editor')
    await expect(source).toBeVisible()
    await expect.poll(() => source.evaluate((el) => {
      const api = el.__hmSourceApi
      const full = api?.getFullValue?.() || ''
      const offset = api?.getViewportOffset?.() || 0
      return full.slice(0, offset).split('\n').length - 1
    })).toBeGreaterThanOrEqual(targetLine - 3)

    const returnIndex = 62
    const returnOffset = content.split('\n').slice(0, 4 + returnIndex).join('\n').length + 1
    await source.evaluate((el, offset) => {
      el.__hmSourceApi?.scrollToOffset?.(offset, { align: 'top', userNavigation: true })
    }, returnOffset)
    await selectMode(page, 'keep')
    const returnRow = page.locator('.km-table tbody tr').nth(returnIndex)
    await expect.poll(() => returnRow.evaluate((row) => {
      const scroller = row.closest('.editor-scroll')
      if (!scroller) return Number.POSITIVE_INFINITY
      return row.getBoundingClientRect().top - scroller.getBoundingClientRect().top
    })).toBeLessThan(110)
  } finally {
    await removeFixture(cleanup, dir)
  }
})
