const NAVIGATION_MAX_AGE_MS = 1500

function navigationTargetFromSelection({
  kind,
  commandKind,
  selection,
  selectedText = '',
  at = Date.now()
}) {
  if (kind !== commandKind || !selection?.start || !selection?.end) return null
  const { start, end } = selection
  const isEmpty =
    selection.isEmpty ?? (start.line === end.line && start.character === end.character)
  const canRevealInKeep =
    !isEmpty &&
    start.line === end.line &&
    end.character - start.character <= 1000 &&
    !/[\r\n]/.test(selectedText)
  return {
    line: Math.max(0, start.line | 0),
    character: Math.max(0, start.character | 0),
    // Empty and long/multiline command targets are still navigation. Text is
    // optional because it is used only by the late Keep-mode reveal fallback.
    text: canRevealInKeep ? String(selectedText) : '',
    at
  }
}

function isRecentNavigationTarget(target, now = Date.now()) {
  return !!target && now >= target.at && now - target.at <= NAVIGATION_MAX_AGE_MS
}

// A Command-kind selection event is not, by itself, proof that the user opened
// a navigation target. VS Code also emits command-owned cursor restoration for
// some ordinary preview/reopen paths. Preserve source mode only when the target
// carries useful location information; line 0 / column 0 with no selected text
// is indistinguishable from a normal file open and should follow Keep preference.
function shouldPreserveSourceForNavigation(target, now = Date.now()) {
  if (!isRecentNavigationTarget(target, now)) return false
  return !!target.text || target.line > 0 || target.character > 0
}

module.exports = {
  NAVIGATION_MAX_AGE_MS,
  navigationTargetFromSelection,
  isRecentNavigationTarget,
  shouldPreserveSourceForNavigation
}
