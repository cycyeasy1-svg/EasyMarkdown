import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './icons.jsx'
import logoUrl from '../assets/logo.png'
import { useI18n } from '../i18n.jsx'
import { THEMES } from '../themes.js'
import { LANGS } from '../i18n.jsx'
import { FONT_SIZE_MIN, FONT_SIZE_MAX, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from '../settings.js'

const zoomPct = (z) => Math.round(z * 100) + '%'

// Render a short string with **bold** spans (used by the one-time mode hint).
function boldMd(s) {
  return String(s)
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((seg, i) =>
      seg.startsWith('**') && seg.endsWith('**') ? (
        <strong key={i}>{seg.slice(2, -2)}</strong>
      ) : (
        <span key={i}>{seg}</span>
      )
    )
}

// App version, injected at build time from package.json (see electron.vite.config).
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''
const ORIGINAL_AUTHOR = 'Evan Yang'
const PRODUCT_AUTHOR = 'Easy Chen'
const ORIGINAL_PROJECT = 'BND-1/horseMD'

// Render an i18n template like "Built by {author}…" with the {token} slots
// swapped for emphasized names, so the names stay bold across both languages.
function richLine(tpl, map) {
  return tpl.split(/(\{\w+\})/g).map((part, i) => {
    const m = part.match(/^\{(\w+)\}$/)
    return m ? (
      <strong className="hm-about-name" key={i}>
        {map[m[1]]}
      </strong>
    ) : (
      part
    )
  })
}

function stats(md) {
  const text = (md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[#>*_~\-[\]()!]/g, ' ')
  const words = (text.match(/[\p{L}\p{N}]+/gu) || []).length
  const chars = (md || '').length
  const charsNoSpace = (md || '').replace(/\s/g, '').length
  const readMin = Math.max(1, Math.round(words / 220))
  return { words, chars, charsNoSpace, readMin }
}

// Small popover that closes on outside click.
function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])
  return { open, setOpen, ref }
}

// Document stats: one status-bar button showing the character count → popover
// with the full breakdown (words, characters, characters w/o spaces, read time).
function StatsControl({ stats }) {
  const { t } = useI18n()
  const { open, setOpen, ref } = usePopover()
  const n = (x) => x.toLocaleString()
  const rows = [
    [t('status.statWords'), n(stats.words)],
    [t('status.statChars'), n(stats.chars)],
    [t('status.statCharsNoSpace'), n(stats.charsNoSpace)],
    [t('status.statRead'), t('status.readValue', { n: stats.readMin })]
  ]
  return (
    <div className="block-switch hm-stats" ref={ref}>
      <button className="status-btn" onClick={() => setOpen((v) => !v)} title={t('status.stats')}>
        <Icon name="stats" size={14} /> {t('status.chars', { n: n(stats.chars) })}
      </button>
      {open && (
        <div className="hm-pop hm-stats-pop">
          {rows.map(([label, value]) => (
            <div className="hm-stat-row" key={label}>
              <span className="hm-stat-label">{label}</span>
              <span className="hm-stat-value">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// About: keep product ownership primary while preserving the MIT attribution.
function AboutControl() {
  const { t } = useI18n()
  const { open, setOpen, ref } = usePopover()
  return (
    <div className="block-switch hm-about" ref={ref}>
      <button className="status-btn" onClick={() => setOpen((v) => !v)} title={t('about.title')}>
        <Icon name="info" size={14} />
      </button>
      {open && (
        <div className="hm-pop hm-about-pop">
          <div className="hm-about-head">
            <img className="hm-about-logo" src={logoUrl} alt="EasyMarkdown" />
            <div className="hm-about-name-ver">
              <span className="hm-about-brand">
                <span className="brand-easy">Easy</span>
                <span className="brand-md">Markdown</span>
              </span>
              {APP_VERSION && <span className="hm-about-ver">v{APP_VERSION}</span>}
            </div>
          </div>
          <p className="hm-about-text">
            {richLine(t('about.intro'), { author: PRODUCT_AUTHOR })}
          </p>
          <p className="hm-about-text">
            {richLine(t('about.thanks'), { project: ORIGINAL_PROJECT, author: ORIGINAL_AUTHOR })}
          </p>
          <div className="hm-about-license">{t('about.license')}</div>
        </div>
      )}
    </div>
  )
}

// Mobile: a single "•••" popover that folds together the controls that crowd
// the bottom bar on a phone — word counts, source toggle, theme, language,
// GitHub — so the bar itself stays to just the block type + this one button.
function MobileMore({
  dirty,
  onSave,
  showKeepHistory,
  keepHistory,
  hasDraft,
  onUndoKeep,
  onRedoKeep,
  sourceMode,
  onToggleSource,
  theme,
  setTheme,
  lang,
  setLang,
  customThemes = [],
  customTheme,
  onPickCustom,
  onRefreshThemes,
  fontSize,
  onSetFontSize,
  zoom,
  onSetZoom
}) {
  const { t } = useI18n()
  const { open, setOpen, ref } = usePopover()
  const stepFont = (delta) =>
    onSetFontSize(Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, fontSize + delta)))
  const stepZoom = (delta) =>
    onSetZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom + delta)))
  const toggle = () => {
    if (!open) onRefreshThemes?.()
    setOpen((v) => !v)
  }
  const historyBlocked = !!hasDraft
  const undoTitle = historyBlocked ? t('keep.finishDraft') : t('keep.undoTitle')
  const redoTitle = historyBlocked ? t('keep.finishDraft') : t('keep.redoTitle')
  return (
    <div className="block-switch" ref={ref}>
      <button className="status-btn hm-more-btn" onClick={toggle} title={t('status.more')}>
        <Icon name="more" size={16} />
        <span>{t('status.more')}</span>
      </button>
      {open && (
        <div className="block-switch-menu hm-status-sheet">
          <button
            className={`block-menu-item hm-sheet-save${dirty ? ' dirty' : ''}`}
            onClick={() => {
              onSave?.()
              setOpen(false)
            }}
          >
            <Icon name="save" size={15} />
            <span className="block-menu-name">{t('status.save')}</span>
            {dirty && <span className="hm-sheet-save-dot" />}
          </button>
          {showKeepHistory && (
            <div className="hm-sheet-history" aria-label={t('keep.historyActions')}>
              <button
                className="block-menu-item"
                title={undoTitle}
                disabled={historyBlocked || !keepHistory?.canUndo}
                onClick={() => {
                  onUndoKeep?.()
                  setOpen(false)
                }}
              >
                <Icon name="undo" size={15} />
                <span className="block-menu-name">{t('cmd.undoKeep')}</span>
              </button>
              <button
                className="block-menu-item"
                title={redoTitle}
                disabled={historyBlocked || !keepHistory?.canRedo}
                onClick={() => {
                  onRedoKeep?.()
                  setOpen(false)
                }}
              >
                <Icon name="redo" size={15} />
                <span className="block-menu-name">{t('cmd.redoKeep')}</span>
              </button>
            </div>
          )}
          <div className="theme-menu-sep" />
          <button
            className="block-menu-item"
            onClick={() => {
              onToggleSource()
              setOpen(false)
            }}
          >
            <Icon name="code" size={14} />
            <span className="block-menu-name">
              {sourceMode ? t('status.source') : t('status.rich')}
            </span>
          </button>

          <div className="theme-menu-label">{t('settings.fontSize')}</div>
          <div className="hm-sheet-fontsize">
            <button
              className="hm-fontstep"
              onClick={() => stepFont(-1)}
              disabled={fontSize <= FONT_SIZE_MIN}
              aria-label="−"
            >
              −
            </button>
            <span className="hm-fontstep-value">{fontSize}px</span>
            <button
              className="hm-fontstep"
              onClick={() => stepFont(1)}
              disabled={fontSize >= FONT_SIZE_MAX}
              aria-label="+"
            >
              +
            </button>
          </div>

          <div className="theme-menu-label">{t('settings.zoom')}</div>
          <div className="hm-sheet-fontsize">
            <button
              className="hm-fontstep"
              onClick={() => stepZoom(-ZOOM_STEP)}
              disabled={zoom <= ZOOM_MIN}
              aria-label="−"
            >
              −
            </button>
            <span className="hm-fontstep-value">{zoomPct(zoom)}</span>
            <button
              className="hm-fontstep"
              onClick={() => stepZoom(ZOOM_STEP)}
              disabled={zoom >= ZOOM_MAX}
              aria-label="+"
            >
              +
            </button>
          </div>

          <div className="theme-menu-label">{t('tip.toggleTheme')}</div>
          <div className="hm-sheet-themes">
            {THEMES.map((th) => (
              <button
                key={th.id}
                className={`hm-sheet-swatch${!customTheme && th.id === theme ? ' active' : ''}`}
                style={{ background: th.swatch }}
                title={lang === 'zh' ? th.zh : th.en}
                onClick={() => setTheme(th.id)}
              />
            ))}
            {customThemes.map((c) => (
              <button
                key={c.file}
                className={`hm-sheet-swatch hm-sheet-swatch-custom${customTheme === c.file ? ' active' : ''}`}
                title={c.name}
                onClick={() => onPickCustom?.(c.file)}
              />
            ))}
          </div>

          <div className="theme-menu-label">{t('tip.language')}</div>
          <div className="hm-sheet-langs">
            {LANGS.map((l) => (
              <button
                key={l.id}
                className={`block-menu-item${l.id === lang ? ' active' : ''}`}
                onClick={() => setLang(l.id)}
              >
                <span className="block-menu-name">{l.label}</span>
              </button>
            ))}
          </div>

          <div className="theme-menu-sep" />
          <div className="theme-menu-label">{t('about.title')}</div>
          <div className="hm-about-sheet">
            <p className="hm-about-text">
              {richLine(t('about.intro'), { author: PRODUCT_AUTHOR })}
            </p>
            <p className="hm-about-text">
              {richLine(t('about.thanks'), { project: ORIGINAL_PROJECT, author: ORIGINAL_AUTHOR })}
            </p>
            <div className="hm-about-license">{t('about.license')}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBar({
  tab,
  hasDraft = false,
  keepHistory,
  isMobile,
  onSave,
  onUndoKeep,
  onRedoKeep,
  onShare,
  theme,
  setTheme,
  lang,
  setLang,
  sourceMode,
  onToggleSource,
  keepEligible,
  keepMode,
  onToggleKeep,
  showModeHint,
  onDismissModeHint,
  fontSize,
  onSetFontSize,
  zoom,
  onSetZoom,
  customThemes,
  customTheme,
  onPickCustom,
  onRefreshThemes,
  filterInfo,
  onClearFilters,
  onOpenSettings
}) {
  const { t } = useI18n()
  // Word/char/reading-time stats run 3 whole-document regex passes; computing
  // them from a deferred value keeps that work out of the urgent per-keystroke
  // render. The dirty dot stays on the live content so it flips instantly.
  const deferredContent = useDeferredValue(tab?.content)
  const s = useMemo(() => stats(deferredContent), [deferredContent])
  const dirty = !!tab && (tab.content !== tab.savedContent || hasDraft)
  const showKeepHistory = !!tab && keepEligible && keepMode && !sourceMode
  const historyBlocked = !!hasDraft
  const undoTitle = historyBlocked ? t('keep.finishDraft') : t('keep.undoTitle')
  const redoTitle = historyBlocked ? t('keep.finishDraft') : t('keep.redoTitle')
  return (
    <div className="statusbar">
      <div className="status-left">
        {tab ? (
          isMobile ? (
            <>
              <span className={`status-dot ${dirty ? 'mod' : 'ok'}`}>{dirty ? '●' : '✓'}</span>
              <span className="status-counts">
                {t('status.words', { n: s.words })} · {t('status.chars', { n: s.chars })} ·{' '}
                {t('status.read', { n: s.readMin })}
              </span>
            </>
          ) : (
            <>
              <span className="status-path" title={tab.path || t('status.unsaved')}>
                {tab.path || t('status.unsaved')}
              </span>
              <span className="status-state-group">
                <span className={`status-dot ${dirty ? 'mod' : 'ok'}`}>
                  {dirty ? '● ' + t('status.modified') : '✓ ' + t('status.saved')}
                </span>
                {showKeepHistory && (
                  <span className="status-history" aria-label={t('keep.historyActions')}>
                    <button
                      type="button"
                      className="status-history-btn undo"
                      title={undoTitle}
                      aria-label={undoTitle}
                      disabled={historyBlocked || !keepHistory?.canUndo}
                      onClick={onUndoKeep}
                    >
                      <Icon name="undo" size={14} />
                    </button>
                    <button
                      type="button"
                      className="status-history-btn redo"
                      title={redoTitle}
                      aria-label={redoTitle}
                      disabled={historyBlocked || !keepHistory?.canRedo}
                      onClick={onRedoKeep}
                    >
                      <Icon name="redo" size={14} />
                    </button>
                  </span>
                )}
              </span>
              {filterInfo && (
                <button
                  type="button"
                  className="status-filter"
                  // Multi-table: the label is an aggregate, so the tooltip breaks it
                  // down per table (numbered in document order) above the clear hint.
                  title={[
                    ...(filterInfo.tables?.length > 1
                      ? filterInfo.tables.map((ft) =>
                          t('status.filteredTable', { i: ft.ti + 1, shown: ft.shown, total: ft.total })
                        )
                      : []),
                    t('status.clearFilters')
                  ].join('\n')}
                  onClick={onClearFilters}
                >
                  <Icon name="filter" size={12} />{' '}
                  {filterInfo.tables?.length > 1
                    ? t('status.filteredMulti', {
                        n: filterInfo.tables.length,
                        shown: filterInfo.shown,
                        total: filterInfo.total
                      })
                    : t('status.filtered', filterInfo)}
                  <Icon name="close" size={11} />
                </button>
              )}
            </>
          )
        ) : (
          <span className="status-path">{t('status.ready')}</span>
        )}
      </div>
      <div className="status-right">
        {isMobile ? (
          tab && (
            <>
              {window.api.capabilities?.canShare && (
                <button className="status-btn hm-share-btn" onClick={onShare} title={t('status.share')}>
                  <Icon name="share" size={17} />
                  <span>{t('status.shareShort')}</span>
                </button>
              )}
              <MobileMore
                dirty={dirty}
                onSave={onSave}
                showKeepHistory={showKeepHistory}
                keepHistory={keepHistory}
                hasDraft={hasDraft}
                onUndoKeep={onUndoKeep}
                onRedoKeep={onRedoKeep}
                sourceMode={sourceMode}
                onToggleSource={onToggleSource}
                theme={theme}
                setTheme={setTheme}
                lang={lang}
                setLang={setLang}
                customThemes={customThemes}
                customTheme={customTheme}
                onPickCustom={onPickCustom}
                onRefreshThemes={onRefreshThemes}
                fontSize={fontSize}
                onSetFontSize={onSetFontSize}
                zoom={zoom}
                onSetZoom={onSetZoom}
              />
            </>
          )
        ) : (
          <>
            {tab && <StatsControl stats={s} />}
            {keepEligible && (
              <span className="mode-switch-wrap">
                <button
                  className={`status-btn${keepMode ? ' active' : ''}`}
                  onClick={onToggleKeep}
                  title={t('tip.toggleKeep')}
                >
                  <Icon name="shield" size={14} /> {keepMode ? t('mode.keep') : t('mode.rich')}
                </button>
                {showModeHint && (
                  <div className="mode-hint" role="dialog">
                    <button
                      className="mode-hint-close"
                      onClick={onDismissModeHint}
                      aria-label={t('hint.gotIt')}
                    >
                      ✕
                    </button>
                    <div className="mode-hint-title">{t('hint.modeTitle')}</div>
                    <p className="mode-hint-line">{boldMd(t('hint.modeKeep'))}</p>
                    <p className="mode-hint-line">{boldMd(t('hint.modeRich'))}</p>
                    <div className="mode-hint-actions">
                      <button className="mode-hint-ok" onClick={onDismissModeHint}>
                        {t('hint.gotIt')}
                      </button>
                    </div>
                    <span className="mode-hint-arrow" />
                  </div>
                )}
              </span>
            )}
            <button className="status-btn" onClick={onToggleSource} title={t('tip.toggleSource')}>
              <Icon name="code" size={14} /> {sourceMode ? t('status.source') : t('status.rich')}
            </button>
            {onOpenSettings && (
              <button className="status-btn" onClick={onOpenSettings} title={t('settings.title')}>
                <Icon name="settings" size={14} />
              </button>
            )}
            <AboutControl />
          </>
        )}
      </div>
    </div>
  )
}

// Memoized: App re-renders on every keystroke; with the callbacks above kept
// stable by App, this skips when only unrelated state changed. While typing the
// `tab` prop does change — the deferred stats above keep that render cheap.
export default memo(StatusBar)
