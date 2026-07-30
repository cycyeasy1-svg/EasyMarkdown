// E2E for the keep-mode behaviors that have churned the most since v1.0.1 and
// are the least covered by the pure-function unit suite: the paragraph-spacing
// slider (a layout pref that reaches keep mode through CSS variables), switching
// the editor engine without losing content, and the Save FAB / dirty lifecycle.
// These are the DOM/CSS/IPC paths a vitest unit can't see.
import { test, expect } from '@playwright/test'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { launchApp, fixture } from './helpers.js'

// Open the committed welcome fixture and make its (lazily-mounted) keep editor
// the active, visible pane.
async function openWelcome() {
  const res = await launchApp([fixture('welcome.md')])
  await res.page.locator('.tab', { hasText: 'welcome.md' }).click()
  await expect(res.page.locator('.km-doc')).toBeVisible()
  return res
}

test('paragraph-spacing preset changes the keep-mode block spacing', async () => {
  const { page, cleanup } = await openWelcome()
  try {
    // The fixture's body paragraph lives in a .km-block as a <p>; its vertical
    // margin is calc(0.8em * var(--editor-para-scale)) — i.e. it tracks the
    // paragraph-spacing pref end-to-end (slider → CSS var → computed style).
    const para = page.locator('.km-doc p').first()
    await expect(para).toBeVisible()
    const marginOf = () => para.evaluate((el) => getComputedStyle(el).marginTop)
    const before = await marginOf()

    // Open the status-bar Layout popover and pick a paragraph-spacing preset
    // other than the active one, so the value is guaranteed to change.
    await page.locator('.statusbar button[title="排版"]').click()
    const group = page.locator('.hm-layout-pop .hm-adjust-group', {
      has: page.locator('.hm-pop-title', { hasText: '段落间距' })
    })
    await expect(group).toBeVisible()
    await group.locator('.hm-seg-item:not(.active)').first().click()

    // The computed margin on the keep-mode paragraph reflects the new scale.
    await expect.poll(marginOf).not.toBe(before)
    // And the CSS variable the rule reads was actually set on :root.
    const scale = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--editor-para-scale').trim()
    )
    expect(scale).not.toBe('')
  } finally {
    await cleanup()
  }
})

test('switching the editor engine keeps content and exposes Milkdown normalization as dirty', async () => {
  const { page, cleanup } = await openWelcome()
  try {
    // Keep mode renders the source; the same source must survive a switch to the
    // Milkdown (Crepe) engine — heading, list and table content all carry over.
    await expect(page.getByRole('heading', { name: 'E2E Welcome Fixture' })).toBeVisible()
    await page.locator('button[title*="切换编辑模式"]').click()

    const pm = page.locator('.ProseMirror', { hasText: 'reliable click' })
    await expect(pm).toBeVisible()
    // Content parity across engines (assert by text/role, editor-agnostic).
    await expect(pm.getByRole('heading', { name: 'E2E Welcome Fixture' })).toBeVisible()
    await expect(pm.getByText('list item one')).toBeVisible()
    await expect(pm.getByText('col a')).toBeVisible()
    // The keep editor's DOM is gone — we're genuinely in the other engine now.
    await expect(page.locator('.km-doc')).toHaveCount(0)
    await expect(page.locator('.status-history')).toHaveCount(0)

    // This fixture is normalized by Milkdown. The serialized result must stay
    // compared with the real on-disk Keep source instead of being silently
    // rebaselined as "saved" during editor initialization.
    await expect(page.locator('.tab.active .tab-close.dirty')).toHaveCount(1)
    await page.locator('button[title*="切换编辑模式"]').click()
    await expect(page.locator('.hm-mode-switch')).toContainText(
      '当前 Milkdown 内容与上次保存版本不同'
    )
  } finally {
    await cleanup()
  }
})

test('Save FAB clears the dirty state and writes the edit to disk', async () => {
  // Save writes to the file path, so operate on a throwaway copy — never the
  // committed fixture. Open it through the normal launch-args path.
  const dir = mkdtempSync(join(tmpdir(), 'em-save-'))
  const file = join(dir, 'save-test.md')
  writeFileSync(file, '# Original Heading\n\nbody text\n', 'utf8')

  const res = await launchApp([file])
  const { page, cleanup } = res
  try {
    await page.locator('.tab', { hasText: 'save-test.md' }).click()
    await expect(page.locator('.km-doc')).toBeVisible()
    // Clean on open: no unsaved changes, so the Save FAB is hidden.
    await expect(page.locator('.hm-save-fab')).toHaveCount(0)

    // Edit the H1 block via "edit source" and commit.
    await page.locator('.km-block[data-bi="0"] .km-src-edit').click()
    const editor = page.locator('.km-src-editor')
    await expect(editor).toHaveValue('# Original Heading')
    await editor.fill('# Saved By E2E')
    await page.locator('.km-src-actions .ok').click()

    // Now dirty: the FAB appears and the active tab shows the unsaved dot.
    const fab = page.locator('.hm-save-fab')
    await expect(fab).toBeVisible()
    await expect(page.locator('.tab.active .tab-close.dirty')).toHaveCount(1)

    // Click it to save.
    await fab.click()

    // Saved: the FAB and the dirty dot both clear...
    await expect(fab).toHaveCount(0)
    await expect(page.locator('.tab.active .tab-close.dirty')).toHaveCount(0)
    // ...and the new content is on disk (zero-diff: only the H1 line changed).
    await expect.poll(() => readFileSync(file, 'utf8')).toBe('# Saved By E2E\n\nbody text\n')
  } finally {
    await cleanup()
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
})

test('Keep formatting toolbar edits block and table-cell selections without widening the diff', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'em-format-toolbar-'))
  const file = join(dir, 'format-toolbar.md')
  writeFileSync(
    file,
    '# Title\n\nbody text\n\n| A |\n| --- |\n| cell |\n',
    'utf8'
  )

  const { page, cleanup } = await launchApp([file])
  try {
    await page.locator('.tab', { hasText: 'format-toolbar.md' }).click()
    await expect(page.locator('.km-doc')).toBeVisible()

    // Block edit: the toolbar keeps the textarea selection while pointer clicks
    // generate Markdown + safe inline HTML around it.
    await page.locator('.km-block', { has: page.locator('p', { hasText: 'body text' }) })
      .locator('.km-src-edit')
      .click()
    const blockEditor = page.locator('.km-src-editor')
    await blockEditor.selectText()
    await page.locator('.km-format-bold').click()
    await expect(blockEditor).toHaveValue('**body text**')
    await page.locator('.km-format-color-trigger').click()
    await page.locator('.km-color-blue').click()
    await expect(blockEditor).toHaveValue(
      '**<span style="color: #3378c5">body text</span>**'
    )
    await page.locator('.km-format-highlight').click()
    await expect(blockEditor).toHaveValue(
      '**<mark class="hm-hl-yellow"><span style="color: #3378c5">body text</span></mark>**'
    )
    await page.locator('.km-src-actions .ok').click()
    const formatted = page.locator('.km-doc p strong mark')
    await expect(formatted).toHaveText('body text')
    await expect(formatted).toHaveCSS('background-color', 'rgb(255, 243, 163)')
    const colored = formatted.locator('.hm-text-color-blue > span')
    await expect(colored).toHaveCSS('color', 'rgb(51, 120, 197)')

    // Table-cell edit uses the same toolbar but still commits through the
    // one-cell/one-line Keep patch.
    await page.locator('.km-table tbody td', { hasText: 'cell' }).dblclick()
    const cellPop = page.locator('.km-cell-pop')
    await expect(cellPop.locator('.km-format-toolbar')).toBeVisible()
    const cellEditor = cellPop.locator('textarea')
    await cellEditor.selectText()
    await cellPop.locator('.km-format-underline').click()
    await expect(cellEditor).toHaveValue('<u>cell</u>')
    await cellPop.locator('.km-format-strike').click()
    await expect(cellEditor).toHaveValue('~~<u>cell</u>~~')
    await cellPop.locator('.km-cp-actions .ok').click()
    await expect(page.locator('.km-table tbody td s u')).toHaveText('cell')

    await page.locator('.hm-save-fab').click()
    await expect.poll(() => readFileSync(file, 'utf8')).toBe(
      [
        '# Title',
        '',
        '**<mark class="hm-hl-yellow"><span style="color: #3378c5">body text</span></mark>**',
        '',
        '| A |',
        '| --- |',
        '| ~~<u>cell</u>~~ |',
        ''
      ].join('\n')
    )
  } finally {
    await cleanup()
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
})

test('Keep renders and formats color/highlight directly after Windows path separators', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'em-format-windows-path-'))
  const file = join(dir, 'format-windows-path.md')
  const visualLine =
    String.raw`E:\AI\20260715\医療・介護\LifeEventMedicalCareDetailComponent\E2Eテスト仕様書_T04.md`
  const legacyLine =
    String.raw`E:\AI\20260715\<span style="color: #d94b5b">医療・介護</span>\LifeEventMedicalCareDetailComponent\==E2Eテスト仕様書==_T04.md`
  writeFileSync(file, `${legacyLine}\n\n${visualLine}\n`, 'utf8')

  const { page, cleanup } = await launchApp([file])
  try {
    await page.locator('.tab', { hasText: 'format-windows-path.md' }).click()
    await expect(page.locator('.km-doc')).toBeVisible()

    // Documents saved by the earlier toolbar used `\<span…>` / `\==…==`.
    // They must render immediately without rewriting the user's source.
    const legacyBlock = page.locator('.km-block').first()
    await expect(legacyBlock.locator('p')).toHaveText(visualLine)
    await expect(legacyBlock.locator('.hm-text-color-red > span')).toHaveCSS(
      'color',
      'rgb(217, 75, 91)'
    )
    await expect(legacyBlock.locator('mark.hm-hl-yellow')).toHaveCSS(
      'background-color',
      'rgb(255, 243, 163)'
    )

    const editableBlock = page.locator('.km-block').filter({
      has: page.locator('p', { hasText: visualLine })
    }).last()
    await editableBlock.locator('.km-src-edit').click()
    const editor = page.locator('.km-src-editor')
    const select = async (text) => {
      await editor.evaluate((el, selectedText) => {
        const start = el.value.indexOf(selectedText)
        el.focus()
        el.setSelectionRange(start, start + selectedText.length)
        el.dispatchEvent(new Event('select', { bubbles: true }))
      }, text)
    }

    await select('医療・介護')
    await page.locator('.km-format-color-trigger').click()
    await page.locator('.km-color-red').click()
    await select('E2Eテスト仕様書')
    await page.locator('.km-format-highlight').click()

    const formattedLine =
      String.raw`E:\AI\20260715&#92;<span style="color: #d94b5b">医療・介護</span>\LifeEventMedicalCareDetailComponent&#92;==E2Eテスト仕様書==_T04.md`
    await expect(editor).toHaveValue(formattedLine)
    await page.locator('.km-src-actions .ok').click()

    const renderedBlock = page.locator('.km-block').last()
    await expect(renderedBlock.locator('p')).toHaveText(visualLine)
    await expect(renderedBlock.locator('.hm-text-color-red > span')).toHaveCSS(
      'color',
      'rgb(217, 75, 91)'
    )
    await expect(renderedBlock.locator('mark.hm-hl-yellow')).toHaveCSS(
      'background-color',
      'rgb(255, 243, 163)'
    )

    await page.locator('.hm-save-fab').click()
    await expect.poll(() => readFileSync(file, 'utf8')).toBe(
      `${legacyLine}\n\n${formattedLine}\n`
    )
  } finally {
    await cleanup()
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
})

test('dirty Keep mode asks to save before Milkdown and both directions use the app dialog', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'em-mode-switch-'))
  const file = join(dir, 'mode-switch.md')
  writeFileSync(file, '# Original Heading\n\nbody text\n', 'utf8')

  const { page, cleanup } = await launchApp([file])
  try {
    await page.locator('.tab', { hasText: 'mode-switch.md' }).click()
    await expect(page.locator('.km-doc')).toBeVisible()

    await page.locator('.km-block[data-bi="0"] .km-src-edit').click()
    await page.locator('.km-src-editor').fill('# Keep Edit')
    await page.locator('.km-src-actions .ok').click()
    await expect(page.locator('.hm-save-fab')).toBeVisible()

    await page.locator('button[title*="切换编辑模式"]').click()
    const dialog = page.locator('.hm-mode-switch')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('保持模式中有未保存的修改')
    await expect(dialog.getByRole('button', { name: '保存并切换' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: '不保存，直接切换' })).toBeVisible()
    await dialog.getByRole('button', { name: '查看差异' }).click()
    await expect(page.locator('.hm-review')).toBeVisible()
    await expect(page.locator('.hm-review-item')).toHaveCount(1)
    await page.locator('.hm-review-close').click()
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: '保存并切换' }).click()
    const pm = page.locator('.ProseMirror:visible')
    await expect(pm).toBeVisible()
    await expect.poll(() => readFileSync(file, 'utf8')).toBe('# Keep Edit\n\nbody text\n')

    // Make Milkdown dirty and switch back: this direction must also use the
    // localized in-app dialog, not Electron/Chromium's native window.confirm.
    await pm.getByText('body text').click()
    await page.keyboard.press('End')
    await page.keyboard.type(' milkdown edit')
    await expect(page.locator('.hm-save-fab')).toBeVisible()
    await page.locator('button[title*="切换编辑模式"]').click()
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('当前 Milkdown 内容与上次保存版本不同')
    await dialog.getByRole('button', { name: '取消' }).click()
    await expect(pm).toBeVisible()
  } finally {
    await cleanup()
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
})

test('external edit conflict can be reviewed against the latest disk text', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'em-conflict-review-'))
  const file = join(dir, 'conflict-review.md')
  writeFileSync(file, '# Original Heading\n\nbody text\n', 'utf8')

  const { page, cleanup } = await launchApp([file])
  try {
    await page.locator('.tab', { hasText: 'conflict-review.md' }).click()
    await expect(page.locator('.km-doc')).toBeVisible()
    await page.locator('.km-block[data-bi="0"] .km-src-edit').click()
    await page.locator('.km-src-editor').fill('# Local Heading')
    await page.locator('.km-src-actions .ok').click()

    // Give the renderer time to establish the per-file watcher, then simulate a
    // different program saving a new disk version while local changes are dirty.
    await page.waitForTimeout(150)
    writeFileSync(file, '# External Heading\n\nbody text\n', 'utf8')

    const conflict = page.locator('.hm-conflict')
    await expect(conflict).toBeVisible()
    await conflict.getByRole('button', { name: '查看差异' }).click()
    const review = page.locator('.hm-review')
    await expect(review).toContainText('本地修改与磁盘版本对比')
    await expect(review.locator('.hm-review-preview.before')).toContainText('# External Heading')
    await expect(review.locator('.hm-review-preview.after')).toContainText('# Local Heading')
    await expect(review.getByRole('button', { name: '仅恢复此处' })).toHaveCount(0)
  } finally {
    await cleanup()
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
})

test('Keep change review supports semantic undo, partial restore and locating a hunk', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'em-change-review-'))
  const file = join(dir, 'change-review.md')
  writeFileSync(file, '# Original Heading\n\nfirst paragraph\n\nsecond paragraph\n', 'utf8')

  const { page, cleanup } = await launchApp([file])
  try {
    await page.locator('.tab', { hasText: 'change-review.md' }).click()
    await expect(page.locator('.km-doc')).toBeVisible()

    const editBlock = async (text, next) => {
      const block = page.locator('.km-block', { hasText: text }).first()
      await block.locator('.km-src-edit').click()
      await page.locator('.km-src-editor').fill(next)
      await page.locator('.km-src-actions .ok').click()
    }

    // A committed operation reports what changed and exposes the same Keep
    // history API as an inline Undo action.
    await editBlock('Original Heading', '# Changed Heading')
    const toast = page.locator('.hm-toast')
    await expect(toast).toContainText('内容块已修改')
    await toast.getByRole('button', { name: '撤销' }).click()
    await expect(page.getByRole('heading', { name: 'Original Heading' })).toBeVisible()

    // Create two distant hunks so each can be reviewed and restored separately.
    await editBlock('Original Heading', '# Changed Heading')
    await editBlock('second paragraph', 'second paragraph changed')
    await page.locator('button[title="查看本次修改"]').click()

    const review = page.locator('.hm-review')
    await expect(review).toBeVisible()
    await expect(review.locator('.hm-review-item')).toHaveCount(2)

    // Restoring one range leaves the other change intact and creates a new,
    // undoable history entry.
    await review.locator('.hm-review-item').first().getByRole('button', { name: '仅恢复此处' }).click()
    await expect(page.getByRole('heading', { name: 'Original Heading' })).toBeVisible()
    await expect(review.locator('.hm-review-item')).toHaveCount(1)
    await page.locator('.hm-toast').getByRole('button', { name: '撤销' }).click()
    await expect(page.getByRole('heading', { name: 'Changed Heading' })).toBeVisible()
    await expect(review.locator('.hm-review-item')).toHaveCount(2)

    // Locating closes the review and highlights the corresponding rendered block.
    await review.locator('.hm-review-item').last().getByRole('button', { name: '定位' }).click()
    await expect(review).toHaveCount(0)
    await expect(page.locator('.km-block.hm-line-flash')).toBeVisible()
  } finally {
    await cleanup()
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
})

test('keep table columns use rendered link labels instead of hidden destinations', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'em-table-link-width-'))
  const file = join(dir, 'table-link-width.md')
  writeFileSync(
    file,
    [
      '| A | B |',
      '| --- | --- |',
      '| 短 | [短](https://example.com/a(b)some-very-long-suffix-that-is-only-in-target) |'
    ].join('\n'),
    'utf8'
  )

  const { page, cleanup } = await launchApp([file])
  try {
    await page.locator('.tab', { hasText: 'table-link-width.md' }).click()
    const headers = page.locator('.km-doc table.km-table th')
    await expect(headers).toHaveCount(2)
    const widths = await headers.evaluateAll((cells) => cells.map((cell) => cell.offsetWidth))
    expect(Math.abs(widths[0] - widths[1])).toBeLessThanOrEqual(2)
  } finally {
    await cleanup()
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
})

test('keep table automatic widths keep long CJK headers fully visible', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'em-table-header-width-'))
  const file = join(dir, 'table-header-width.md')
  const longHeader = '表示条件与活动范围及计算方法和必要步骤与最终结果'
  const headers = [longHeader, ...Array.from({ length: 10 }, (_, index) => `C${index + 1}`)]
  writeFileSync(
    file,
    [
      '| ' + headers.join(' | ') + ' |',
      '| ' + headers.map(() => '---').join(' | ') + ' |',
      '| ' + headers.map(() => '-').join(' | ') + ' |'
    ].join('\n'),
    'utf8'
  )

  const { page, cleanup } = await launchApp([file])
  try {
    await page.locator('.tab', { hasText: 'table-header-width.md' }).click()
    const content = page.locator('.km-doc table.km-table th[data-ci="0"] .km-th-content')
    await expect(content).toHaveText(longHeader)
    const metrics = await content.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth
    }))
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1)
  } finally {
    await cleanup()
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
})

test('keep table columns resize, auto-fit, hide and restore without dirtying the document', async () => {
  const { page, cleanup } = await openWelcome()
  try {
    const table = page.locator('.km-doc table.km-table').first()
    const firstHeader = table.locator('th[data-ci="0"]')
    await expect(firstHeader).toBeVisible()
    const tableTools = page.locator('.km-table-frame .km-table-tools').first()
    await expect(tableTools).toBeVisible()
    await expect.poll(() =>
      tableTools.evaluate((element) => ({
        position: getComputedStyle(element).position,
        parent: element.parentElement?.className || ''
      }))
    ).toEqual({ position: 'static', parent: 'km-table-frame' })

    const widthOf = () => firstHeader.evaluate((el) => el.offsetWidth)
    const initialWidth = await widthOf()
    await firstHeader.hover()
    const handle = firstHeader.locator(':scope > .km-col-resize')
    const box = await handle.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 6 })
    await page.mouse.up()
    await expect.poll(widthOf).toBeGreaterThan(initialWidth + 50)

    // One click restores the same parser-generated width hints used on first paint.
    await page.locator('.km-table-autofit').first().click()
    await expect.poll(widthOf).toBeLessThan(initialWidth + 4)
    await expect.poll(widthOf).toBeGreaterThan(initialWidth - 4)

    // The per-column hide affordance appears on header hover. Recovery remains in
    // the table toolbar, including an individual entry for every hidden column.
    await firstHeader.hover()
    await firstHeader.locator('.km-col-hide-btn').click()
    await expect(firstHeader).toBeHidden()
    const hiddenButton = page.locator('.km-table-hidden-columns').first()
    await expect(hiddenButton).toContainText('已隐藏 1 列')
    await hiddenButton.click()
    await page.locator('.km-column-pop-item[data-ci="0"]').click()
    await expect(firstHeader).toBeVisible()

    // Width/visibility are preview state only: no source edit and no dirty marker.
    await expect(page.locator('.tab.active .tab-close.dirty')).toHaveCount(0)
  } finally {
    await cleanup()
  }
})
