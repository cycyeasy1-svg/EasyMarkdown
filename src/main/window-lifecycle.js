export function shouldCreateMainWindow({ isReady, windowExists, isDestroyed }) {
  return !!isReady && (!windowExists || !!isDestroyed)
}
