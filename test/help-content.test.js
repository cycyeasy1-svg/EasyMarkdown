import { describe, expect, it } from 'vitest'
import { getHelpTopics, searchHelpTopics } from '../src/renderer/src/help-content.js'

describe('help content', () => {
  it('keeps stable topic ids across all supported languages', () => {
    const ids = getHelpTopics('en').map((topic) => topic.id)
    expect(getHelpTopics('zh').map((topic) => topic.id)).toEqual(ids)
    expect(getHelpTopics('ja').map((topic) => topic.id)).toEqual(ids)
    expect(ids).toContain('start')
    expect(ids).toContain('shortcuts')
  })

  it('falls back to English for an unknown locale', () => {
    expect(getHelpTopics('unknown')).toBe(getHelpTopics('en'))
  })

  it('searches localized titles, keywords, summaries, and bodies', () => {
    const results = searchHelpTopics(getHelpTopics('zh'), '表格 筛选')
    expect(results[0].topic.id).toBe('tables')
    expect(results[0].excerpt).toContain('表格')
  })

  it('requires every search term and ranks title matches first', () => {
    const topics = getHelpTopics('en')
    const titleMatch = searchHelpTopics(topics, 'keyboard shortcut')
    expect(titleMatch[0].topic.id).toBe('shortcuts')

    const strict = searchHelpTopics(topics, 'mermaid autosave')
    expect(strict).toEqual([])
  })

  it('returns source order for a blank query', () => {
    const topics = getHelpTopics('ja')
    expect(searchHelpTopics(topics, '  ').map((entry) => entry.topic.id))
      .toEqual(topics.map((topic) => topic.id))
  })
})
