import { test, expect } from '@playwright/test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp } from './helpers.js'

test('file tree supports roving keyboard focus, ARIA, rename, delete and context menu', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'em-sidebar-keyboard-'))
  const docs = join(dir, 'docs')
  mkdirSync(docs)
  writeFileSync(join(docs, 'inside.md'), '# Inside\n', 'utf8')
  writeFileSync(join(dir, 'root.md'), '# Root\n', 'utf8')
  for (let index = 0; index < 80; index += 1) {
    writeFileSync(
      join(dir, `z-${String(index).padStart(3, '0')}.md`),
      `# ${index}\n`,
      'utf8'
    )
  }

  const { page, cleanup } = await launchApp([dir])
  try {
    const tree = page.getByRole('tree', { name: '工作区文件树' })
    await expect(tree).toBeVisible()
    const root = page.locator('.tree-root-row').first()
    await expect(root).toHaveAttribute('role', 'treeitem')
    await expect(root).toHaveAttribute('aria-level', '1')
    await expect(root).toHaveAttribute('aria-expanded', 'true')
    await root.focus()
    await expect(root).toBeFocused()

    // ArrowDown follows the flattened visible order; folders sort before files.
    await page.keyboard.press('ArrowDown')
    const docsRow = page.locator('.tree-row[role="treeitem"]', {
      has: page.locator('.tree-label', { hasText: /^docs$/ })
    })
    await expect(docsRow).toBeFocused()
    await expect(docsRow).toHaveAttribute('aria-level', '2')
    await expect(docsRow).toHaveAttribute('aria-expanded', 'false')

    // Right opens, a second Right enters the first child; Left returns/collapses.
    await page.keyboard.press('ArrowRight')
    await expect(docsRow).toHaveAttribute('aria-expanded', 'true')
    const insideRow = page.locator('.tree-row[role="treeitem"]', {
      has: page.locator('.tree-label', { hasText: /^inside\.md$/ })
    })
    await expect(insideRow).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(insideRow).toBeFocused()
    await expect(insideRow).toHaveAttribute('aria-level', '3')

    await page.keyboard.press('Enter')
    await expect(page.locator('.tab.active')).toContainText('inside.md')
    await page.keyboard.press('ArrowLeft')
    await expect(docsRow).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(docsRow).toHaveAttribute('aria-expanded', 'false')

    // Shift+F10 opens a real keyboard-navigable menu; Esc restores tree focus.
    await page.keyboard.press('Shift+F10')
    const menu = page.getByRole('menu', { name: '文件树操作' })
    await expect(menu).toBeVisible()
    const menuItems = menu.getByRole('menuitem')
    await expect(menuItems.first()).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(menuItems.nth(1)).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(docsRow).toBeFocused()

    // F2 performs inline rename and returns focus to the renamed row.
    const rootFile = page.locator('.tree-row[role="treeitem"]', {
      has: page.locator('.tree-label', { hasText: /^root\.md$/ })
    })
    await rootFile.focus()
    await page.keyboard.press('F2')
    const renameInput = tree.locator('.tree-rename')
    await expect(renameInput).toBeFocused()
    await renameInput.fill('renamed.md')
    await page.keyboard.press('Enter')
    const renamed = page.locator('.tree-row[role="treeitem"]', {
      has: page.locator('.tree-label', { hasText: /^renamed\.md$/ })
    })
    await expect(renamed).toBeVisible()
    await expect(renamed).toBeFocused()
    expect(existsSync(join(dir, 'renamed.md'))).toBe(true)

    // Delete confirms, removes the file and leaves focus on another visible row.
    page.once('dialog', (dialog) => dialog.accept())
    await page.keyboard.press('Delete')
    await expect(renamed).toHaveCount(0)
    expect(existsSync(join(dir, 'renamed.md'))).toBe(false)
    await expect(tree.locator('[role="treeitem"]:focus')).toHaveCount(1)

    // The keyboard context menu can create a file without touching the mouse.
    await docsRow.focus()
    await page.keyboard.press('Shift+F10')
    await expect(menuItems.first()).toBeFocused()
    await page.keyboard.press('Enter')
    const createInput = tree.locator('.creating-row .tree-rename')
    await expect(createInput).toBeFocused()
    await createInput.fill('keyboard-created.md')
    await page.keyboard.press('Enter')
    expect(existsSync(join(docs, 'keyboard-created.md'))).toBe(true)

    // Ctrl/Cmd+X and Ctrl/Cmd+V provide a keyboard equivalent to drag-moving.
    const moveSource = page.locator('.tree-row[role="treeitem"]', {
      has: page.locator('.tree-label', { hasText: /^z-000\.md$/ })
    })
    await moveSource.focus()
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+X' : 'Control+X')
    await expect(moveSource).toHaveClass(/cut/)
    await docsRow.focus()
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V')
    const moved = page.locator('.tree-row[role="treeitem"]', {
      has: page.locator('.tree-label', { hasText: /^z-000\.md$/ })
    })
    await expect(moved).toBeFocused()
    expect(existsSync(join(docs, 'z-000.md'))).toBe(true)
    expect(existsSync(join(dir, 'z-000.md'))).toBe(false)

    // End jumps to the last visible item and scrolls it into view.
    await root.focus()
    await page.keyboard.press('End')
    const last = page.locator('.tree-row[role="treeitem"]:focus')
    await expect(last.locator('.tree-label')).toHaveText('z-079.md')
    const bounds = await page.evaluate(() => {
      const treeEl = document.querySelector('.tree')
      const row = document.activeElement
      const treeRect = treeEl.getBoundingClientRect()
      const rowRect = row.getBoundingClientRect()
      return {
        rowTop: rowRect.top,
        rowBottom: rowRect.bottom,
        treeTop: treeRect.top,
        treeBottom: treeRect.bottom
      }
    })
    expect(bounds.rowTop).toBeGreaterThanOrEqual(bounds.treeTop)
    expect(bounds.rowBottom).toBeLessThanOrEqual(bounds.treeBottom + 1)
  } finally {
    await cleanup()
    rmSync(dir, { recursive: true, force: true })
  }
})
