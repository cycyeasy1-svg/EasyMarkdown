// E2E for the unified Settings modal (open → toggle → persist) and tab
// pinning (context menu → pin icon → survives "Close Others"). Drag-reorder
// itself is pure HTML5 DnD (unreliable under automation); its ordering logic
// is unit-tested in paths.test.js, so here we cover the pin path end-to-end.
import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp, fixture } from './helpers.js'

test('tab migration buttons appear only on overflow and switch adjacent tabs', async () => {
  const single = await launchApp([fixture('welcome.md')])
  try {
    await expect(single.page.locator('.tab-nav')).toHaveCount(0)
  } finally {
    await single.cleanup()
  }

  const dir = mkdtempSync(join(tmpdir(), 'em-tab-overflow-'))
  // Vary intrinsic title lengths so this also guards the browser-style rule:
  // crowded tabs share one width instead of shrinking by filename length.
  const names = Array.from({ length: 14 }, (_, index) =>
    `${'document-'.repeat((index % 4) + 1)}${String(index + 1).padStart(2, '0')}.md`
  )
  const files = names.map((name) => {
    const path = join(dir, name)
    writeFileSync(path, `# ${name}\n`, 'utf8')
    return path
  })
  const many = await launchApp(files)
  try {
    const previous = many.page.locator('.tab-nav-prev')
    const next = many.page.locator('.tab-nav-next')
    await expect(previous).toBeVisible()
    await expect(next).toBeVisible()
    await expect(previous).toHaveAttribute('title', '切换到上一个标签')
    await expect(next).toHaveAttribute('title', '切换到下一个标签')

    const tabWidths = await many.page.locator('.tab').evaluateAll((tabs) =>
      tabs.map((tab) => tab.getBoundingClientRect().width)
    )
    expect(Math.max(...tabWidths) - Math.min(...tabWidths)).toBeLessThanOrEqual(1)
    expect(Math.min(...tabWidths)).toBeGreaterThanOrEqual(120)

    await many.page.locator('.tab', { hasText: names[7] }).click()
    await expect(many.page.locator('.tab.active')).toContainText(names[7])
    await previous.click()
    await expect(many.page.locator('.tab.active')).toContainText(names[6])
    await next.click()
    await expect(many.page.locator('.tab.active')).toContainText(names[7])
  } finally {
    await many.cleanup()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('settings modal opens, autosave toggle flips and persists in settings storage', async () => {
  const { page, cleanup } = await launchApp([fixture('welcome.md')])
  try {
    await page.locator('.tab', { hasText: 'welcome.md' }).click()

    // Open via the status-bar gear.
    await page.locator('.statusbar button[title="设置"]').click()
    const modal = page.locator('.hm-settings')
    await expect(modal).toBeVisible()

    // Frequently changed layout controls have moved out; font families remain
    // as their own durable Settings section.
    await expect(modal.locator('.hm-adjust-group')).toHaveCount(0)
    await expect(modal.locator('.hm-set-section-title', { hasText: '字体' })).toBeVisible()

    // Flip autosave on.
    const autosaveSwitch = modal
      .locator('.hm-set-row', { hasText: '自动保存' })
      .locator('.hm-switch')
    await expect(autosaveSwitch).toHaveAttribute('aria-checked', 'false')
    await autosaveSwitch.click()
    await expect(autosaveSwitch).toHaveAttribute('aria-checked', 'true')

    // Persisted to the settings key (same storage the next launch reads).
    await expect
      .poll(() =>
        page.evaluate(() => JSON.parse(localStorage.getItem('easymarkdown.settings.v1') || '{}').autosave)
      )
      .toBe(true)

    // Esc closes the modal.
    await page.keyboard.press('Escape')
    await expect(modal).toHaveCount(0)

    // The five high-frequency adjusters and the blank-line display option now
    // live together behind the status-bar Layout button.
    const layoutButton = page.locator('.statusbar button[title="排版"]')
    await expect(layoutButton).toHaveText('')
    await expect(layoutButton.locator('svg')).toBeVisible()
    await layoutButton.click()
    const layout = page.locator('.hm-layout-pop')
    await expect(layout.locator('.hm-adjust-group')).toHaveCount(5)
    const blankLines = layout.getByRole('switch', { name: '保留连续空行' })
    await expect(blankLines).toHaveAttribute('aria-checked', 'false')
    await blankLines.click()
    await expect
      .poll(() =>
        page.evaluate(
          () => JSON.parse(localStorage.getItem('easymarkdown.settings.v1') || '{}').blankLineSpacing
        )
      )
      .toBe(true)
  } finally {
    await cleanup()
  }
})

test('pinning a tab shows the pin icon and it survives Close Others', async () => {
  const { page, cleanup } = await launchApp([fixture('welcome.md')])
  try {
    // A fresh profile boots with the onboarding doc plus the fixture tab —
    // exactly the two tabs this scenario needs.
    const fixtureTab = page.locator('.tab', { hasText: 'welcome.md' })
    await fixtureTab.click()
    const other = page.locator('.tab', { hasNotText: 'welcome.md' }).first()
    await expect(other).toBeVisible()

    // Pin the fixture tab via its context menu.
    await fixtureTab.click({ button: 'right' })
    await page.locator('.tab-ctxmenu button', { hasText: '固定标签' }).click()
    await expect(fixtureTab).toHaveClass(/pinned/)
    await expect(fixtureTab.locator('.tab-pin')).toBeVisible()

    // "Close Others" from the OTHER tab must keep the pinned one.
    await other.click({ button: 'right' })
    await page.locator('.tab-ctxmenu button', { hasText: '关闭其他' }).click()
    await expect(page.locator('.tab.pinned', { hasText: 'welcome.md' })).toBeVisible()
    await expect(other).toBeVisible()
  } finally {
    await cleanup()
  }
})
