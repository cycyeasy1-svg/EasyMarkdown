import { test, expect } from '@playwright/test'
import { launchApp, fixture } from './helpers.js'

test('editor scrolling reveals its scrollbar without creating a root scrollbar', async () => {
  const { page, cleanup } = await launchApp([fixture('outline-stability.md')])
  try {
    await page.locator('.tab', { hasText: 'outline-stability.md' }).click()
    const scroller = page.locator('.editor-scroll.km-scroll:visible')
    await expect(scroller.locator('.km-doc')).toBeVisible()
    await expect
      .poll(() => scroller.evaluate((element) => element.scrollHeight > element.clientHeight))
      .toBe(true)

    const rootOverflow = await page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).overflow,
      body: getComputedStyle(document.body).overflow,
      root: getComputedStyle(document.getElementById('root')).overflow
    }))
    expect(rootOverflow).toEqual({ html: 'hidden', body: 'hidden', root: 'hidden' })

    const bounds = await scroller.boundingBox()
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    await page.mouse.wheel(0, 600)
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await expect(scroller).toHaveClass(/hm-scroll-active/)
    await expect
      .poll(() =>
        scroller.evaluate(
          (element) => getComputedStyle(element, '::-webkit-scrollbar-thumb').backgroundColor
        )
      )
      .not.toBe('rgba(0, 0, 0, 0)')
    await expect(scroller).not.toHaveClass(/hm-scroll-active/, { timeout: 2_000 })
  } finally {
    await cleanup()
  }
})
