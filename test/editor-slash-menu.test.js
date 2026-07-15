import { describe, expect, it } from 'vitest'
import { translate } from '../src/renderer/src/i18n-strings.js'
import { buildSlashItems, scoreSlashItem } from '../src/renderer/src/components/editor-slash-menu.js'

const zh = (key) => translate('zh', key)
const matches = (query) => buildSlashItems(zh, query)
  .filter((item) => scoreSlashItem(item, query) >= 0)
  .sort((a, b) => scoreSlashItem(b, query) - scoreSlashItem(a, query))

describe('smart slash menu matching', () => {
  it('matches Chinese labels by pinyin initials', () => {
    expect(matches('bt').slice(0, 3).map((item) => item.id)).toEqual(['h1', 'h2', 'h3'])
    expect(matches('wxlb')[0].id).toBe('bullet')
  })

  it('ranks an exact language code block above prefix matches', () => {
    const result = matches('java')
    expect(result[0].id).toBe('code:java')
    expect(result[0].label).toBe('代码 · java')
  })

  it('offers useful language prefixes without noisy one-letter substrings', () => {
    expect(matches('j').map((item) => item.id)).toEqual(expect.arrayContaining([
      'code:javascript', 'code:java', 'code:json'
    ]))
    const code = buildSlashItems(zh).find((item) => item.id === 'code')
    expect(scoreSlashItem(code, 'o')).toBe(-1)
    expect(scoreSlashItem(code, 'ode')).toBe(10)
  })
})
