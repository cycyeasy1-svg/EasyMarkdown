// The "排版" status-bar button: a popover holding the editor layout adjusters
// — font size, line height, paragraph spacing, and page width. Extracted from
// StatusBar so the bar component stays small; StatusBar just renders this.
//
// Each adjuster is the same shape (segmented presets + a fine-tune slider), so
// AdjustGroup is generic over a numeric value and its presets.
import { useRef, useState } from 'react'
import { Icon } from './icons.jsx'
import { useI18n } from '../i18n.jsx'
import {
  PAGE_WIDTH_PRESETS,
  PAGE_WIDTH_MIN,
  PAGE_WIDTH_MAX,
  FONT_SIZE_PRESETS,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  LINE_HEIGHT_PRESETS,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_MAX,
  PARA_SPACING_PRESETS,
  PARA_SPACING_MIN,
  PARA_SPACING_MAX
} from '../settings.js'

// A small hook kept local (StatusBar has its own copy; this module is standalone).
function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  return { open, setOpen, ref }
}

// Map a pointer X over `track` to a value in [min, max], clamped, 1-decimal.
const fromX = (track, clientX, min, max, round = (n) => n) => {
  const r = track.getBoundingClientRect()
  const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
  return round(min + p * (max - min))
}

function AdjustGroup({ title, valueLabel, presets, activeIndex, onPick, pct, fromXFrac, onSet }) {
  const { t } = useI18n()
  const trackRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const startDrag = (e) => {
    e.preventDefault()
    setDragging(true)
    onSet(fromXFrac(trackRef.current, e.clientX))
    const onMove = (ev) => onSet(fromXFrac(trackRef.current, ev.clientX))
    const onUp = () => {
      setDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  return (
    <div className="hm-adjust-group">
      <div className="hm-pop-head">
        <span className="hm-pop-title">{title}</span>
        <span className="hm-pop-value">{valueLabel}</span>
      </div>
      <div className="hm-seg" style={{ '--seg-count': presets.length, '--seg-index': activeIndex }}>
        {activeIndex >= 0 && <span className="hm-seg-pill" aria-hidden="true" />}
        {presets.map((p, i) => (
          <button
            key={p.id}
            className={`hm-seg-item${i === activeIndex ? ' active' : ''}`}
            onClick={() => onPick(p)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className={`hm-fine${dragging ? ' dragging' : ''}`}>
        <span className="hm-fine-label">{t('settings.fineTune')}</span>
        <div className="hm-ftrack" ref={trackRef} onPointerDown={startDrag}>
          <div className="hm-ffill" style={{ width: pct * 100 + '%' }} />
          <div className="hm-fthumb" style={{ left: pct * 100 + '%' }} />
        </div>
      </div>
    </div>
  )
}

export default function LayoutControl({
  fontSize,
  onSetFontSize,
  lineHeight,
  onSetLineHeight,
  paragraphSpacing,
  onSetParagraphSpacing,
  pageWidth,
  onSetPageWidth
}) {
  const { t } = useI18n()
  const { open, setOpen, ref } = usePopover()

  const round1 = (n) => Math.round(n * 10) / 10
  const fontPct = (fontSize - FONT_SIZE_MIN) / (FONT_SIZE_MAX - FONT_SIZE_MIN)
  const fontIdx = FONT_SIZE_PRESETS.findIndex((p) => p.size === fontSize)
  const lhPct = (lineHeight - LINE_HEIGHT_MIN) / (LINE_HEIGHT_MAX - LINE_HEIGHT_MIN)
  const lhIdx = LINE_HEIGHT_PRESETS.findIndex((p) => p.value === lineHeight)
  const psPct = (paragraphSpacing - PARA_SPACING_MIN) / (PARA_SPACING_MAX - PARA_SPACING_MIN)
  const psIdx = PARA_SPACING_PRESETS.findIndex((p) => p.value === paragraphSpacing)

  const isFull = pageWidth === 'full'
  const widthPct = isFull ? 1 : (pageWidth - PAGE_WIDTH_MIN) / (PAGE_WIDTH_MAX - PAGE_WIDTH_MIN)
  const widthIdx = PAGE_WIDTH_PRESETS.findIndex((p) =>
    p.width === 'full' ? isFull : !isFull && pageWidth === p.width
  )

  return (
    // hm-pagewidth lets mobile hide this via CSS (mobile forces full width and
    // sets font size in the "more" sheet).
    <div className="block-switch hm-pagewidth hm-layout" ref={ref}>
      <button className="status-btn" onClick={() => setOpen((v) => !v)} title={t('settings.layout')}>
        <Icon name="settings" size={14} /> {t('settings.layoutLabel')}
      </button>
      {open && (
        <div className="hm-pop hm-width-pop hm-layout-pop">
          <AdjustGroup
            title={t('settings.fontSize')}
            valueLabel={fontSize + ' px'}
            presets={FONT_SIZE_PRESETS.map((p) => ({ ...p, label: t('settings.font.' + p.id) }))}
            activeIndex={fontIdx}
            onPick={(p) => onSetFontSize(p.size)}
            pct={fontPct}
            fromXFrac={(track, x) => fromX(track, x, FONT_SIZE_MIN, FONT_SIZE_MAX, Math.round)}
            onSet={onSetFontSize}
          />
          <div className="hm-pop-sep" />
          <AdjustGroup
            title={t('settings.lineHeight')}
            valueLabel={round1(lineHeight).toFixed(1)}
            presets={LINE_HEIGHT_PRESETS.map((p) => ({ ...p, label: t('settings.lineHeightPreset.' + p.id) }))}
            activeIndex={lhIdx}
            onPick={(p) => onSetLineHeight(p.value)}
            pct={lhPct}
            fromXFrac={(track, x) => fromX(track, x, LINE_HEIGHT_MIN, LINE_HEIGHT_MAX, round1)}
            onSet={onSetLineHeight}
          />
          <div className="hm-pop-sep" />
          <AdjustGroup
            title={t('settings.paragraphSpacing')}
            valueLabel={round1(paragraphSpacing).toFixed(1) + ' em'}
            presets={PARA_SPACING_PRESETS.map((p) => ({ ...p, label: t('settings.paraSpacingPreset.' + p.id) }))}
            activeIndex={psIdx}
            onPick={(p) => onSetParagraphSpacing(p.value)}
            pct={psPct}
            fromXFrac={(track, x) => fromX(track, x, PARA_SPACING_MIN, PARA_SPACING_MAX, round1)}
            onSet={onSetParagraphSpacing}
          />
          <div className="hm-pop-sep" />
          <AdjustGroup
            title={t('settings.pageWidth')}
            valueLabel={isFull ? t('settings.width.full') : pageWidth + ' px'}
            presets={PAGE_WIDTH_PRESETS.map((p) => ({ ...p, label: t('settings.width.' + p.id) }))}
            activeIndex={widthIdx}
            onPick={(p) => onSetPageWidth(p.width)}
            pct={widthPct}
            fromXFrac={(track, x) => fromX(track, x, PAGE_WIDTH_MIN, PAGE_WIDTH_MAX, (n) => Math.round(n / 10) * 10)}
            onSet={onSetPageWidth}
          />
        </div>
      )}
    </div>
  )
}
