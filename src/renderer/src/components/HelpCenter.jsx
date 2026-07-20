import { useEffect, useMemo, useRef, useState } from 'react'
import MarkdownIt from 'markdown-it'
import { Icon } from './icons.jsx'
import { useI18n } from '../i18n.jsx'
import { getHelpTopics, searchHelpTopics } from '../help-content.js'

const GROUPS = ['start', 'workflows', 'reference']
const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false
})

function renderHelpMarkdown(source) {
  // CommonMark's delimiter-flanking rule needs a separator when `**…**`
  // touches CJK letters. Normalize both boundaries in our trusted bundled
  // prose without requiring awkward visible spaces in every locale string.
  const text = String(source)
  let opening = true
  const normalized = text.replace(/\*\*/g, (marker, offset) => {
    const before = text[offset - 1] || ''
    const after = text[offset + marker.length] || ''
    if (opening) {
      opening = false
      return /[\p{L}\p{N}]/u.test(before) ? ` ${marker}` : marker
    }
    opening = true
    return /[\p{L}\p{N}]/u.test(after) ? `${marker} ` : marker
  })
  return markdown.render(normalized)
}

function TopicButton({ entry, selected, onSelect, showExcerpt = false }) {
  const topic = entry.topic || entry
  return (
    <button
      type="button"
      className={`hm-help-topic${selected ? ' active' : ''}`}
      aria-current={selected ? 'page' : undefined}
      onClick={() => onSelect(topic.id)}
    >
      <Icon name={topic.icon} size={15} />
      <span className="hm-help-topic-copy">
        <span className="hm-help-topic-title">{topic.title}</span>
        {showExcerpt && <span className="hm-help-topic-excerpt">{entry.excerpt}</span>}
      </span>
      {!showExcerpt && <Icon name="chevron-right" size={12} className="hm-help-topic-arrow" />}
    </button>
  )
}

export default function HelpCenter({ request, onClose, onNew, onOpen, onOpenSettings }) {
  const { lang, t } = useI18n()
  const topics = useMemo(() => getHelpTopics(lang), [lang])
  const requestedId = request?.topic || 'start'
  const [selectedId, setSelectedId] = useState(requestedId)
  const [query, setQuery] = useState('')
  const searchRef = useRef(null)
  const articleScrollRef = useRef(null)
  const articleRef = useRef(null)

  useEffect(() => {
    const next = topics.some((topic) => topic.id === requestedId) ? requestedId : 'start'
    setSelectedId(next)
    setQuery('')
  }, [request?.nonce, requestedId, topics])

  const selected = topics.find((topic) => topic.id === selectedId) || topics[0]
  const selectedIndex = topics.indexOf(selected)
  const results = useMemo(() => searchHelpTopics(topics, query), [query, topics])
  const renderedBody = useMemo(() => renderHelpMarkdown(selected.body), [selected.body])

  const selectTopic = (id) => {
    setSelectedId(id)
    articleScrollRef.current?.scrollTo({ top: 0 })
    requestAnimationFrame(() => articleRef.current?.focus({ preventScroll: true }))
  }

  const openExternalLink = (event) => {
    const anchor = event.target.closest?.('a')
    if (!anchor) return
    const href = anchor.getAttribute('href') || ''
    if (/^https?:\/\//i.test(href)) {
      event.preventDefault()
      window.api.openExternal?.(href)
    }
  }

  return (
    <section
      className="hm-help"
      aria-label={t('help.title')}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        if (query) setQuery('')
        else onClose?.()
      }}
    >
      <aside className="hm-help-nav">
        <div className="hm-help-nav-head">
          <div className="hm-help-brand">
            <span className="hm-help-mark"><Icon name="help" size={16} /></span>
            <span>
              <span className="hm-help-eyebrow">EasyMarkdown</span>
              <strong>{t('help.title')}</strong>
            </span>
          </div>
          <button type="button" className="hm-help-close" onClick={onClose} title={t('help.close')}>
            <Icon name="close" size={15} />
          </button>
        </div>

        <label className="hm-help-search">
          <Icon name="search" size={14} />
          <span className="sr-only">{t('help.searchLabel')}</span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder={t('help.searchPlaceholder')}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} title={t('help.clearSearch')}>
              <Icon name="close" size={12} />
            </button>
          )}
        </label>

        <div className="hm-help-mobile-select-wrap">
          <select
            className="hm-help-mobile-select"
            value={selected.id}
            aria-label={t('help.contents')}
            onChange={(event) => selectTopic(event.target.value)}
          >
            {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
          </select>
        </div>

        <nav className="hm-help-topic-list" aria-label={t('help.contents')}>
          {query ? (
            <>
              <div className="hm-help-result-count" aria-live="polite">
                {t('help.results', { n: results.length })}
              </div>
              {results.map((entry) => (
                <TopicButton
                  key={entry.topic.id}
                  entry={entry}
                  selected={entry.topic.id === selected.id}
                  onSelect={selectTopic}
                  showExcerpt
                />
              ))}
              {!results.length && (
                <div className="hm-help-empty">
                  <Icon name="search" size={20} />
                  <p>{t('help.noResults')}</p>
                  <button type="button" onClick={() => setQuery('')}>{t('help.clearSearch')}</button>
                </div>
              )}
            </>
          ) : (
            GROUPS.map((group) => (
              <div className="hm-help-group" key={group}>
                <div className="hm-help-group-title">{t(`help.group.${group}`)}</div>
                {topics.filter((topic) => topic.group === group).map((topic) => (
                  <TopicButton
                    key={topic.id}
                    entry={topic}
                    selected={topic.id === selected.id}
                    onSelect={selectTopic}
                  />
                ))}
              </div>
            ))
          )}
        </nav>

        <div className="hm-help-nav-foot">
          <kbd>F1</kbd>
          <span>{t('help.openAnytime')}</span>
        </div>
      </aside>

      <div className="hm-help-article-scroll" ref={articleScrollRef}>
        <main className="hm-help-article" ref={articleRef} tabIndex={-1}>
          <header className="hm-help-article-head">
            <span className="hm-help-section-label">{t(`help.group.${selected.group}`)}</span>
            <h1>{selected.title}</h1>
            <p>{selected.summary}</p>
            {selected.id === 'start' && (
              <div className="hm-help-quick-actions" aria-label={t('help.quickActions')}>
                <button type="button" className="primary" onClick={onNew}>
                  <Icon name="file-plus" size={15} /> {t('help.newFile')}
                </button>
                <button type="button" onClick={onOpen}>
                  <Icon name="file" size={15} /> {t('help.openFile')}
                </button>
                <button type="button" onClick={onOpenSettings}>
                  <Icon name="settings" size={15} /> {t('help.openSettings')}
                </button>
              </div>
            )}
          </header>

          <div
            className="hm-help-prose"
            onClick={openExternalLink}
            dangerouslySetInnerHTML={{ __html: renderedBody }}
          />

          <footer className="hm-help-pager">
            {selectedIndex > 0 ? (
              <button type="button" onClick={() => selectTopic(topics[selectedIndex - 1].id)}>
                <Icon name="chevron-right" size={14} className="hm-help-prev-icon" />
                <span><small>{t('help.previous')}</small>{topics[selectedIndex - 1].title}</span>
              </button>
            ) : <span />}
            {selectedIndex < topics.length - 1 && (
              <button type="button" className="next" onClick={() => selectTopic(topics[selectedIndex + 1].id)}>
                <span><small>{t('help.next')}</small>{topics[selectedIndex + 1].title}</span>
                <Icon name="chevron-right" size={14} />
              </button>
            )}
          </footer>
        </main>
      </div>
    </section>
  )
}
