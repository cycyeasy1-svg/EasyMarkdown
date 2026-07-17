import { useEffect, useRef } from 'react'
import { Icon } from './icons.jsx'
import { baseName } from '../paths.js'

export default function LinkUpdateDialog({
  t,
  state,
  onApply,
  onRenameOnly,
  onClose
}) {
  const closeRef = useRef(null)
  const { plan, kind, busy, dirtyPaths = [] } = state
  const blocked = busy || dirtyPaths.length > 0

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || busy) return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [busy, onClose])

  return (
    <div className="hm-confirm-overlay hm-review-overlay">
      <section
        className="hm-review hm-link-update"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hm-link-update-title"
      >
        <header className="hm-review-head">
          <div>
            <h2 id="hm-link-update-title">
              {t(kind === 'file' ? 'links.renameFileTitle' : 'links.renameHeadingTitle')}
            </h2>
            <p>
              {t(kind === 'file' ? 'links.renameFileDescription' : 'links.renameHeadingDescription')}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="hm-review-close"
            disabled={busy}
            onClick={onClose}
            aria-label={t('edit.cancel')}
          >
            <Icon name="close" size={17} />
          </button>
        </header>
        <div className="hm-review-summary">
          <span>{t('links.updateCount', { n: plan.totalChanges, m: plan.files.length })}</span>
          {plan.truncated && <span className="hm-review-warning">{t('links.truncated')}</span>}
          {!!dirtyPaths.length && (
            <span className="hm-review-warning">
              {t('links.dirtyBlocked', { n: dirtyPaths.length })}
            </span>
          )}
        </div>
        <div className="hm-review-list">
          {plan.files.map((file) => (
            <article className="hm-review-item" key={file.path}>
              <div className="hm-review-item-head">
                <div>
                  <Icon name="file" size={13} />
                  <strong title={file.path}>{baseName(file.path)}</strong>
                </div>
                <span className="hm-review-kind">{file.changes.length}</span>
              </div>
              <div className="hm-link-update-lines">
                {file.changes.map((change) => (
                  <div className="hm-link-update-line" key={`${change.line}:${change.before}`}>
                    <span>{change.line}</span>
                    <del>{change.before || ' '}</del>
                    <ins>{change.after || ' '}</ins>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
        <footer className="hm-link-update-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            {t('edit.cancel')}
          </button>
          {kind === 'file' && (
            <button type="button" disabled={busy} onClick={onRenameOnly}>
              {t('links.renameOnly')}
            </button>
          )}
          <button type="button" className="primary" disabled={blocked} onClick={onApply}>
            {busy
              ? t('links.applying')
              : t(kind === 'file' ? 'links.renameAndUpdate' : 'links.applyUpdate')}
          </button>
        </footer>
      </section>
    </div>
  )
}
