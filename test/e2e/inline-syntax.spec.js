// E2E for keep mode's inline renderer and its two blank-line behaviors. The unit
// suite covers the HTML strings these produce; what it cannot see is that the
// markdown-it bundle actually loads in the packaged renderer, that the <mark> and
// loose-list CSS ships, and that the blank-line-spacing setting reaches the DOM.
import { test, expect } from '@playwright/test'
import { launchApp, fixture } from './helpers.js'

// Open the committed fixture and make its lazily-mounted keep editor active.
async function openFixture() {
  const res = await launchApp([fixture('inline-syntax.md')])
  await res.page.locator('.tab', { hasText: 'inline-syntax.md' }).click()
  await expect(res.page.locator('.km-doc')).toBeVisible()
  return res
}

test('renders ==highlight==, the colored <mark> form, and GFM strikethrough', async () => {
  const { page, cleanup } = await openFixture()
  try {
    const yellow = page.locator('.km-doc mark.hm-hl-yellow')
    await expect(yellow).toHaveText('marked')
    // The CSS must ship too — an unstyled <mark> would use the UA default.
    const bg = await yellow.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg).toBe('rgb(255, 243, 163)')

    await expect(page.locator('.km-doc mark.hm-hl-red')).toHaveText('red span')
    await expect(page.locator('.km-doc s')).toHaveText('gone')
    await expect(page.locator('.km-doc em')).toHaveText('em')
  } finally {
    await cleanup()
  }
})

test('a blank line between bullets makes the list loose', async () => {
  const { page, cleanup } = await openFixture()
  try {
    // The fixture's list is tight, so it must NOT carry the class...
    await expect(page.locator('.km-doc ul.km-loose')).toHaveCount(0)
    const tightMargin = await page
      .locator('.km-doc ul > li')
      .first()
      .evaluate((el) => getComputedStyle(el).marginTop)

    // ...until a blank line is typed between the two items. Commit through the
    // block's own "edit source" affordance, the path a user actually takes.
    const block = page.locator('.km-block', { has: page.locator('ul') })
    await block.hover()
    await block.locator('.km-src-edit').click()
    // The block's innerHTML is now the textarea, so `block` (filtered on `has: ul`)
    // no longer resolves — address the edit bar directly; only one is ever open.
    const ta = page.locator('.km-src-editor')
    await ta.fill('- tight one\n\n- tight two')
    await page.locator('.km-src-actions button.ok').click()

    const loose = page.locator('.km-doc ul.km-loose')
    await expect(loose).toHaveCount(1)
    const looseMargin = await loose
      .locator('> li')
      .first()
      .evaluate((el) => getComputedStyle(el).marginTop)
    expect(parseFloat(looseMargin)).toBeGreaterThan(parseFloat(tightMargin))
  } finally {
    await cleanup()
  }
})

test('blank-line spacing is off by default and adds a gap once enabled', async () => {
  const { page, cleanup } = await openFixture()
  try {
    // Three blank lines precede "After the gap." — collapsed by default, like
    // every other Markdown renderer.
    await expect(page.locator('.km-doc .km-block[data-gap]')).toHaveCount(0)
    const gapped = page.locator('.km-block', { hasText: 'After the gap.' }).last()
    const before = parseFloat(await gapped.evaluate((el) => getComputedStyle(el).marginTop))

    await page.locator('.statusbar button[title="设置"]').click()
    const row = page.locator('.hm-set-row', { hasText: '保留连续空行' })
    await expect(row).toBeVisible()
    await row.locator('button.hm-switch').click()
    await page.locator('.hm-settings-close').click()

    // Two blank lines beyond the separator → --km-gap:2.
    const marked = page.locator('.km-doc .km-block[data-gap="2"]')
    await expect(marked).toHaveCount(1)
    const after = parseFloat(await marked.evaluate((el) => getComputedStyle(el).marginTop))
    expect(after).toBeGreaterThan(before)
  } finally {
    await cleanup()
  }
})
