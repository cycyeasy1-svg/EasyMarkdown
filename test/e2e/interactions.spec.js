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

test('keep mode: editing a block via "edit source" updates the rendered doc', async () => {
  const { page, cleanup } = await openWelcome()
  try {
    // Block 0 is the H1. Its per-block "edit source" button swaps in a raw-text
    // textarea (.km-src-editor) with action buttons (.ok / cancel).
    await page.locator('.km-block[data-bi="0"] .km-src-edit').click();
    const editor = page.locator('.km-src-editor')
    await expect(editor).toBeVisible()
    await expect(editor).toHaveValue('# E2E Welcome Fixture')
    // Rewrite the source and commit by clicking OK.
    await editor.fill('# Edited By E2E')
    await page.locator('.km-src-actions .ok').click()
    // The block re-renders from the new source.
    await expect(page.getByRole('heading', { name: 'Edited By E2E' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'E2E Welcome Fixture' })).toHaveCount(0)
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

// Switch the active tab from keep mode to Milkdown (Crepe) via the status-bar
// toggle, and return the Crepe editor locator scoped to the fixture's content.
async function switchToMilkdown(page) {
  await page.locator('button[title*="切换编辑模式"]').click()
  const pm = page.locator('.ProseMirror', { hasText: 'reliable click' })
  await expect(pm).toBeVisible()
  return pm
}

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

// NOTE: the on-selection floating toolbar is Crepe's own bubble (`.milkdown-toolbar`,
// with an injected `.hm-heading-item` heading button). It only surfaces on a real
// pointer drag-select and does not reliably lay out / become clickable under
// automation (the etv.mjs `.block-selbar` it superseded no longer exists). Its
// block-conversion path is the same one covered by the Ctrl+2 and context-menu
// tests above (see Editor.jsx), so it is intentionally not asserted here.
