// @ts-check

// Persisted renderer session boundary. Keep this module dependency-free so its
// data-loss rules can be checked with JSDoc/TypeScript and unit tests without
// importing React or Electron.

/**
 * @typedef {{
 *   path?: string | null,
 *   title?: string,
 *   content?: string,
 *   savedContent?: string,
 *   pinned?: boolean,
 *   preview?: boolean
 * }} SessionTab
 * @typedef {{title: string, content: string}} UntitledDraft
 * @typedef {{
 *   openPaths: string[],
 *   pinnedPaths: string[],
 *   previewPaths: string[],
 *   untitled: UntitledDraft[]
 * }} SessionTabSnapshot
 * @typedef {{
 *   workspaces?: unknown,
 *   theme?: unknown,
 *   customTheme?: unknown,
 *   lang?: unknown,
 *   recents?: unknown,
 *   sidebarOpen?: unknown,
 *   sidebarMode?: unknown,
 *   sidebarWidth?: unknown,
 *   closedTabs?: unknown,
 *   activePath?: unknown,
 *   openPaths?: string[],
 *   pinnedPaths?: string[],
 *   previewPaths?: string[],
 *   untitled?: UntitledDraft[]
 * }} PersistedSession
 */

export const LS = 'easymarkdown.session.v1'

/** @returns {PersistedSession} */
export function loadSession() {
  try {
    const raw = localStorage.getItem(LS)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

// Build the persistable tab slices of a session snapshot from the live tabs.
//   • openPaths   — every saved tab's path (reopened from disk on restart).
//   • pinnedPaths — the pinned subset, so pins survive a restart (order comes
//     from openPaths; this is just the membership set).
//   • previewPaths — file-tree preview tabs, so the temporary slot remains a
//     preview after restart instead of silently becoming a normal tab.
//   • untitled    — unsaved scratch/new tabs (no path) kept ONLY when they're
//     DIRTY and non-blank, carrying just {title, content}. So a restart restores
//     real unsaved work but never resurrects the untouched welcome doc or an
//     empty new tab (content === savedContent, or whitespace-only → dropped).
//
// @param stays optional because startup and recovery callers deliberately pass
// undefined while reconstructing an empty session.
/**
 * @param {SessionTab[] | null | undefined} tabs
 * @returns {SessionTabSnapshot}
 */
export const buildSessionTabs = (tabs) => ({
  openPaths: (tabs || []).map((tab) => tab.path).filter((path) => typeof path === 'string'),
  pinnedPaths: (tabs || [])
    .filter((tab) => tab.pinned && tab.path)
    .map((tab) => /** @type {string} */ (tab.path)),
  previewPaths: (tabs || [])
    .filter((tab) => tab.preview && !tab.pinned && tab.path)
    .map((tab) => /** @type {string} */ (tab.path)),
  untitled: (tabs || [])
    .filter(
      (tab) =>
        !tab.path &&
        tab.content !== tab.savedContent &&
        typeof tab.content === 'string' &&
        tab.content.trim()
    )
    .map((tab) => ({
      title: typeof tab.title === 'string' ? tab.title : 'Untitled',
      content: /** @type {string} */ (tab.content)
    }))
})

/**
 * Field-wise equality of two session snapshots. Rebuilt tab arrays compare by
 * value; state-owned arrays compare by identity so a conservative false result
 * causes at most one extra localStorage write.
 *
 * @param {PersistedSession | null | undefined} a
 * @param {PersistedSession | null | undefined} b
 * @returns {boolean}
 */
export const sessionSnapshotEqual = (a, b) => {
  if (!a || !b) return false
  if (
    a.workspaces !== b.workspaces ||
    a.theme !== b.theme ||
    a.customTheme !== b.customTheme ||
    a.lang !== b.lang ||
    a.recents !== b.recents ||
    a.sidebarOpen !== b.sidebarOpen ||
    a.sidebarMode !== b.sidebarMode ||
    a.sidebarWidth !== b.sidebarWidth ||
    a.closedTabs !== b.closedTabs ||
    a.activePath !== b.activePath
  ) {
    return false
  }
  const ap = a.openPaths || []
  const bp = b.openPaths || []
  if (ap.length !== bp.length) return false
  for (let i = 0; i < ap.length; i++) if (ap[i] !== bp[i]) return false
  const app = a.pinnedPaths || []
  const bpp = b.pinnedPaths || []
  if (app.length !== bpp.length) return false
  for (let i = 0; i < app.length; i++) if (app[i] !== bpp[i]) return false
  const avp = a.previewPaths || []
  const bvp = b.previewPaths || []
  if (avp.length !== bvp.length) return false
  for (let i = 0; i < avp.length; i++) if (avp[i] !== bvp[i]) return false
  const au = a.untitled || []
  const bu = b.untitled || []
  if (au.length !== bu.length) return false
  for (let i = 0; i < au.length; i++) {
    if (au[i].title !== bu[i].title || au[i].content !== bu[i].content) return false
  }
  return true
}
