import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const clampScale = (value) => Math.min(8, Math.max(0.2, value))

export default function ZoomLightbox({ item, onClose, t }) {
  const contentRef = useRef(null)
  const closeRef = useRef(null)
  const dragRef = useRef(null)
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })

  useEffect(() => {
    if (!item) return
    setView({ scale: 1, x: 0, y: 0 })
    if (item.content && contentRef.current) {
      contentRef.current.replaceChildren(item.content.cloneNode(true))
    }
    const previousFocus = document.activeElement
    requestAnimationFrame(() => closeRef.current?.focus())
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const restore = item.trigger?.isConnected ? item.trigger : previousFocus
      restore?.focus?.()
    }
  }, [item, onClose])

  if (!item) return null

  const zoomAt = (nextScale, cx = 0, cy = 0) => {
    setView((current) => {
      const scale = clampScale(nextScale)
      const ratio = scale / current.scale
      return {
        scale,
        x: cx - (cx - current.x) * ratio,
        y: cy - (cy - current.y) * ratio
      }
    })
  }

  const onWheel = (event) => {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const cx = event.clientX - rect.left - rect.width / 2
    const cy = event.clientY - rect.top - rect.height / 2
    zoomAt(view.scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12), cx, cy)
  }

  const onPointerDown = (event) => {
    if (event.target.closest?.('.hm-zoom-bar')) return
    if (event.target === event.currentTarget) {
      onClose()
      return
    }
    dragRef.current = { pointerId: event.pointerId, x: event.clientX - view.x, y: event.clientY - view.y }
    event.currentTarget.classList.add('is-grabbing')
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const onPointerMove = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setView((current) => ({ ...current, x: event.clientX - drag.x, y: event.clientY - drag.y }))
  }
  const endDrag = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    event.currentTarget.classList.remove('is-grabbing')
  }

  const label = item.kind === 'math'
    ? t('lightbox.mathDialog')
    : item.kind === 'mermaid'
      ? t('lightbox.diagramDialog')
      : t('lightbox.imageDialog')

  return createPortal(
    <div
      className={`hm-zoom-overlay hm-zoom-${item.kind}`}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="hm-zoom-stage"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        {item.kind === 'image'
          ? <img src={item.src} alt="" draggable="false" />
          : <div className="hm-zoom-content" ref={contentRef} />}
      </div>
      <div className="hm-zoom-bar" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" onClick={() => zoomAt(view.scale / 1.25)} title={t('lightbox.zoomOut')} aria-label={t('lightbox.zoomOut')}>−</button>
        <span aria-live="polite">{Math.round(view.scale * 100)}%</span>
        <button type="button" onClick={() => zoomAt(view.scale * 1.25)} title={t('lightbox.zoomIn')} aria-label={t('lightbox.zoomIn')}>+</button>
        <button type="button" onClick={() => setView({ scale: 1, x: 0, y: 0 })} title={t('lightbox.reset')} aria-label={t('lightbox.reset')}>1:1</button>
        <button ref={closeRef} type="button" onClick={onClose} title={t('lightbox.close')} aria-label={t('lightbox.close')}>×</button>
      </div>
    </div>,
    document.body
  )
}
