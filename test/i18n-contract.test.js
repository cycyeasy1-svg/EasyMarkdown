import { describe, expect, it } from 'vitest'
import { extractPlaceholders, validateI18nCatalogs } from '../src/shared/i18n-contract.js'

describe('i18n contract', () => {
  it('extracts unique placeholders in deterministic order', () => {
    expect(extractPlaceholders('{name}: {count} / {name}')).toEqual(['count', 'name'])
  })

  it('accepts catalogs with matching keys and placeholders', () => {
    expect(
      validateI18nCatalogs({
        en: { greeting: 'Hello {name}', plain: 'Ready' },
        ja: { greeting: 'こんにちは {name}', plain: '準備完了' }
      })
    ).toEqual([])
  })

  it('reports missing and source-undefined keys', () => {
    const errors = validateI18nCatalogs({
      en: { greeting: 'Hello', ready: 'Ready' },
      ja: { greeting: 'こんにちは', extra: '余分' }
    })
    expect(errors).toEqual([
      'i18n: locale "ja" に key "ready" がありません',
      'i18n: locale "ja" に source 未定義の key "extra" があります'
    ])
  })

  it('reports placeholder drift and non-string values', () => {
    const errors = validateI18nCatalogs({
      en: { greeting: 'Hello {name}', count: '{n} files' },
      ja: { greeting: 'こんにちは {user}', count: 3 }
    })
    expect(errors).toHaveLength(2)
    expect(errors.some((error) => error.includes('placeholder が一致しません'))).toBe(true)
    expect(errors.some((error) => error.includes('string ではありません'))).toBe(true)
  })

  it('fails when the source locale is absent', () => {
    expect(validateI18nCatalogs({ ja: { ready: '準備完了' } })).toEqual([
      'i18n: source locale "en" が存在しません'
    ])
  })
})
