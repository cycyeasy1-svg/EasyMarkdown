// Interaction E2E — drives real editing in both editors. Ported/expanded from the
// manual scripts/etv.mjs. The default editor for opened .md files is the KEEP
// editor (.km-*, engine = keep-parser.js, which the vitest suite unit-tests), so
// the keep-mode round-trips below are the end-to-end complement to those units.
import { test, expect } from '@playwright/test'
import { launchApp, fixture } from './helpers.js'

// Open the fixture and make its (lazily-mounted) editor the active/visible one.
async function openWelcome() {
  const res = await launchApp([fixture('welcome.md')])
  await res.page.locator('.tab', { hasText: 'welcome.md' }).click()
  await expect(res.page.locator('.km-doc')).toBeVisible() // keep editor mounted
  return res
}

async function openFindPositionFixture() {
  const res = await launchApp([fixture('find-position.md')])
  await res.page.locator('.tab', { hasText: 'find-position.md' }).click()
  await expect(res.page.locator('.km-doc')).toBeVisible()
  return res
}

test('keep mode: editing a block via "edit source" updates the rendered doc', async () => {
  const { page, cleanup } = await openWelcome()
  try {
    const undoButton = page.locator('.status-history-btn.undo')
    const redoButton = page.locator('.status-history-btn.redo')
    await expect(undoButton).toBeVisible()
    await expect(redoButton).toBeVisible()
    await expect(undoButton).toBeDisabled()
    await expect(redoButton).toBeDisabled()
    await expect(undoButton).toHaveAttribute('title', '撤销 Keep 编辑（Ctrl/Cmd+Z）')

    // Block 0 is the H1. Its per-block "edit source" button swaps in a raw-text
    // textarea (.km-src-editor) with action buttons (.ok / cancel).
    await page.locator('.km-block[data-bi="0"] .km-src-edit').click()
    const editor = page.locator('.km-src-editor')
    await expect(editor).toBeVisible()
    await expect(editor).toHaveValue('# E2E Welcome Fixture')
    await expect(undoButton).toBeDisabled()
    await expect(redoButton).toBeDisabled()
    await expect(undoButton).toHaveAttribute('title', '请先确认或取消当前的 Keep 编辑。')

    // Rewrite the source and commit by clicking OK.
    await editor.fill('# Edited By E2E')
    await page.locator('.km-src-actions .ok').click()
    // The block re-renders from the new source.
    await expect(page.getByRole('heading', { name: 'Edited By E2E' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'E2E Welcome Fixture' })).toHaveCount(0)

    // Keep commits expose their history through explicit status-bar controls
    // even though the rendered document itself is not contenteditable.
    await expect(undoButton).toBeEnabled()
    await expect(redoButton).toBeDisabled()
    await undoButton.click()
    await expect(page.getByRole('heading', { name: 'E2E Welcome Fixture' })).toBeVisible()
    await expect(undoButton).toBeDisabled()
    await expect(redoButton).toBeEnabled()
    await redoButton.click()
    await expect(page.getByRole('heading', { name: 'Edited By E2E' })).toBeVisible()
    await expect(undoButton).toBeEnabled()
    await expect(redoButton).toBeDisabled()
  } finally {
    await cleanup()
  }
})

test('keep mode: an unfinished cell draft survives switching tabs', async () => {
  const { page, cleanup } = await launchApp([fixture('welcome.md'), fixture('images.md')])
  try {
    await page.locator('.tab', { hasText: 'welcome.md' }).click()
    await expect(page.locator('.km-doc', { hasText: 'E2E Welcome Fixture' })).toBeVisible()
    await page.locator('.km-table td', { hasText: '1' }).first().dblclick()
    const input = page.locator('.km-cell-pop .km-cp-input')
    await input.fill('draft survives')
    await expect(page.locator('.tab.active .tab-close.dirty')).toHaveCount(1)

    await page.locator('.tab', { hasText: 'images.md' }).click()
    await expect(input).toBeHidden()
    await page.locator('.tab', { hasText: 'welcome.md' }).click()
    await expect(input).toBeVisible()
    await expect(input).toHaveValue('draft survives')

    await page.locator('.km-cell-pop .km-cp-actions button:not(.ok)').click()
    await expect(page.locator('.tab.active .tab-close.dirty')).toHaveCount(0)
  } finally {
    await cleanup()
  }
})

test('command palette @ headings integrates with back and forward navigation', async () => {
  const { page, cleanup } = await launchApp([fixture('outline-stability.md')])
  try {
    await page.locator('.tab', { hasText: 'outline-stability.md' }).click()
    await expect(page.locator('.km-doc')).toBeVisible()
    const scroller = page.locator('.editor-scroll.km-scroll.hm-pane-left')
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeLessThan(30)

    await page.locator('button[title^="Command palette"]').click()
    const input = page.locator('.palette-input input')
    await input.fill('@Far Target Heading')
    const headingItem = page.locator('.palette-item[data-kind="heading"]', {
      hasText: 'Far Target Heading'
    })
    await expect(headingItem).toBeVisible()
    await headingItem.click()
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(1000)

    await page.keyboard.press('Alt+ArrowLeft')
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeLessThan(30)
    await page.keyboard.press('Alt+ArrowRight')
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(1000)
  } finally {
    await cleanup()
  }
})

test('keep mode: editing a table cell writes back to the rendered table', async () => {
  const { page, cleanup } = await openWelcome()
  try {
    // The fixture table's data row is | 1 | 2 |. Double-click the "1" cell to open
    // its inline editor (.km-cell-pop > .km-cp-input), retype, and commit.
    const cell = page.locator('.km-table td', { hasText: '1' }).first()
    await cell.dblclick()
    const input = page.locator('.km-cell-pop .km-cp-input')
    await expect(input).toBeVisible()
    await input.fill('99')
    await page.locator('.km-cell-pop .ok').click()
    await expect(page.locator('.km-table td', { hasText: '99' })).toBeVisible()
  } finally {
    await cleanup()
  }
})

test('keep mode: find keeps query, selects it on reopen, and F3 steps matches', async () => {
  const { page, cleanup } = await openWelcome()
  const findShortcut = process.platform === 'darwin' ? 'Meta+F' : 'Control+F'
  try {
    await page.keyboard.press(findShortcut)
    const input = page.locator('.findbar input')
    await expect(input).toBeFocused()
    await input.fill('this')
    await expect(page.locator('.findbar-count')).toHaveText('1/2')
    await page.keyboard.press('Alt+C')
    await expect(page.locator('.findbar-count')).toHaveText('0/0')
    await page.keyboard.press('Alt+C')
    await expect(page.locator('.findbar-count')).toHaveText('1/2')

    await input.fill('[')
    await page.keyboard.press('Alt+R')
    await expect(page.locator('.findbar')).toHaveClass(/has-error/)
    await page.keyboard.press('Alt+R')
    await input.fill('This')
    await expect(page.locator('.findbar-count')).toHaveText('1/2')

    await page.keyboard.press('F3')
    await expect(page.locator('.findbar-count')).toHaveText('2/2')
    await page.keyboard.press('Shift+F3')
    await expect(page.locator('.findbar-count')).toHaveText('1/2')

    await page.keyboard.press('Escape')
    await expect(page.locator('.findbar')).toHaveCount(0)
    await page.keyboard.press(findShortcut)
    await expect(input).toHaveValue('This')
    await expect(input).toBeFocused()
    await expect(input).toHaveJSProperty('selectionStart', 0)
    await expect(input).toHaveJSProperty('selectionEnd', 4)

    await input.fill('paragraph')
    await page.keyboard.press('Enter')
    await input.fill('draft')
    await page.keyboard.press('ArrowUp')
    await expect(input).toHaveValue('paragraph')
    await page.keyboard.press('ArrowUp')
    await expect(input).toHaveValue('This')

    await page.keyboard.press('Escape')
    await page.evaluate(() => {
      const root = document.querySelector('.km-doc')
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let node
      while ((node = walker.nextNode())) {
        const idx = node.nodeValue.indexOf('reliable click')
        if (idx === -1) continue
        const range = document.createRange()
        range.setStart(node, idx)
        range.setEnd(node, idx + 'reliable click'.length)
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
        break
      }
    })
    await page.keyboard.press(findShortcut)
    await expect(input).toHaveValue('reliable click')
    await page.locator('.findbar-option', { hasText: '[]' }).click()
    await expect(page.locator('.findbar-option.active', { hasText: '[]' })).toHaveCount(1)
    await input.fill('This')
    await expect(page.locator('.findbar-count')).toHaveText('0/0')
  } finally {
    await cleanup()
  }
})

test('find query is restored per tab instead of shared globally', async () => {
  const { page, cleanup } = await launchApp([fixture('welcome.md'), fixture('images.md')])
  const findShortcut = process.platform === 'darwin' ? 'Meta+F' : 'Control+F'
  try {
    await page.locator('.tab', { hasText: 'welcome.md' }).click()
    await expect(page.locator('.km-doc', { hasText: 'E2E Welcome Fixture' })).toBeVisible()
    await page.keyboard.press(findShortcut)
    const input = page.locator('.findbar input')
    await input.fill('This')
    await page.keyboard.press('Escape')

    await page.locator('.tab', { hasText: 'images.md' }).click()
    await page.keyboard.press(findShortcut)
    await expect(input).toHaveValue('')
    await input.fill('image')
    await page.keyboard.press('Escape')

    await page.locator('.tab', { hasText: 'welcome.md' }).click()
    await page.keyboard.press(findShortcut)
    await expect(input).toHaveValue('This')
    await page.locator('.tab', { hasText: 'images.md' }).click()
    await expect(input).toHaveValue('image')
  } finally {
    await cleanup()
  }
})

test('keep mode: find starts from the current viewport and wraps in document order', async () => {
  const { page, cleanup } = await openFindPositionFixture()
  const findShortcut = process.platform === 'darwin' ? 'Meta+F' : 'Control+F'
  try {
    const second = page.locator('.km-block', { hasText: 'Second anchorword result' })
    await second.evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await expect.poll(() => page.locator('.editor-scroll.km-scroll').evaluate((el) => el.scrollTop)).toBeGreaterThan(0)

    await page.keyboard.press(findShortcut)
    await page.locator('.findbar input').fill('anchorword')
    await expect(page.locator('.findbar-count')).toHaveText('2/3')
  } finally {
    await cleanup()
  }
})

// Switch the active tab from keep mode to Milkdown (Crepe) via the status-bar
// toggle, and return the Crepe editor locator scoped to the fixture's content.
async function switchToMilkdown(page, expectedText = 'reliable click') {
  await page.locator('button[title*="切换编辑模式"]').click()
  const pm = page.locator('.ProseMirror', { hasText: expectedText })
  await expect(pm).toBeVisible()
  return pm
}

test('milkdown mode: Enter after escaped underscores splits without deleting text', async () => {
  const { page, cleanup } = await launchApp([fixture('escaped-underscores.md')])
  try {
    await page.locator('.tab', { hasText: 'escaped-underscores.md' }).click()
    await expect(page.locator('.km-doc')).toBeVisible()

    const pm = await switchToMilkdown(page, 'GemFire廃止対応')
    const paragraphs = pm.locator('p')
    const original = '【EM003351】GemFire廃止対応_プロジェクト計画書_上海出張用.pptx'

    await paragraphs.first().click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')

    await expect(paragraphs).toHaveCount(3)
    await expect(paragraphs.nth(0)).toHaveText(original)
    await expect(paragraphs.nth(1)).toBeEmpty()
    await expect(paragraphs.nth(2)).toHaveText('概要設計：')
    await expect(paragraphs.nth(0).locator('em')).toHaveCount(0)

    // The replacement keeps the intended input rule: a pair typed directly at
    // the caret still becomes underscore-delimited emphasis.
    await page.keyboard.type('_still italic_')
    await expect(paragraphs.nth(1).locator('em')).toHaveText('still italic')
  } finally {
    await cleanup()
  }
})

test('milkdown mode: find starts from the current cursor position', async () => {
  const { page, cleanup } = await openFindPositionFixture()
  const findShortcut = process.platform === 'darwin' ? 'Meta+F' : 'Control+F'
  try {
    const pm = await switchToMilkdown(page, 'Third anchorword result')
    const third = pm.locator('p', { hasText: 'Third anchorword result' })
    await third.click()
    await page.keyboard.press('Home')

    await page.keyboard.press(findShortcut)
    await page.locator('.findbar input').fill('anchorword')
    await expect(page.locator('.findbar-count')).toHaveText('3/3')
  } finally {
    await cleanup()
  }
})

test('milkdown mode: Ctrl+2 converts the current paragraph to a heading', async () => {
  const { page, cleanup } = await openWelcome()
  try {
    const pm = await switchToMilkdown(page)
    // Place the caret in the long paragraph, then Ctrl+2 → Heading 2.
    await pm.locator('p', { hasText: 'reliable click' }).click()
    await page.keyboard.press('Control+2')
    await expect(pm.locator('h2', { hasText: 'reliable click' })).toBeVisible()
  } finally {
    await cleanup()
  }
})

test('milkdown mode: right-click block menu opens and converts the block', async () => {
  const { page, cleanup } = await openWelcome()
  try {
    const pm = await switchToMilkdown(page)
    // Right-click the paragraph to open the block context menu (¶ + H1–H6).
    await pm.locator('p', { hasText: 'reliable click' }).click({ button: 'right' })
    const menu = page.locator('.block-ctxmenu')
    await expect(menu).toBeVisible()
    await expect(menu.locator('.block-menu-item')).toHaveCount(7)
    // Converting via the menu reuses the same path as Ctrl+2 (Editor.jsx) — click
    // the "Heading 2" item and confirm the paragraph became an H2.
    await menu.locator('.block-menu-item', { hasText: '标题 2' }).click()
    await expect(pm.locator('h2', { hasText: 'reliable click' })).toBeVisible()
  } finally {
    await cleanup()
  }
})

test('milkdown mode: code-block Tab inserts at the cursor instead of moving focus', async () => {
  const { page, cleanup } = await launchApp([fixture('code-autolink.md')])
  try {
    await page.locator('.tab', { hasText: 'code-autolink.md' }).click()
    await expect(page.locator('.km-doc')).toBeVisible()
    await switchToMilkdown(page, 'const answer = 42;')

    const content = page.locator('.cm-editor .cm-content').first()
    const line = content.locator('.cm-line').first()
    await line.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Tab')

    await expect(content).toBeFocused()
    await expect.poll(() => line.textContent()).toBe('const answer = 42;\t')
  } finally {
    await cleanup()
  }
})

test('milkdown mode: GFM autolink does not swallow trailing CJK prose', async () => {
  const { page, cleanup } = await launchApp([fixture('code-autolink.md')])
  try {
    await page.locator('.tab', { hasText: 'code-autolink.md' }).click()
    await expect(page.locator('.km-doc')).toBeVisible()
    const pm = await switchToMilkdown(page, '查看课程1')

    const paragraph = pm.locator('p', { hasText: 'www.caixuetang.cn' })
    await expect(paragraph).toHaveText('www.caixuetang.cn，查看课程1')
    await expect(paragraph.locator('a')).toHaveText('www.caixuetang.cn')
  } finally {
    await cleanup()
  }
})

test('keep mode: outline jump flushes a far heading and keeps it selected while layout settles', async () => {
  const { page, cleanup } = await launchApp([fixture('outline-stability.md')])
  try {
    await page.locator('.tab', { hasText: 'outline-stability.md' }).click()
    await expect(page.locator('.km-doc')).toBeVisible()
    await page.locator('button[title="大纲"]').click()

    const item = page.locator('.outline-item[title="Far Target Heading"]')
    await expect(item).toBeVisible()
    await item.click()

    const heading = page.getByRole('heading', { name: 'Far Target Heading' })
    const scroller = page.locator('.editor-scroll.km-scroll.hm-pane-left')
    await expect.poll(async () => {
      const [headingTop, scrollerTop] = await Promise.all([
        heading.evaluate((el) => el.getBoundingClientRect().top),
        scroller.evaluate((el) => el.getBoundingClientRect().top)
      ])
      return Math.abs(headingTop - scrollerTop)
    }).toBeLessThan(4)
    await expect(item).toHaveClass(/active/)
  } finally {
    await cleanup()
  }
})

test('keep mode: outline follows document scrolling and reveals the active heading', async () => {
  const { page, cleanup } = await launchApp([fixture('outline-scrollspy.md')])
  try {
    await page.locator('.tab', { hasText: 'outline-scrollspy.md' }).click()
    await expect(page.locator('.km-doc')).toBeVisible()
    await page.locator('button[title="大纲"]').click()

    const scroller = page.locator('.editor-scroll.km-scroll.hm-pane-left')
    const outlineList = page.locator('.outline-list')
    const finalItem = page.locator('.outline-item[title="Final Section"]')
    await expect(finalItem).toBeAttached()
    await expect.poll(() => outlineList.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)

    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight
      el.dispatchEvent(new Event('scroll'))
    })

    await expect(finalItem).toHaveClass(/active/)
    await expect.poll(async () => {
      const [itemRect, listRect] = await Promise.all([
        finalItem.evaluate((el) => el.getBoundingClientRect()),
        outlineList.evaluate((el) => el.getBoundingClientRect())
      ])
      return itemRect.top >= listRect.top && itemRect.bottom <= listRect.bottom
    }).toBe(true)
  } finally {
    await cleanup()
  }
})

test('milkdown mode: slash language alias inserts a preconfigured code block', async () => {
  const { page, cleanup } = await openWelcome()
  try {
    const pm = await switchToMilkdown(page)
    const paragraph = pm.locator('p', { hasText: 'reliable click' })
    await paragraph.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('/java')

    const menu = page.locator('.hm-smart-slash[data-show="true"]')
    await expect(menu).toBeVisible()
    await expect(menu.locator('.hm-slash-item').first()).toContainText('代码 · java')
    await page.keyboard.press('Enter')

    await expect(menu).not.toBeVisible()
    await expect(pm.locator('.milkdown-code-block')).toHaveCount(1)
    await expect(pm).not.toContainText('/java')
  } finally {
    await cleanup()
  }
})

test('keep and milkdown modes: Mermaid and KaTeX open the shared zoom lightbox', async () => {
  const { page, cleanup } = await launchApp([fixture('zoom-embeds.md')])
  try {
    await page.locator('.tab', { hasText: 'zoom-embeds.md' }).click()
    await expect(page.locator('.km-doc')).toBeVisible()

    const keepMermaid = page.locator('.km-mermaid')
    await expect(keepMermaid.locator(':scope > svg')).toBeVisible()
    await keepMermaid.hover()
    await keepMermaid.locator('.hm-embed-zoom').click()
    const overlay = page.locator('.hm-zoom-overlay')
    await expect(overlay.locator('.hm-zoom-content svg')).toBeVisible()
    await expect(overlay.locator('.hm-zoom-bar span')).toHaveText('100%')
    await overlay.hover()
    await page.mouse.wheel(0, -240)
    await expect(overlay.locator('.hm-zoom-bar span')).not.toHaveText('100%')
    await page.keyboard.press('Escape')
    await expect(overlay).toHaveCount(0)

    const keepMath = page.locator('.km-math')
    await expect(keepMath.locator('.katex-display')).toBeVisible()
    await keepMath.hover()
    await keepMath.locator('.hm-embed-zoom').click()
    await expect(overlay.locator('.hm-zoom-content .katex-display')).toBeVisible()
    await page.keyboard.press('Escape')

    await switchToMilkdown(page, 'Zoom Fixture')
    const richPreview = page.locator('.milkdown-code-block .preview:has(> svg)')
    await expect(richPreview).toBeVisible()
    await richPreview.hover()
    await richPreview.locator('.hm-embed-zoom[data-zoom-kind="mermaid"]').click()
    await expect(overlay.locator('.hm-zoom-content svg')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.ProseMirror .hm-embed-zoom[data-zoom-kind="math"]')).toBeVisible()
  } finally {
    await cleanup()
  }
})

// NOTE: the on-selection floating toolbar is Crepe's own bubble (`.milkdown-toolbar`,
// with an injected `.hm-heading-item` heading button). It only surfaces on a real
// pointer drag-select and does not reliably lay out / become clickable under
// automation (the etv.mjs `.block-selbar` it superseded no longer exists). Its
// block-conversion path is the same one covered by the Ctrl+2 and context-menu
// tests above (see Editor.jsx), so it is intentionally not asserted here.
