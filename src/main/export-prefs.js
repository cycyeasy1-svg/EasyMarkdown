import fs from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { resolveSaveDir, withRecordedSaveDir } from './export-prefs-logic.js'

const FILE = 'export-prefs.json'
let cache = null
let loadPromise = null
let writeQueue = Promise.resolve()
const filePath = () => join(app.getPath('userData'), FILE)

async function load() {
  if (cache) return cache
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const parsed = JSON.parse(await fs.readFile(filePath(), 'utf8'))
        cache = {
          saveDirs: parsed?.saveDirs && typeof parsed.saveDirs === 'object'
            ? Object.fromEntries(Object.entries(parsed.saveDirs).filter(([, value]) => typeof value === 'string'))
            : {},
          lastSaveDir: typeof parsed?.lastSaveDir === 'string' ? parsed.lastSaveDir : ''
        }
      } catch {
        cache = { saveDirs: {}, lastSaveDir: '' }
      }
      return cache
    })()
  }
  return loadPromise
}

function persist(state) {
  const serialized = JSON.stringify(state, null, 2)
  writeQueue = writeQueue.then(() => fs.writeFile(filePath(), serialized, 'utf8').catch(() => {}))
  return writeQueue
}

export async function getSaveDirFor(sourcePath) {
  return resolveSaveDir(await load(), sourcePath)
}

export async function recordSaveDir(sourcePath, chosenDir) {
  cache = withRecordedSaveDir(await load(), sourcePath, chosenDir)
  await persist(cache)
}
