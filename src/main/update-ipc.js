export const LATEST_RELEASE_API =
  'https://api.github.com/repos/cycyeasy1-svg/EasyMarkdown/releases/latest'
export const RELEASES_URL = 'https://github.com/cycyeasy1-svg/EasyMarkdown/releases'

const REQUEST_OPTIONS = {
  headers: {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'EasyMarkdown-Updater'
  }
}
// Notify-only update check. fetchRelease is injected because production must
// use Electron net.fetch while unit tests must not load the Electron runtime.
export async function checkForUpdate({ fetchRelease, getCurrentVersion }) {
  try {
    const response = await fetchRelease(LATEST_RELEASE_API, REQUEST_OPTIONS)
    if (!response.ok) return { ok: false }
    const data = await response.json()
    return {
      ok: true,
      latest: String(data.tag_name || '').replace(/^v/i, ''),
      current: getCurrentVersion(),
      url: data.html_url || RELEASES_URL,
      name: typeof data.name === 'string' ? data.name : '',
      // Keep an unexpectedly large release body from bloating the IPC payload.
      notes: typeof data.body === 'string' ? data.body.slice(0, 4000) : ''
    }
  } catch {
    return { ok: false }
  }
}

export function registerUpdateIpc({ ipcMain, fetchRelease, getCurrentVersion }) {
  ipcMain.handle('update:check', () => checkForUpdate({ fetchRelease, getCurrentVersion }))
  return () => ipcMain.removeHandler('update:check')
}
