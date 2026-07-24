import { Icon } from './icons.jsx'

// Render inline **bold** / `code` / [text](url) as React elements (no innerHTML → XSS-safe).
function renderInline(text) {
  const parts = []
  let rest = text
  let key = 0
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\([^)]+\)/
  let m
  while ((m = rest.match(re))) {
    if (m.index > 0) parts.push(rest.slice(0, m.index))
    if (m[1] != null) parts.push(<b key={key++}>{m[1]}</b>)
    else if (m[2] != null) parts.push(<code key={key++}>{m[2]}</code>)
    else parts.push(m[3]) // link → show its text only
    rest = rest.slice(m.index + m[0].length)
  }
  if (rest) parts.push(rest)
  return parts
}

// Lightweight Markdown → React for release notes (headings, bullets, paragraphs).
function renderNotes(md) {
  const out = []
  let list = []
  const flush = (k) => {
    if (list.length) {
      out.push(
        <ul className="update-notes-list" key={'ul' + k}>
          {list}
        </ul>
      )
      list = []
    }
  }
  ;(md || '').split('\n').forEach((raw, i) => {
    const line = raw.trim()
    if (!line) {
      flush(i)
      return
    }
    const h = line.match(/^#{1,6}\s+(.*)$/)
    const li = line.match(/^[-*]\s+(.*)$/)
    if (h) {
      flush(i)
      out.push(
        <div className="update-notes-h" key={i}>
          {renderInline(h[1])}
        </div>
      )
    } else if (li) {
      list.push(<li key={i}>{renderInline(li[1])}</li>)
    } else {
      flush(i)
      out.push(
        <div className="update-notes-p" key={i}>
          {renderInline(line)}
        </div>
      )
    }
  })
  flush('end')
  return out
}

// Public builds keep the notify-only behavior. The internal-demo distribution
// reuses the same toast for download progress and restart/install confirmation.
export default function UpdateToast({
  t,
  latest,
  current,
  notes,
  internal = false,
  phase = 'available',
  percent = 0,
  error = '',
  onDownload,
  onDismiss
}) {
  const hasNotes = !!(notes && notes.trim())
  const downloading = internal && phase === 'downloading'
  const downloaded = internal && phase === 'downloaded'
  const failed = internal && phase === 'error'
  const roundedPercent = Math.max(0, Math.min(100, Math.round(percent || 0)))
  const actionLabel = downloaded
    ? t('update.restart')
    : failed
      ? t('update.retry')
      : internal
        ? t('update.install')
        : t('update.download')
  return (
    <div className="update-toast" role="alert">
      <button
        className="update-toast-close"
        onClick={onDismiss}
        title={t('update.later')}
        disabled={downloading}
      >
        <Icon name="close" size={13} />
      </button>
      <div className="update-toast-head">
        <span className="update-toast-icon">
          <Icon name="sparkle" size={18} />
        </span>
        <div className="update-toast-text">
          <div className="update-toast-title">{t('update.title')}</div>
          <div className="update-toast-sub">
            <span className="update-ver-old">v{current}</span>
            <span className="update-ver-arrow">→</span>
            <span className="update-ver-new">v{latest}</span>
          </div>
        </div>
      </div>
      {hasNotes && (
        <div className="update-toast-notes">
          <div className="update-toast-notes-label">{t('update.whatsNew')}</div>
          <div className="update-toast-notes-body">{renderNotes(notes)}</div>
        </div>
      )}
      {downloading && (
        <div className="update-toast-progress" aria-live="polite">
          <div className="update-toast-progress-label">
            <span>{t('update.downloading')}</span>
            <span>{roundedPercent}%</span>
          </div>
          <div
            className="update-toast-progress-track"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={roundedPercent}
          >
            <span style={{ width: `${roundedPercent}%` }} />
          </div>
        </div>
      )}
      {failed && (
        <div className="update-toast-error">
          {t('update.failed')}{error ? `：${error}` : ''}
        </div>
      )}
      <div className="update-toast-foot">
        <button className="update-toast-primary" onClick={onDownload} disabled={downloading}>
          {downloading ? t('update.downloading') : actionLabel}
        </button>
      </div>
    </div>
  )
}
