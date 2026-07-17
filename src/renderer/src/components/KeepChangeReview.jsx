import { useEffect, useMemo, useRef } from 'react'
import { buildKeepReviewChanges } from '../keep-review.js'
import { Icon } from './icons.jsx'

const PREVIEW_LINES = 4
const PREVIEW_CHARS = 240

const previewLines = (lines) =>
  lines.slice(0, PREVIEW_LINES).map((line) =>
    line.length > PREVIEW_CHARS ? `${line.slice(0, PREVIEW_CHARS)}…` : line
  )

function ChangePreview({ t, label, lines, tone }) {
  const preview = previewLines(lines)
  return (
    <div className={`hm-review-preview ${tone}`}>
      <div className="hm-review-preview-label">{label}</div>
      {preview.length ? (
        <pre>
          {preview.map((line, index) => (
            <span key={index}>{line || ' '}</span>
          ))}
          {lines.length > PREVIEW_LINES && (
            <em>{t('review.moreLines', { n: lines.length - PREVIEW_LINES })}</em>
          )}
        </pre>
      ) : (
        <div className="hm-review-empty-side">{t('review.noLines')}</div>
      )}
    </div>
  )
}

export default function KeepChangeReview({
  t,
  title,
  description,
  baseline,
  current,
  allowRestore = false,
  onLocate,
  onRestore,
  onClose
}) {
  const closeRef = useRef(null)
  const result = useMemo(
    () => buildKeepReviewChanges(baseline, current),
    [baseline, current]
  )

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

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

  return (
    <div className="hm-confirm-overlay hm-review-overlay" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onClose()
    }}>
      <section
        className="hm-review"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hm-review-title"
        aria-describedby="hm-review-description"
      >
        <header className="hm-review-head">
          <div>
            <h2 id="hm-review-title">{title || t('review.title')}</h2>
            <p id="hm-review-description">
              {description || t('review.description')}
            </p>
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

        <div className="hm-review-summary" aria-live="polite">
          <span>{t('review.count', { n: result.changes.length })}</span>
          {result.coarse && <span className="hm-review-warning">{t('review.coarse')}</span>}
          {result.truncated && (
            <span className="hm-review-warning">{t('review.truncated')}</span>
          )}
        </div>

        <div className="hm-review-list">
          {result.changes.length === 0 ? (
            <div className="hm-review-empty">
              <Icon name="check" size={22} />
              <span>{t('review.empty')}</span>
            </div>
          ) : (
            result.changes.map((change) => (
              <article className="hm-review-item" key={change.id}>
                <div className="hm-review-item-head">
                  <div>
                    <span className={`hm-review-kind ${change.kind}`}>
                      {t(`review.kind.${change.kind}`)}
                    </span>
                    <strong>{t('review.line', { n: change.line })}</strong>
                  </div>
                  <div className="hm-review-actions">
                    <button type="button" onClick={() => onLocate(change)}>
                      <Icon name="search" size={13} />
                      {t('review.locate')}
                    </button>
                    {allowRestore && (
                      <button
                        type="button"
                        className="restore"
                        onClick={() => onRestore(change)}
                      >
                        <Icon name="undo" size={13} />
                        {t('review.restore')}
                      </button>
                    )}
                  </div>
                </div>
                <div className="hm-review-previews">
                  <ChangePreview
                    t={t}
                    label={t('review.before')}
                    lines={change.before}
                    tone="before"
                  />
                  <ChangePreview
                    t={t}
                    label={t('review.after')}
                    lines={change.after}
                    tone="after"
                  />
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
