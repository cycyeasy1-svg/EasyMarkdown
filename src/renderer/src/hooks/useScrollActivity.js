import { useEffect } from 'react'

const DEFAULT_IDLE_MS = 900

/**
 * Reveals a themed scrollbar while its surface is moving, then restores the
 * app-wide auto-hidden state after scrolling stops.
 */
export function useScrollActivity(idleMs = DEFAULT_IDLE_MS) {
  useEffect(() => {
    const hideTimers = new Map()
    const revealScrollbar = (event) => {
      const scroller = event.target instanceof Element ? event.target : document.scrollingElement
      if (!scroller) return

      scroller.classList.add('hm-scroll-active')
      clearTimeout(hideTimers.get(scroller))
      hideTimers.set(
        scroller,
        window.setTimeout(() => {
          scroller.classList.remove('hm-scroll-active')
          hideTimers.delete(scroller)
        }, idleMs)
      )
    }

    // Capture phase covers nested surfaces because scroll events do not bubble.
    document.addEventListener('scroll', revealScrollbar, true)
    return () => {
      document.removeEventListener('scroll', revealScrollbar, true)
      for (const [scroller, timer] of hideTimers) {
        clearTimeout(timer)
        scroller.classList.remove('hm-scroll-active')
      }
      hideTimers.clear()
    }
  }, [idleMs])
}
