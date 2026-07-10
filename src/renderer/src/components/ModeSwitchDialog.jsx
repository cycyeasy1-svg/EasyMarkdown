import { useEffect, useRef } from 'react'
import { Icon } from './icons.jsx'

// Project-styled confirmation for Keep ⇄ Milkdown transitions. Native
// window.confirm dialogs cannot match the app theme or expose three explicit
// choices (save, continue without saving, cancel).
export default function ModeSwitchDialog({
  t,
  direction,
  busy = false,
  onSaveAndSwitch,
  onSwitch,
  onCancel
}) {
  const toMilkdown = direction === 'toMilkdown'
  const primaryRef = useRef(null)

  useEffect(() => {
    primaryRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault()
        e.stopPropagation()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [busy, onCancel])

  return (
    <div
      className="hm-confirm-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}
    >
      <div
        className="hm-mode-switch"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="hm-mode-switch-title"
        aria-describedby="hm-mode-switch-message"
      >
        <div className="hm-mode-switch-head">
          <span className="hm-mode-switch-icon" aria-hidden="true">
            <Icon name="alert" size={20} />
          </span>
          <div>
            <div id="hm-mode-switch-title" className="hm-mode-switch-title">
              {t(toMilkdown ? 'modeSwitch.toMilkdownTitle' : 'modeSwitch.toKeepTitle')}
            </div>
            <div id="hm-mode-switch-message" className="hm-mode-switch-message">
              {t(toMilkdown ? 'modeSwitch.toMilkdownMessage' : 'modeSwitch.toKeepMessage')}
            </div>
          </div>
        </div>
        <div className="hm-mode-switch-actions">
          <button type="button" disabled={busy} onClick={onCancel}>
            {t('edit.cancel')}
          </button>
          {toMilkdown && (
            <button type="button" disabled={busy} onClick={onSwitch}>
              {t('modeSwitch.withoutSave')}
            </button>
          )}
          <button
            ref={primaryRef}
            type="button"
            className="primary"
            disabled={busy}
            onClick={toMilkdown ? onSaveAndSwitch : onSwitch}
          >
            {busy
              ? t('modeSwitch.saving')
              : t(toMilkdown ? 'modeSwitch.saveAndSwitch' : 'modeSwitch.switchAnyway')}
          </button>
        </div>
      </div>
    </div>
  )
}
