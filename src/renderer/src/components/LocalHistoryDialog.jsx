import { useEffect, useRef } from 'react'
import { Icon } from './icons.jsx'

const localeFor = (lang) => ({ zh: 'zh-CN', ja: 'ja-JP', en: 'en-US' }[lang] || lang)

const formatSize = (bytes) => {
  const size = Number(bytes) || 0
  if (size < 1024) return `${size} B`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}

export default function LocalHistoryDialog({
  t,
  lang,
  documentTitle,
  entries,
  canRestore,
  onCompare,
  onRestore,
  onDelete,
  onClearDocument,
  onClose
}) {
  const closeRef = useRef(null)
  useEffect(() => closeRef.current?.focus(), [])
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  const formatter = new Intl.DateTimeFormat(localeFor(lang), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

  return (
    <div
      className="hm-confirm-overlay hm-history-overlay"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="hm-history-dialog" role="dialog" aria-modal="true" aria-labelledby="hm-history-title">
        <header className="hm-review-head">
          <div>
            <h2 id="hm-history-title">{t('history.title')}</h2>
            <p>{t('history.description', { name: documentTitle })}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="hm-review-close"
            onClick={onClose}
            aria-label={t('edit.cancel')}
          >
            <Icon name="close" size={17} />
          </button>
        </header>

        <div className="hm-history-policy">{t('history.policy')}</div>
        <div className="hm-history-list">
          {!entries.length ? (
            <div className="hm-review-empty">
              <Icon name="history" size={22} />
              <span>{t('history.empty')}</span>
            </div>
          ) : (
            entries.map((entry) => (
              <article className="hm-history-item" key={entry.id}>
                <div className="hm-history-meta">
                  <strong>{formatter.format(new Date(entry.createdAt))}</strong>
                  <span>{t(entry.reason === 'autosave' ? 'history.autosave' : 'history.manual')}</span>
                  <span>{formatSize(entry.size)}</span>
                </div>
                <div className="hm-history-actions">
                  <button type="button" onClick={() => onCompare(entry)}>
                    <Icon name="search" size={13} />
                    {t('history.compare')}
                  </button>
                  <button
                    type="button"
                    className="restore"
                    disabled={!canRestore}
                    title={!canRestore ? t('history.restoreKeepOnly') : undefined}
                    onClick={() => onRestore(entry)}
                  >
                    <Icon name="undo" size={13} />
                    {t('history.restore')}
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      if (window.confirm(t('history.deleteConfirm'))) onDelete(entry)
                    }}
                  >
                    <Icon name="close" size={13} />
                    {t('history.delete')}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
        {!!entries.length && (
          <footer className="hm-history-footer">
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (window.confirm(t('history.clearDocumentConfirm'))) onClearDocument()
              }}
            >
              {t('history.clearDocument')}
            </button>
          </footer>
        )}
      </section>
    </div>
  )
}
