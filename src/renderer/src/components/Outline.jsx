import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n.jsx'
import { Icon } from './icons.jsx'
import { parseHeadingDetails, parseHeadings } from '../outline-model.js'
import { haveSameHeadingParent } from '../outline-reorder.js'

export { parseHeadingDetails, parseHeadings }

export default function Outline({ content, activeIndex = -1, onJump, onMoveHeading }) {
  const { t } = useI18n()
  // Re-parsing the whole document on every keystroke is wasted work — the outline
  // can lag a beat behind the cursor. Deferring the content keeps typing smooth on
  // large docs (React renders the heavy parse at low priority).
  const deferredContent = useDeferredValue(content)
  const headings = useMemo(() => parseHeadingDetails(deferredContent), [deferredContent])

  // Section fold state. A heading is collapsible when a deeper heading follows
  // it; collapsing hides every descendant (deeper heading) until a sibling/uncle
  // at the same-or-shallower level. Default is fully expanded (empty set), so the
  // outline reads like a flat list until the user folds something.
  const [collapsed, setCollapsed] = useState(() => new Set())
  const draggingIndexRef = useRef(-1)
  const [draggingIndex, setDraggingIndex] = useState(-1)
  const [dropTarget, setDropTarget] = useState(null)
  const toggle = (i) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  // One pass over the flat list derives, per heading: whether it has children,
  // whether it's currently visible, and (when hidden) which collapsed ancestor
  // hides it — so the scrollspy can fall back to that ancestor when the active
  // heading is folded away.
  const view = useMemo(() => {
    const hasChildren = headings.map(
      (h, i) => i + 1 < headings.length && headings[i + 1].level > h.level
    )
    const visible = new Array(headings.length).fill(true)
    const hiddenBy = new Array(headings.length).fill(-1)
    let hideBelow = Infinity // hide headings deeper than this level
    let hideOwner = -1
    headings.forEach((h, i) => {
      if (h.level > hideBelow) {
        visible[i] = false
        hiddenBy[i] = hideOwner
        return
      }
      // exited any collapsed region at this level or shallower
      hideBelow = Infinity
      hideOwner = -1
      if (hasChildren[i] && collapsed.has(i)) {
        hideBelow = h.level
        hideOwner = i
      }
    })
    return { hasChildren, visible, hiddenBy }
  }, [headings, collapsed])

  // When the viewed heading is folded away, highlight the collapsed ancestor that
  // hides it instead, so the outline still shows roughly where you are.
  const effectiveActive =
    activeIndex >= 0 && !view.visible[activeIndex] ? view.hiddenBy[activeIndex] : activeIndex
  const containedActive = effectiveActive >= 0 && effectiveActive !== activeIndex

  const foldable = headings.map((_, index) => index).filter((index) => view.hasChildren[index])
  const allCollapsed = foldable.length > 0 && foldable.every((index) => collapsed.has(index))
  const toggleAll = () => setCollapsed(allCollapsed ? new Set() : new Set(foldable))
  const clearDrag = () => {
    draggingIndexRef.current = -1
    setDraggingIndex(-1)
    setDropTarget(null)
  }
  const placementFor = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  }

  // Keep the active row scrolled into view (like the file tree reveals the open
  // file). Guarded so we only scroll on a real change.
  const activeRef = useRef(null)
  const lastScrolledRef = useRef(-1)
  useEffect(() => {
    if (effectiveActive >= 0 && activeRef.current && lastScrolledRef.current !== effectiveActive) {
      activeRef.current.scrollIntoView({ block: 'nearest' })
      lastScrolledRef.current = effectiveActive
    }
  }, [effectiveActive, headings.length])

  return (
    <div className="outline">
      <div className="panel-head">
        <span>{t('outline.title')}</span>
        {foldable.length > 0 && (
          <button
            type="button"
            className="outline-head-btn"
            title={t(allCollapsed ? 'outline.expandAll' : 'outline.collapseAll')}
            onClick={toggleAll}
          >
            <Icon name={allCollapsed ? 'expand' : 'collapse'} size={14} />
          </button>
        )}
      </div>
      <div className="outline-list">
        {headings.length === 0 ? (
          <div className="outline-empty">{t('outline.empty')}</div>
        ) : (
          headings.map((h, i) => {
            if (!view.visible[i]) return null
            const canMove =
              draggingIndexRef.current >= 0 &&
              draggingIndexRef.current !== i &&
              haveSameHeadingParent(headings, draggingIndexRef.current, i)
            const dropClass =
              dropTarget?.index === i ? ` drag-over-${dropTarget.placement}` : ''
            return (
              <div
                key={`${h.charOffset}:${h.level}`}
                ref={i === effectiveActive ? activeRef : undefined}
                className={
                  `outline-item lvl-${h.level}` +
                  `${i === effectiveActive ? ' active' : ''}` +
                  `${containedActive && i === effectiveActive ? ' contained-active' : ''}` +
                  `${draggingIndex === i ? ' dragging' : ''}${dropClass}`
                }
                style={{ paddingLeft: 8 + (h.level - 1) * 12 }}
                onClick={() => onJump(i, h)}
                onDragOver={(event) => {
                  if (!canMove) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  setDropTarget({ index: i, placement: placementFor(event) })
                }}
                onDrop={(event) => {
                  if (!canMove) return
                  event.preventDefault()
                  const moved = onMoveHeading?.(
                    draggingIndexRef.current,
                    i,
                    placementFor(event)
                  )
                  if (moved !== false) setCollapsed(new Set())
                  clearDrag()
                }}
                title={h.text}
              >
                {onMoveHeading && (
                  <span
                    className="outline-drag-handle"
                    draggable
                    title={t('outline.dragReorder')}
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onDragStart={(event) => {
                      draggingIndexRef.current = i
                      setDraggingIndex(i)
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', String(i))
                    }}
                    onDragEnd={clearDrag}
                  >
                    <Icon name="grip-vertical" size={13} />
                  </span>
                )}
                {view.hasChildren[i] ? (
                  <span
                    className={`outline-chevron${collapsed.has(i) ? '' : ' chevron-expanded'}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggle(i)
                    }}
                    title={t(collapsed.has(i) ? 'outline.expand' : 'outline.collapse')}
                  >
                    <Icon name="chevron-right" size={13} />
                  </span>
                ) : (
                  <span className="outline-chevron outline-chevron-spacer" />
                )}
                <span className="outline-label">{h.text}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
