// Tiny shared UI helpers used across components.

// Transient toast channel. App listens for this event and shows a bottom-center
// toast; anyone can fire it. Keeping the channel name in one place avoids a typo
// silently breaking toasts (no compile error on a mismatched string literal).
export const HM_TOAST_EVENT = 'hm:toast'
// opts.sticky → the prominent centered style with a ✕ to dismiss.
// opts.duration → ms before it auto-hides (omit/0 for the default short toast;
// a sticky toast with no duration stays until the ✕ is tapped).
// opts.kind → optional leading icon: 'progress' (spinner) | 'success' | 'error'.
// opts.actionLabel / opts.onAction → optional inline action (for example Undo).
export const fireToast = (msg, opts) =>
  window.dispatchEvent(
    new CustomEvent(HM_TOAST_EVENT, {
      detail: opts
        ? {
            msg,
            sticky: !!opts.sticky,
            duration: opts.duration,
            kind: opts.kind,
            actionLabel: opts.actionLabel,
            onAction: opts.onAction
          }
        : msg
    })
  )

// Copy text to the clipboard and toast `doneMsg` on success. Desktop writes via
// Electron's main process because navigator.clipboard can be denied for a
// packaged file:// renderer; mobile/web builds fall back to the Web API.
export const copyToClipboard = async (text, doneMsg) => {
  try {
    const value = text || ''
    if (window.api?.copyText) {
      const copied = await window.api.copyText(value)
      if (!copied) return false
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
    } else {
      return false
    }
    fireToast(doneMsg)
    return true
  } catch {
    return false
  }
}
