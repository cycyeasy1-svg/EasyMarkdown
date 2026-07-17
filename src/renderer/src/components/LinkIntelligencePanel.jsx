import { memo } from 'react'
import { Icon } from './icons.jsx'
import { useI18n } from '../i18n.jsx'
import { baseName, dirName } from '../paths.js'

const excerpt = (item) => {
  const text = item.text || ''
  const start = Math.max(0, Math.min(item.textCol || 0, text.length))
  const end = Math.max(start, Math.min(start + (item.len || 1), text.length))
  return (
    <>
      <span>{text.slice(0, start).trimStart()}</span>
      <mark className="hm-search-hit">{text.slice(start, end)}</mark>
      <span>{text.slice(end)}</span>
    </>
  )
}

function ResultGroups({ groups, onOpenResult }) {
  const { t } = useI18n()
  return groups.map((group) => (
    <div className="hm-search-group" key={group.path}>
      <div className="hm-search-file" title={group.path}>
        <Icon name="file" size={13} className="hm-search-fileicon" />
        <span className="hm-search-filename">{baseName(group.path)}</span>
        <span className="hm-search-filedir">{dirName(group.path)}</span>
        <span className="hm-search-count">{group.items.length}</span>
      </div>
      {group.items.map((item, index) => (
        <button
          className="hm-search-item"
          key={`${item.line}:${item.col}:${index}`}
          title={t('search.gotoLine', { n: item.line })}
          onClick={() => onOpenResult(group.path, item.line)}
        >
          <span className="hm-search-line">{item.line}</span>
          {item.kind && (
            <span className={`hm-link-kind ${item.kind}`}>
              {t(`links.kind.${item.kind}`)}
            </span>
          )}
          <span className="hm-search-text">{excerpt(item)}</span>
        </button>
      ))}
    </div>
  ))
}

function LinkIntelligencePanel({
  view,
  onSetView,
  docPath,
  problems,
  diagnosing,
  referenceGroups,
  referencesRunning,
  referenceLabel,
  filesScanned,
  truncated,
  onRefresh,
  onFindCurrentReferences,
  onOpenResult
}) {
  const { t } = useI18n()
  const problemGroups = docPath && problems.length ? [{ path: docPath, items: problems }] : []
  const groups = view === 'references' ? referenceGroups : problemGroups
  const running = view === 'references' ? referencesRunning : diagnosing
  const total = groups.reduce((sum, group) => sum + group.items.length, 0)

  return (
    <div className="hm-search-panel hm-link-panel">
      <div className="hm-search-head">{t('links.title')}</div>
      <div className="hm-link-tabs" role="tablist" aria-label={t('links.title')}>
        <button
          role="tab"
          aria-selected={view === 'problems'}
          className={view === 'problems' ? 'active' : ''}
          onClick={() => onSetView('problems')}
        >
          {t('links.problems')}
          {!!problems.length && <span>{problems.length}</span>}
        </button>
        <button
          role="tab"
          aria-selected={view === 'references'}
          className={view === 'references' ? 'active' : ''}
          onClick={() => onSetView('references')}
        >
          {t('links.references')}
        </button>
      </div>
      <div className="hm-link-actions">
        {view === 'problems' ? (
          <button onClick={onRefresh}>
            <Icon name="sync" size={13} /> {t('links.refresh')}
          </button>
        ) : (
          <button onClick={onFindCurrentReferences}>
            <Icon name="search" size={13} /> {t('links.findCurrent')}
          </button>
        )}
      </div>
      <div className="hm-search-status" aria-live="polite">
        {running
          ? t(view === 'problems' ? 'links.checking' : 'links.searching')
          : view === 'references' && referenceLabel
            ? t('links.referenceSummary', { n: total, label: referenceLabel })
            : t('links.problemSummary', { n: problems.length })}
        {!running && filesScanned > 0 && view === 'references'
          ? ` · ${t('links.filesScanned', { n: filesScanned })}`
          : ''}
      </div>
      {truncated && view === 'references' && (
        <div className="hm-link-warning">{t('links.truncated')}</div>
      )}
      <div className="hm-search-results">
        <ResultGroups groups={groups} onOpenResult={onOpenResult} />
        {!running && !groups.length && (
          <div className="hm-search-empty">
            {view === 'problems'
              ? docPath ? t('links.noProblems') : t('links.saveToCheck')
              : t('links.noReferences')}
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(LinkIntelligencePanel)
