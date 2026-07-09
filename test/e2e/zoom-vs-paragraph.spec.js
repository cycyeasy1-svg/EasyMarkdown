// Ctrl/Cmd+0 is overloaded: inside the rich (Milkdown) editor it turns the
// current block back into a paragraph; anywhere else it resets the content zoom.
// It used to do BOTH at once — the View menu carried a CmdOrCtrl+0 accelerator,
// which does not consume the keydown, so the editor's own Ctrl+0 listener fired
// too. The accelerator is gone; App.jsx now dispatches by caret location.
//
// Note on what this can and cannot prove: Playwright's synthetic keys are
// injected straight into the renderer and never reach Electron's native menu.
// That is exactly why this suite is meaningful *after* the fix — the renderer is
// now the only place Ctrl+0 is handled, so what we exercise here is what ships.
// It would NOT have caught the old bug (the menu half was invisible to it), so
// the regression guard that matters is the accelerator assertion below.
import { test, expect } from '@playwright/test'
import { launchApp, fixture } from './helpers.js'

const readZoom = (page) =>
  page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('easymarkdown.settings.v1') || '{}').zoom ?? null
    } catch {
      return null
    }
  })

async function openWelcome() {
  const res = await launchApp([fixture('welcome.md')])
  await res.page.locator('.tab', { hasText: 'welcome.md' }).click()
  await expect(res.page.locator('.km-doc')).toBeVisible()
  return res
}

async function switchToMilkdown(page) {
  await page.locator('button[title*="切换编辑模式"]').click()
  const pm = page.locator('.ProseMirror', { hasText: 'reliable click' })
  await expect(pm).toBeVisible()
  return pm
}

test('the View menu must not bind an accelerator to zoom reset', async () => {
  // The whole fix rests on this: an accelerator here would fire *in addition to*
  // the renderer handler, so Ctrl+0 would reset zoom AND un-heading the block.
  const { app, cleanup } = await launchApp()
  try {
    const accelerators = await app.evaluate(({ Menu }) => {
      const out = []
      const walk = (items) => {
        for (const it of items) {
          if (it.accelerator) out.push({ label: it.label, accelerator: it.accelerator })
          if (it.submenu) walk(it.submenu.items)
        }
      }
      walk(Menu.getApplicationMenu().items)
      return out
    })
    const zeroKey = accelerators.filter((a) => /(?:CmdOrCtrl|Ctrl|Cmd|Command)\+0$/i.test(a.accelerator))
    expect(zeroKey, `nothing may bind Ctrl/Cmd+0: ${JSON.stringify(zeroKey)}`).toEqual([])
    // sanity: the sibling zoom accelerators are still there
    expect(accelerators.map((a) => a.accelerator)).toContain('CmdOrCtrl+=')
    expect(accelerators.map((a) => a.accelerator)).toContain('CmdOrCtrl+-')
  } finally {
    await cleanup()
  }
})

test('Ctrl+0 in the rich editor converts to paragraph and leaves zoom alone', async () => {
  const { page, cleanup } = await openWelcome()
  try {
    const pm = await switchToMilkdown(page)
    await pm.locator('p', { hasText: 'reliable click' }).click()
    await page.keyboard.press('Control+2')
    await expect(pm.locator('h2', { hasText: 'reliable click' })).toBeVisible()

    const zoomBefore = await readZoom(page)
    await pm.locator('h2', { hasText: 'reliable click' }).click()
    await page.keyboard.press('Control+0')

    await expect(pm.locator('p', { hasText: 'reliable click' })).toBeVisible()
    await expect(pm.locator('h2', { hasText: 'reliable click' })).toHaveCount(0)
    expect(await readZoom(page)).toBe(zoomBefore) // the zoom side effect is gone
  } finally {
    await cleanup()
  }
})

test('Ctrl+0 outside the rich editor resets the zoom', async () => {
  const { page, cleanup } = await openWelcome()
  try {
    // Drive zoom off its default through the renderer handler, then reset it.
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('easymarkdown.settings.v1') || '{}')
      s.zoom = 1.4
      localStorage.setItem('easymarkdown.settings.v1', JSON.stringify(s))
    })
    await page.reload()
    await page.waitForSelector('#root .app')
    await page.locator('.tab', { hasText: 'welcome.md' }).click()
    await expect(page.locator('.km-doc')).toBeVisible()
    // settings.js re-derives zoom from its step, so it lands a float epsilon off 1.4.
    expect(await readZoom(page)).toBeCloseTo(1.4, 5)

    // Caret is in the keep editor (not .ProseMirror) → Ctrl+0 must reset zoom.
    await page.locator('.km-doc').click()
    await page.keyboard.press('Control+0')
    await expect.poll(() => readZoom(page)).toBeCloseTo(1, 5)
  } finally {
    await cleanup()
  }
})
