import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './icons.jsx'
import logoUrl from '../assets/logo.png'
import { useI18n } from '../i18n.jsx'
import { THEMES } from '../themes.js'
import { LANGS } from '../i18n.jsx'
import { FONT_SIZE_MIN, FONT_SIZE_MAX, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from '../settings.js'
import { TypographyGroups } from './TypographyControls.jsx'

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

// One compact status-bar entry for the layout preferences people tune while
// reading and writing. Font-family choices intentionally remain in Settings.
function LayoutControl({ blankLineSpacing, onSetBlankLineSpacing, ...typographyProps }) {
  const { t } = useI18n()
  const { open, setOpen, ref } = usePopover()
  return (
    <div className="block-switch hm-layout" ref={ref}>
      <button
        type="button"
        className={`status-btn${open ? ' active' : ''}`}
        onClick={() => setOpen((value) => !value)}
        title={t('settings.sectionTypography')}
        aria-label={t('settings.sectionTypography')}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Icon name="sliders" size={14} />
      </button>
      {open && (
        <div className="hm-pop hm-layout-pop" role="dialog" aria-label={t('settings.sectionTypography')}>
          <TypographyGroups {...typographyProps} />
          <div className="hm-pop-sep" />
          <div className="hm-layout-option">
            <div className="hm-layout-option-text">
              <span className="hm-pop-title">{t('settings.blankLineSpacing')}</span>
              <span className="hm-layout-option-desc">{t('settings.blankLineSpacingDesc')}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={blankLineSpacing}
              aria-label={t('settings.blankLineSpacing')}
              className={`hm-switch${blankLineSpacing ? ' on' : ''}`}
              onClick={() => onSetBlankLineSpacing(!blankLineSpacing)}
            >
              <span className="hm-switch-knob" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
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

// Help is the discoverable home for learning and support. Product attribution
// remains available at the bottom instead of occupying a separate status item.
function HelpControl({ onOpenHelp }) {
  const { t } = useI18n()
  const { open, setOpen, ref } = usePopover()
  const openTopic = (topic) => {
    setOpen(false)
    onOpenHelp?.(topic)
  }
  return (
    <div className="block-switch hm-help-control" ref={ref}>
      <button
        type="button"
        className={`status-btn${open ? ' active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={`${t('help.title')} (F1)`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Icon name="help" size={14} />
      </button>
      {open && (
        <div className="hm-pop hm-help-pop" role="dialog" aria-label={t('help.title')}>
          <div className="hm-help-pop-title">{t('help.title')}</div>
          <button type="button" className="hm-help-pop-item primary" onClick={() => openTopic('start')}>
            <Icon name="sparkle" size={15} />
            <span><strong>{t('help.quickStart')}</strong><small>{t('help.guide')}</small></span>
            <kbd>F1</kbd>
          </button>
          <button type="button" className="hm-help-pop-item" onClick={() => openTopic('shortcuts')}>
            <Icon name="command" size={15} />
            <span>{t('help.shortcuts')}</span>
          </button>
          <button type="button" className="hm-help-pop-item" onClick={() => openTopic('whats-new')}>
            <Icon name="sparkle" size={15} />
            <span>{t('help.whatsNew')}</span>
          </button>
          <button
            type="button"
            className="hm-help-pop-item"
            onClick={() => {
              setOpen(false)
              window.api.openExternal?.('https://github.com/cycyeasy1-svg/EasyMarkdown/issues')
            }}
          >
            <Icon name="github" size={15} />
            <span>{t('help.reportIssue')}</span>
          </button>
          <div className="hm-pop-sep" />
          <details className="hm-help-about">
            <summary>{t('about.title')}</summary>
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
          </details>
        </div>
      )}
    </div>
  )
}

function EditorEngineControl({
  keepMode,
  onToggleKeep,
  showModeHint,
  onDismissModeHint
}) {
  const { t } = useI18n()
  const mode = keepMode ? 'keep' : 'milkdown'
  return (
    <span className="mode-switch-wrap">
      <button
        type="button"
        className={`status-btn active hm-engine-mode is-${mode}`}
        onClick={onToggleKeep}
        title={t('tip.toggleKeep')}
      >
        <Icon name={keepMode ? 'shield' : 'sparkle'} size={14} />
        {t(keepMode ? 'mode.keep' : 'mode.rich')}
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
  )
}

function ViewModeControl({ mode, keepMode, onSelect }) {
  const { t } = useI18n()
  const modes = [
    ['rich', 'sparkle', 'status.rich'],
    ['source', 'code', 'status.source'],
    ...(keepMode ? [['richSource', 'columns', 'mode.richSource']] : [])
  ]
  const currentIndex = Math.max(0, modes.findIndex(([id]) => id === mode))
  const [currentMode, currentIcon, currentLabel] = modes[currentIndex]
  const nextMode = modes[(currentIndex + 1) % modes.length][0]
  return (
    <span className="hm-view-mode-control">
      <button
        type="button"
        className="status-btn hm-view-mode-btn"
        data-mode={currentMode}
        title={t(keepMode ? 'tip.cycleViewModeKeep' : 'tip.cycleViewModeRich')}
        onClick={() => onSelect?.(nextMode)}
      >
        <Icon name={currentIcon} size={14} />
        <span>{t(currentLabel)}</span>
      </button>
    </span>
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
  onReviewKeep,
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
  onOpenHelp,
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
  const reviewTitle = historyBlocked ? t('keep.finishDraft') : t('keep.reviewChanges')
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
                title={reviewTitle}
                disabled={historyBlocked || !dirty}
                onClick={() => {
                  onReviewKeep?.()
                  setOpen(false)
                }}
              >
                <Icon name="outline" size={15} />
                <span className="block-menu-name">{t('keep.reviewChanges')}</span>
              </button>
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
          <div className="theme-menu-label">{t('help.title')}</div>
          <button
            className="block-menu-item"
            onClick={() => {
              setOpen(false)
              onOpenHelp?.('start')
            }}
          >
            <Icon name="help" size={15} />
            <span className="block-menu-name">{t('help.guide')}</span>
          </button>
          <button
            className="block-menu-item"
            onClick={() => {
              setOpen(false)
              onOpenHelp?.('shortcuts')
            }}
          >
            <Icon name="command" size={15} />
            <span className="block-menu-name">{t('help.shortcuts')}</span>
          </button>

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
  onReviewKeep,
  onShare,
  theme,
  setTheme,
  lang,
  setLang,
  sourceMode,
  onToggleSource,
  viewMode = 'rich',
  onSelectViewMode,
  keepEligible,
  keepMode,
  onToggleKeep,
  showModeHint,
  onDismissModeHint,
  pageWidth,
  onSetPageWidth,
  fontSize,
  onSetFontSize,
  zoom,
  onSetZoom,
  lineHeight,
  onSetLineHeight,
  paragraphSpacing,
  onSetParagraphSpacing,
  blankLineSpacing,
  onSetBlankLineSpacing,
  customThemes,
  customTheme,
  onPickCustom,
  onRefreshThemes,
  filterInfo,
  onClearFilters,
  onOpenSettings,
  onOpenHelp
}) {
  const { t } = useI18n()
  // Word/char/reading-time stats run 3 whole-document regex passes; computing
  // them from a deferred value keeps that work out of the urgent per-keystroke
  // render. The dirty dot stays on the live content so it flips instantly.
  const deferredContent = useDeferredValue(tab?.content)
  const s = useMemo(() => stats(deferredContent), [deferredContent])
  const dirty = !!tab && (tab.content !== tab.savedContent || hasDraft)
  const showKeepHistory = !!tab && keepEligible && keepMode && viewMode === 'rich'
  const historyBlocked = !!hasDraft
  const undoTitle = historyBlocked ? t('keep.finishDraft') : t('keep.undoTitle')
  const redoTitle = historyBlocked ? t('keep.finishDraft') : t('keep.redoTitle')
  const reviewTitle = historyBlocked ? t('keep.finishDraft') : t('keep.reviewChanges')
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
                      className="status-history-btn review"
                      title={reviewTitle}
                      aria-label={reviewTitle}
                      disabled={historyBlocked || tab.content === tab.savedContent}
                      onClick={onReviewKeep}
                    >
                      <Icon name="outline" size={14} />
                    </button>
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
                onReviewKeep={onReviewKeep}
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
                onOpenHelp={onOpenHelp}
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
              <>
                <EditorEngineControl
                  keepMode={keepMode}
                  onToggleKeep={onToggleKeep}
                  showModeHint={showModeHint}
                  onDismissModeHint={onDismissModeHint}
                />
                <ViewModeControl
                  mode={viewMode}
                  keepMode={keepMode}
                  onSelect={onSelectViewMode}
                />
              </>
            )}
            <LayoutControl
              fontSize={fontSize}
              onSetFontSize={onSetFontSize}
              pageWidth={pageWidth}
              onSetPageWidth={onSetPageWidth}
              zoom={zoom}
              onSetZoom={onSetZoom}
              lineHeight={lineHeight}
              onSetLineHeight={onSetLineHeight}
              paragraphSpacing={paragraphSpacing}
              onSetParagraphSpacing={onSetParagraphSpacing}
              blankLineSpacing={blankLineSpacing}
              onSetBlankLineSpacing={onSetBlankLineSpacing}
            />
            {onOpenSettings && (
              <button className="status-btn" onClick={onOpenSettings} title={t('settings.title')}>
                <Icon name="settings" size={14} />
              </button>
            )}
            <HelpControl onOpenHelp={onOpenHelp} />
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
