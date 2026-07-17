import { memo, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './icons.jsx'
import { useI18n } from '../i18n.jsx'
import { isMarkdownName } from '../paths.js'
import { copyToClipboard } from '../ui.js'

// `tabs` here is App's stable tabsMeta projection ({id, title, path, dirty}),
// NOT the full tab objects — its identity only changes when one of those
// fields does, which is what makes the memo() below effective while typing.
function Tabs({
  tabs,
  activeId,
  splitId,
  focusedPane,
  onActivate,
  onClose,
  onNew,
  onCloseOthers,
  onCloseLeft,
  onCloseRight,
  onOpenRight,
  onRename,
  onDuplicate,
  onDelete,
  onExportPdf,
  onReorder,
  onTogglePin,
  onPromotePreview
}) {
  const { t } = useI18n()
  const activeRef = useRef(null)
  const stripRef = useRef(null)
  const scrollRef = useRef(null)
  const [overflowing, setOverflowing] = useState(false)
  // Right-click context menu: { x, y, tab } in viewport coords, or null.
  const [menu, setMenu] = useState(null)
  // Drag-reorder state: the tab id being dragged and the id currently hovered
  // as a drop target (for the insertion indicator).
  const dragIdRef = useRef(null)
  const [dragOverId, setDragOverId] = useState(null)
  // On touch there's no hover to reveal the close ✕, so show it always and use a
  // clear ✕ (the unsaved state is shown in the bottom bar, not as a tab dot).
  const isMobile = window.api.platform === 'ios' || window.api.platform === 'android'
  const focusedId = focusedPane === 'right' && splitId != null ? splitId : activeId
  const focusedIndex = tabs.findIndex((tab) => tab.id === focusedId)
  const canMovePrevious = focusedIndex > 0
  const canMoveNext = focusedIndex !== -1 && focusedIndex < tabs.length - 1

  // Firefox-style overflow affordances: the arrow buttons do not consume any
  // space while every tab fits. Compare the tab content width with the whole
  // strip width (not the narrower scroll viewport while arrows are visible), so
  // the buttons disappear again as soon as the tabs genuinely fit.
  useEffect(() => {
    const strip = stripRef.current
    const scroll = scrollRef.current
    if (!strip || !scroll || isMobile) {
      setOverflowing(false)
      return
    }
    let raf = 0
    const measure = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        setOverflowing(scroll.scrollWidth > strip.clientWidth + 1)
      })
    }
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(strip)
    resize.observe(scroll)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      resize.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [tabs, isMobile])

  // When the focused tab changes (opened a new file, switched, restored, or the
  // focused split pane moved), the tab strip may have scrolled it out of view.
  // Pull it back into the visible range so the user
  // never has to hunt/scroll for the file they just opened. `inline: 'nearest'`
  // only scrolls when it's actually off-screen and never jumps vertically.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [focusedId, tabs.length])

  // Close the menu on Escape (clicks outside are handled by the backdrop).
  useEffect(() => {
    if (!menu) return
    const onKey = (e) => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu])

  const copyPath = (tab) => {
    if (tab.path) copyToClipboard(tab.path, t('code.copied'))
  }
  const copyName = (tab) => copyToClipboard(tab.title || '', t('code.copied'))
  const reveal = (tab) => {
    if (tab.path) window.api.showInFolder(tab.path)
  }
  const moveTabFocus = (delta) => {
    const target = tabs[focusedIndex + delta]
    if (target) onActivate(target.id)
  }

  return (
    <div className="tabs" ref={stripRef}>
      {overflowing && (
        <button
          className="tab-nav tab-nav-prev"
          title={t('tab.previous')}
          aria-label={t('tab.previous')}
          disabled={!canMovePrevious}
          onClick={() => moveTabFocus(-1)}
        >
          <Icon name="chevron-right" size={15} style={{ transform: 'rotate(180deg)' }} />
        </button>
      )}
      <div className="tabs-scroll" ref={scrollRef}>
        {tabs.map((tab) => {
          const dirty = tab.dirty
          const isLeft = tab.id === activeId
          const isRight = splitId != null && tab.id === splitId
          // Both panes' tabs are highlighted in split view; the focused pane's tab
          // gets the stronger style (that's where a tab click lands).
          const isActive = isLeft || isRight
          const focused = isRight ? focusedPane === 'right' : isLeft ? focusedPane !== 'right' : false
          return (
            <div
              key={tab.id}
              ref={tab.id === focusedId ? activeRef : null}
              className={
                `tab${isActive ? ' active' : ''}${isActive && !focused ? ' split-peer' : ''}` +
                `${tab.pinned ? ' pinned' : ''}${tab.preview ? ' preview' : ''}` +
                `${dragOverId === tab.id ? ' drag-over' : ''}`
              }
              draggable={!isMobile && !!onReorder}
              onDragStart={(e) => {
                dragIdRef.current = tab.id
                e.dataTransfer.effectAllowed = 'move'
                // Firefox needs data for the drag to start; harmless elsewhere.
                e.dataTransfer.setData('text/plain', tab.title || '')
              }}
              onDragEnd={() => {
                dragIdRef.current = null
                setDragOverId(null)
              }}
              onDragOver={(e) => {
                if (!dragIdRef.current || dragIdRef.current === tab.id) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDragOverId(tab.id)
              }}
              onDragLeave={() => {
                setDragOverId((cur) => (cur === tab.id ? null : cur))
              }}
              onDrop={(e) => {
                e.preventDefault()
                const from = dragIdRef.current
                dragIdRef.current = null
                setDragOverId(null)
                if (from && from !== tab.id) onReorder?.(from, tab.id)
              }}
              onClick={() => onActivate(tab.id)}
              onDoubleClick={() => onPromotePreview?.(tab.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ x: e.clientX, y: e.clientY, tab })
              }}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  onClose(tab.id)
                }
              }}
              title={
                tab.preview
                  ? `${tab.path || tab.title}\n${t('tab.previewHint')}`
                  : tab.path || tab.title
              }
              aria-label={tab.preview ? `${tab.title}, ${t('tab.preview')}` : tab.title}
            >
              {tab.pinned && <Icon name="pin" size={11} className="tab-pin" />}
              <span className="tab-title">{tab.title}</span>
              <span
                className={`tab-close${dirty ? ' dirty' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(tab.id)
                }}
              >
                {dirty && !isMobile ? <span className="dot" /> : <Icon name="close" size={13} />}
              </span>
            </div>
          )
        })}
      </div>
      {overflowing && (
        <button
          className="tab-nav tab-nav-next"
          title={t('tab.next')}
          aria-label={t('tab.next')}
          disabled={!canMoveNext}
          onClick={() => moveTabFocus(1)}
        >
          <Icon name="chevron-right" size={15} />
        </button>
      )}
      <button className="tab-new" title={t('tab.new')} onClick={onNew}>
        <Icon name="plus" size={16} />
      </button>

      {menu && createPortal(
        <>
          <div
            className="menu-backdrop"
            onMouseDown={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu(null)
            }}
          />
          <div
            className="tab-ctxmenu"
            style={{
              left: Math.min(menu.x, window.innerWidth - 220),
              top: Math.min(menu.y, window.innerHeight - 400)
            }}
          >
            {(() => {
              const tab = menu.tab
              const hasPath = !!tab.path
              const noPathTip = !hasPath ? t('tab.noPath') : undefined
              const menuIdx = tabs.findIndex((x) => x.id === tab.id)
              const hasLeft = menuIdx > 0
              const hasRight = menuIdx !== -1 && menuIdx < tabs.length - 1
              const run = (fn) => () => { fn(); setMenu(null) }
              return (
                <>
                  {tab.preview && onPromotePreview && (
                    <>
                      <button className="tab-menu-item" onClick={run(() => onPromotePreview(tab.id))}>
                        {t('tab.keepOpen')}
                      </button>
                      <div className="tab-menu-sep" />
                    </>
                  )}
                  {onTogglePin && (
                    <>
                      <button className="tab-menu-item" onClick={run(() => onTogglePin(tab.id))}>
                        {t(tab.pinned ? 'tab.unpin' : 'tab.pin')}
                      </button>
                      <div className="tab-menu-sep" />
                    </>
                  )}
                  {window.api.capabilities?.splitView !== false && onOpenRight && tabs.length > 1 && (
                    <>
                      <button className="tab-menu-item" onClick={run(() => onOpenRight(tab.id))}>
                        {t('tab.openRight')}
                      </button>
                      <div className="tab-menu-sep" />
                    </>
                  )}
                  <button className="tab-menu-item" disabled={!hasPath} title={noPathTip} onClick={run(() => copyPath(tab))}>
                    {t('tab.copyPath')}
                  </button>
                  <button className="tab-menu-item" onClick={run(() => copyName(tab))}>
                    {t('tab.copyName')}
                  </button>
                  {window.api.capabilities?.revealInFolder !== false && (
                    <button className="tab-menu-item" disabled={!hasPath} title={noPathTip} onClick={run(() => reveal(tab))}>
                      {t('tab.reveal')}
                    </button>
                  )}
                  <div className="tab-menu-sep" />
                  <button className="tab-menu-item" disabled={!hasPath} title={noPathTip} onClick={run(() => onRename?.(tab.id))}>
                    {t('side.rename')}
                  </button>
                  <button className="tab-menu-item" disabled={!hasPath} title={noPathTip} onClick={run(() => onDuplicate?.(tab.id))}>
                    {t('side.duplicate')}
                  </button>
                  {window.api.capabilities?.pdfExport !== false && hasPath && isMarkdownName(tab.title) && (
                    <button className="tab-menu-item" onClick={run(() => onExportPdf?.(tab.path))}>
                      {t('side.exportPdf')}
                    </button>
                  )}
                  <div className="tab-menu-sep" />
                  <button className="tab-menu-item" onClick={run(() => onClose(tab.id))}>
                    {t('tab.close')}
                  </button>
                  {onCloseOthers && tabs.length > 1 && (
                    <button className="tab-menu-item" onClick={run(() => onCloseOthers(tab.id))}>
                      {t('tab.closeOthers')}
                    </button>
                  )}
                  {onCloseLeft && hasLeft && (
                    <button className="tab-menu-item" onClick={run(() => onCloseLeft(tab.id))}>
                      {t('tab.closeLeft')}
                    </button>
                  )}
                  {onCloseRight && hasRight && (
                    <button className="tab-menu-item" onClick={run(() => onCloseRight(tab.id))}>
                      {t('tab.closeRight')}
                    </button>
                  )}
                  {onDelete && (
                    <button className="tab-menu-item danger" disabled={!hasPath} title={noPathTip} onClick={run(() => onDelete(tab.id))}>
                      {t('side.delete')}
                    </button>
                  )}
                </>
              )
            })()}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

export default memo(Tabs)
