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

    // Open the Settings modal (status-bar gear) and pick a paragraph-spacing
    // preset other than the active one, so the value is guaranteed to change.
    await page.locator('.statusbar button[title="设置"]').click()
    const group = page.locator('.hm-adjust-group', {
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

test('switching the editor engine keeps the document content', async () => {
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
