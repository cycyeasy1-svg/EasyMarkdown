import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { launchApp } from './helpers.js'

function createWorkspace(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  const files = Array.from({ length: 6 }, (_, index) => {
    const file = join(dir, `resident-${index + 1}.md`)
    const sections = [`# Resident ${index + 1}`]
    for (let section = 0; section < 100; section += 1) {
      sections.push(
        `\n## Section ${section + 1}\n\nParagraph ${section + 1} with enough text to create a scrollable document.\n\n- first\n- second\n- third`
      )
    }
    writeFileSync(file, sections.join('\n'), 'utf8')
    return file
  })
  return { dir, files }
}

async function activate(page, file) {
  const name = basename(file)
  await page.locator('.tab', { hasText: name }).click()
  await expect(page.locator('.tab.active')).toContainText(name)
  await expect(page.locator('.editor-scroll.km-scroll:visible .km-doc')).toBeVisible()
}

async function settleInitialOpen(page, files) {
  await expect(page.locator('.tab', { hasText: basename(files.at(-1)) })).toBeVisible()
  await expect.poll(() => page.locator('.tab').count()).toBeGreaterThanOrEqual(files.length)
  await page.waitForTimeout(300)
}

test('clean inactive Keep editors hibernate and restore their reading position', async () => {
  const { dir, files } = createWorkspace('em-editor-residency-')
  const { page, cleanup } = await launchApp(files)
  try {
    await settleInitialOpen(page, files)
    await activate(page, files[0])
    const firstPane = page.locator('.editor-scroll.km-scroll:visible')
    const firstId = await firstPane.getAttribute('data-tab-id')
    await firstPane.evaluate((pane) => {
      pane.scrollTop = pane.scrollHeight * 0.68
      pane.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    await page.waitForTimeout(100)

    for (const file of files.slice(1)) await activate(page, file)

    await expect(page.locator('.km-doc')).toHaveCount(4)
    await expect(page.locator(`.editor-scroll.km-scroll[data-tab-id="${firstId}"]`)).toHaveCount(0)

    await activate(page, files[0])
    await expect.poll(async () => firstPane.evaluate((pane) =>
      pane.scrollTop / Math.max(1, pane.scrollHeight - pane.clientHeight)
    )).toBeGreaterThan(0.45)
  } finally {
    await cleanup()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a Keep editor with Undo history remains resident', async () => {
  const { dir, files } = createWorkspace('em-editor-history-')
  const { page, cleanup } = await launchApp(files)
  try {
    await settleInitialOpen(page, files)
    await activate(page, files[0])
    const firstPane = page.locator('.editor-scroll.km-scroll:visible')
    const firstId = await firstPane.getAttribute('data-tab-id')
    await firstPane.locator('.km-block[data-bi="0"] .km-src-edit').click()
    await page.locator('.km-src-editor').fill('# Edited but protected')
    await page.locator('.km-src-actions .ok').click()
    await expect(page.getByRole('heading', { name: 'Edited but protected' })).toBeVisible()
    await expect(page.locator('.status-history-btn.undo')).toBeEnabled()
    await expect(page.locator('.tab.active .tab-close.dirty')).toHaveCount(1)

    for (const file of files.slice(1)) await activate(page, file)

    await expect(page.locator(`.editor-scroll.km-scroll[data-tab-id="${firstId}"]`)).toHaveCount(1)
    await activate(page, files[0])
    const undo = page.locator('.status-history-btn.undo')
    await expect(undo).toBeEnabled()
    await undo.click()
    await expect(page.getByRole('heading', { name: 'Resident 1' })).toBeVisible()
  } finally {
    await cleanup()
    rmSync(dir, { recursive: true, force: true })
  }
})
