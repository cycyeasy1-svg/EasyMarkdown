const DB_NAME = 'easymarkdown-web-lite'
const STORE_NAME = 'handles'
const LAST_WORKSPACE_KEY = 'last-workspace'

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore(mode, run) {
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode)
      const store = transaction.objectStore(STORE_NAME)
      const request = run(store)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}

export async function saveLastWorkspaceHandle(handle) {
  try {
    await withStore('readwrite', (store) => store.put(handle, LAST_WORKSPACE_KEY))
    return true
  } catch {
    return false
  }
}

export async function loadLastWorkspaceHandle() {
  try {
    return (await withStore('readonly', (store) => store.get(LAST_WORKSPACE_KEY))) || null
  } catch {
    return null
  }
}

export async function clearLastWorkspaceHandle() {
  try {
    await withStore('readwrite', (store) => store.delete(LAST_WORKSPACE_KEY))
  } catch {
    // Losing a convenience-only recent handle is harmless.
  }
}
