import { useEffect, useState } from 'react'

const QUERY = '(prefers-color-scheme: dark)'

function readSystemScheme() {
  return typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches
}

export function useSystemColorScheme() {
  const [isDark, setIsDark] = useState(readSystemScheme)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const media = window.matchMedia(QUERY)
    const update = (event) => setIsDark(event.matches)
    setIsDark(media.matches)
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update)
      return () => media.removeEventListener('change', update)
    }
    media.addListener(update)
    return () => media.removeListener(update)
  }, [])

  return isDark
}
