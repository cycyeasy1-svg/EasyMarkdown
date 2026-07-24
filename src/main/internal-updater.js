import electronUpdater from 'electron-updater'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { normalizeUpdateReleaseNotes, parseUpdateDistribution } from './helpers.js'

const { autoUpdater } = electronUpdater
const DISTRIBUTION_FILE = 'distribution.json'

function errorMessage(error) {
  return String(error?.message || error || 'Unknown update error').slice(0, 800)
}

function infoPayload(app, info, phase, extra = {}) {
  return {
    ok: true,
    internal: true,
    distribution: 'internal-demo',
    phase,
    current: app.getVersion(),
    latest: typeof info?.version === 'string' ? info.version : '',
    name: typeof info?.releaseName === 'string' ? info.releaseName : '',
    notes: normalizeUpdateReleaseNotes(info?.releaseNotes),
    ...extra
  }
}

async function readDistribution(app, resourcesPath) {
  // Development is disabled unless a developer explicitly supplies a marker
  // path. Packaged public builds only inspect their own resources directory.
  const explicitPath = !app.isPackaged
    ? process.env.EASYMARKDOWN_UPDATE_DISTRIBUTION_FILE
    : ''
  const file = explicitPath || join(resourcesPath, DISTRIBUTION_FILE)
  try {
    return parseUpdateDistribution(await fs.readFile(file, 'utf8'))
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('[updater] Distribution marker could not be read:', errorMessage(error))
    }
    return null
  }
}

export async function createInternalDemoUpdater({ app, resourcesPath, sendState }) {
  if (process.platform !== 'win32') return null
  const distribution = await readDistribution(app, resourcesPath)
  if (!distribution) return null

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.disableWebInstaller = true
  autoUpdater.logger = console

  let phase = 'idle'
  let latestInfo = null

  const emit = (next) => {
    phase = next.phase
    sendState?.(next)
  }

  autoUpdater.on('checking-for-update', () => {
    emit(infoPayload(app, latestInfo, 'checking'))
  })
  autoUpdater.on('update-available', (info) => {
    latestInfo = info
    emit(infoPayload(app, info, 'available'))
  })
  autoUpdater.on('update-not-available', (info) => {
    latestInfo = info
    emit(infoPayload(app, info, 'not-available'))
  })
  autoUpdater.on('download-progress', (progress) => {
    emit(infoPayload(app, latestInfo, 'downloading', {
      percent: Number.isFinite(progress?.percent) ? progress.percent : 0,
      transferred: Number.isFinite(progress?.transferred) ? progress.transferred : 0,
      total: Number.isFinite(progress?.total) ? progress.total : 0,
      bytesPerSecond: Number.isFinite(progress?.bytesPerSecond) ? progress.bytesPerSecond : 0
    }))
  })
  autoUpdater.on('update-downloaded', (info) => {
    latestInfo = info
    emit(infoPayload(app, info, 'downloaded', { percent: 100 }))
  })
  autoUpdater.on('error', (error) => {
    emit({
      ...infoPayload(app, latestInfo, 'error'),
      ok: false,
      error: errorMessage(error)
    })
  })

  return {
    distribution,
    get phase() {
      return phase
    },
    async checkForUpdates() {
      try {
        const result = await autoUpdater.checkForUpdates()
        const info = result?.updateInfo || latestInfo
        return infoPayload(app, info, info?.version === app.getVersion() ? 'not-available' : 'available')
      } catch (error) {
        return {
          ...infoPayload(app, latestInfo, 'error'),
          ok: false,
          error: errorMessage(error)
        }
      }
    },
    async downloadUpdate() {
      if (!latestInfo?.version) {
        return { ok: false, internal: true, error: 'No internal update is available.' }
      }
      if (phase === 'downloaded') return infoPayload(app, latestInfo, 'downloaded', { percent: 100 })
      try {
        phase = 'downloading'
        await autoUpdater.downloadUpdate()
        return infoPayload(app, latestInfo, phase, { percent: phase === 'downloaded' ? 100 : 0 })
      } catch (error) {
        return {
          ...infoPayload(app, latestInfo, 'error'),
          ok: false,
          error: errorMessage(error)
        }
      }
    },
    installDownloadedUpdate() {
      if (phase !== 'downloaded') {
        return { ok: false, internal: true, error: 'The internal update has not finished downloading.' }
      }
      try {
        // Demo installers are per-user NSIS builds, so the update can replace
        // the existing install silently and relaunch without a second wizard.
        autoUpdater.quitAndInstall(true, true)
        return { ok: true, internal: true }
      } catch (error) {
        return { ok: false, internal: true, error: errorMessage(error) }
      }
    }
  }
}
