// Per-document Japanese font: a doc containing kana gets lang="ja" on .km-doc
// (detectDocLang in keep-parser.js) so CSS :lang(ja) switches the writing font
// to the Japanese stack; a kana-free doc must NOT get it (Han characters alone
// are not a Japanese signal). See the "Per-document Japanese font" note in
// CLAUDE.md.
import { test, expect } from '@playwright/test'
import { launchApp, fixture } from './helpers.js'

test('a Japanese document marks its keep-mode container lang="ja"', async () => {
  const { page, cleanup } = await launchApp([fixture('japanese.md')])
  try {
    await page.locator('.tab', { hasText: 'japanese.md' }).click()
    const doc = page.locator('.km-doc[lang="ja"]')
    await expect(doc).toBeVisible()
    // :lang(ja) actually resolves to the Japanese stack (Noto Sans JP leads it),
    // not the default --font-write (whose CJK fonts are all Chinese — SC/PingFang,
    // never a JP face), so "Noto Sans JP" is a clean discriminator.
    const family = await doc.evaluate((el) => getComputedStyle(el).fontFamily)
    expect(family).toMatch(/Noto Sans JP/)
  } finally {
    await cleanup()
  }
})

test('a kana-free document keeps the default writing font (no lang attr)', async () => {
  const { page, cleanup } = await launchApp([fixture('welcome.md')])
  try {
    await page.locator('.tab', { hasText: 'welcome.md' }).click()
    await expect(page.locator('.km-doc')).toBeVisible()
    expect(await page.locator('.km-doc').getAttribute('lang')).toBeNull()
  } finally {
    await cleanup()
  }
})
