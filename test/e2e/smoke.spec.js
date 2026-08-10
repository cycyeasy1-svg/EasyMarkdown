// Boot + fixture-render smoke tests. These prove the harness end-to-end:
// Playwright launches the built Electron app, opens committed fixtures as tabs,
// and asserts real rendered DOM — the foundation the ported etv.mjs cases build on.
import { test, expect } from '@playwright/test'
import axe from 'axe-core'
import { launchApp, fixture, setWindowSize } from './helpers.js'

async function expectHorizontalContainment(page) {
  const metrics = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    rootWidth: document.documentElement.scrollWidth,
    appWidth: document.querySelector('.app')?.scrollWidth || 0,
    appClientWidth: document.querySelector('.app')?.clientWidth || 0
  }))
  expect(metrics.rootWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1)
  expect(metrics.appWidth).toBeLessThanOrEqual(metrics.appClientWidth + 1)
}

async function expectInsideViewport(page, selector) {
  const geometry = await page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: document.documentElement.clientHeight
    }
  })
  expect(geometry.left).toBeGreaterThanOrEqual(-1)
  expect(geometry.top).toBeGreaterThanOrEqual(-1)
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1)
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1)
}

test('startup app chrome has no serious or critical axe violations', async () => {
  const { page, cleanup } = await launchApp()
  try {
    // The shell fades controls from transparent during its first 200 ms. Axe
    // must inspect the settled UI, otherwise it measures the transition frame
    // against the sidebar background and reports a false contrast failure.
    await page.waitForFunction(() => {
      const button = document.querySelector('.btn-primary')
      return button && getComputedStyle(button).backgroundColor.startsWith('rgb(')
    })
    // @axe-core/playwright opens a helper page, which Electron's browser context
    // does not support. Inject the same official axe-core runtime into the real
    // Electron renderer and run it against the mounted application instead.
    await page.evaluate(axe.source)
    const result = await page.evaluate(() =>
      window.axe.run({
        include: [['.activity-bar'], ['.topbar'], ['.pane-left'], ['.statusbar']]
      })
    )
    const blocking = result.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical'
    )
    const summary = blocking.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target)
    }))
    expect(
      summary,
      blocking.map((violation) => `${violation.id}: ${violation.help}`).join('\n')
    ).toEqual([])
  } finally {
    await cleanup()
  }
})

test('minimum window keeps controlled Keep UI accessible and keyboard operable', async () => {
  const { app, page, cleanup } = await launchApp([fixture('japanese.md'), fixture('filter.md')])
  try {
    await setWindowSize(app, page, 720, 480)
    const japaneseTab = page.getByRole('tab', { name: 'japanese.md', exact: true })
    const filterTab = page.getByRole('tab', { name: 'filter.md', exact: true })
    await japaneseTab.click()
    await expect(page.getByRole('heading', { name: '日本語のフィクスチャ' })).toBeVisible()

    const modeHint = page.locator('.mode-hint')
    if (await modeHint.isVisible()) await modeHint.locator('.mode-hint-ok').click()
    await expectHorizontalContainment(page)

    const tablist = page.getByRole('tablist', { name: '打开的文档' })
    await expect(tablist).toBeVisible()
    await expect(japaneseTab).toHaveAttribute('aria-selected', 'true')
    await japaneseTab.focus()
    await page.keyboard.press('ArrowRight')
    await expect(filterTab).toBeFocused()
    await expect(filterTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { name: 'Filter Fixture' })).toBeVisible()
    await page.keyboard.press('ArrowLeft')
    await expect(japaneseTab).toBeFocused()
    await expect(japaneseTab).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('End')
    await expect(filterTab).toBeFocused()
    await expect(filterTab).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Home')
    await expect(tablist.getByRole('tab').first()).toBeFocused()
    await expect(tablist.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true')
    await japaneseTab.click()

    await page.waitForTimeout(250)
    await page.evaluate(axe.source)
    const audit = () => page.evaluate(() => window.axe.run({ include: [['.app']] }))
    const expectNoBlockingViolations = (result, theme) => {
      const blocking = result.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical'
      )
      const summary = blocking.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.map((node) => node.target)
      }))
      expect(
        summary,
        `${theme}\n${blocking.map((violation) => `${violation.id}: ${violation.help}`).join('\n')}`
      ).toEqual([])
    }
    expectNoBlockingViolations(await audit(), 'light theme')

    await page.keyboard.press('F1')
    await expect(page.locator('.hm-help')).toBeVisible()
    await expectInsideViewport(page, '.hm-help')
    await expectHorizontalContainment(page)
    await page.waitForTimeout(250)
    expectNoBlockingViolations(await audit(), 'light theme help')
    await page.locator('.hm-help-close').click()

    await page.locator('.statusbar button[title="设置"]').click()
    await expect(page.locator('.hm-settings')).toBeVisible()
    await expectInsideViewport(page, '.hm-settings')
    await expectHorizontalContainment(page)
    await page.waitForTimeout(250)
    expectNoBlockingViolations(await audit(), 'light theme settings')
    await page.locator('.hm-set-theme').filter({ hasText: '暖夜' }).click()
    await expect(page.locator('body')).toHaveClass(/\bdark\b/)
    await page.waitForTimeout(250)
    expectNoBlockingViolations(await audit(), 'dark theme settings')
    await page.locator('.hm-settings-close').click()

    await page.keyboard.press('F1')
    await expect(page.locator('.hm-help')).toBeVisible()
    await expectInsideViewport(page, '.hm-help')
    await expectHorizontalContainment(page)
    await page.waitForTimeout(250)
    expectNoBlockingViolations(await audit(), 'dark theme help')
    await page.locator('.hm-help-close').click()

    await page.waitForTimeout(250)
    expectNoBlockingViolations(await audit(), 'dark theme')
  } finally {
    await cleanup()
  }
})

test('app boots: shell, preload bridge and status bar are present', async () => {
  const { page, cleanup } = await launchApp()
  try {
    // Shell mounted (waited on in launchApp) and the platform class is applied.
    await expect(page.locator('#root .app')).toBeVisible()
    // The whitelisted preload bridge is exposed to the renderer.
    expect(await page.evaluate(() => typeof window.api)).toBe('object')
    // A theme base class is on <body> (light|dark).
    const bodyClass = await page.evaluate(() => document.body.className)
    expect(bodyClass).toMatch(/\b(light|dark)\b/)
    await expect(page.locator('.statusbar')).toBeVisible()
  } finally {
    await cleanup()
  }
})

test('safe mode boots without restoring session or custom themes', async () => {
  const { page, cleanup } = await launchApp(['--safe-mode'])
  try {
    await expect(page.locator('#root .app')).toHaveClass(/\bsafe-mode\b/)
    await expect(page.locator('.hm-safe-mode-banner')).toBeVisible()
    expect(await page.evaluate(() => window.api.safeMode)).toBe(true)
  } finally {
    await cleanup()
  }
})

test('opening a markdown fixture renders its heading in the editor', async () => {
  const { page, cleanup } = await launchApp([fixture('welcome.md')])
  try {
    // The fixture opened as a tab. (First run also opens the onboarding doc, so
    // activate the fixture's tab to make its lazily-mounted editor the visible one.)
    const tab = page.locator('.tab', { hasText: 'welcome.md' })
    await expect(tab).toBeVisible()
    await tab.click()
    // Editor-agnostic: opened .md renders in the keep editor (.km-*) here, the
    // onboarding doc in Milkdown (.ProseMirror) — so assert by role, not class.
    await expect(page.getByRole('heading', { name: 'E2E Welcome Fixture' })).toBeVisible()
  } finally {
    await cleanup()
  }
})

test('rendered document shows list and table block content', async () => {
  const { page, cleanup } = await launchApp([fixture('welcome.md')])
  try {
    await page.locator('.tab', { hasText: 'welcome.md' }).click()
    await expect(page.getByText('list item one')).toBeVisible()
    // Scope to the live document: a wide table also mounts a hidden floating-header
    // clone (outside .km-doc) carrying the same header text — see editor-tablescroll.js.
    await expect(page.locator('.km-doc').getByText('col a')).toBeVisible()
  } finally {
    await cleanup()
  }
})

test('keep mode resolves a relative image to a file:// URL', async () => {
  const { page, cleanup } = await launchApp([fixture('images.md')])
  try {
    await page.locator('.tab', { hasText: 'images.md' }).click()
    // The fixture's ![sample](./assets/sample.png) renders as an <img> whose src
    // is resolved against the doc folder (keep-parser inline() + resolveToFileUrl).
    const img = page.locator('.km-doc img').first()
    await expect(img).toHaveAttribute('src', /^file:\/\/.*sample\.png$/)
  } finally {
    await cleanup()
  }
})
