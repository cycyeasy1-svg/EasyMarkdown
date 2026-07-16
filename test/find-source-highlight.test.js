// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSourceFindHighlight, paintSourceFindHighlight } from '../src/renderer/src/find.js'

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('source find highlight geometry cache', () => {
  it('repositions cached geometry on scroll and only remeasures on layout changes', () => {
    vi.useFakeTimers()
    const frames = new Map()
    let nextFrame = 1
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextFrame++
      frames.set(id, callback)
      return id
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id))
    const flushFrame = () => {
      const entry = frames.entries().next().value
      expect(entry).toBeTruthy()
      const [id, callback] = entry
      frames.delete(id)
      callback(16)
    }

    const textarea = document.createElement('textarea')
    textarea.className = 'source-editor'
    textarea.value = 'alpha beta gamma\nsecond line'
    Object.defineProperty(textarea, 'clientWidth', { configurable: true, value: 500 })
    textarea.getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 300 })
    document.body.appendChild(textarea)

    const appendChild = document.body.appendChild.bind(document.body)
    let mirrorMeasurements = 0
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLDivElement && node.style.visibility === 'hidden') mirrorMeasurements++
      return appendChild(node)
    })

    paintSourceFindHighlight(textarea, 6, 10)
    expect(mirrorMeasurements).toBe(1)

    textarea.dispatchEvent(new Event('scroll'))
    flushFrame()
    vi.advanceTimersByTime(100)
    expect(mirrorMeasurements).toBe(1)

    textarea.dispatchEvent(new Event('hm:source-layout'))
    flushFrame()
    expect(mirrorMeasurements).toBe(2)

    textarea.dispatchEvent(new Event('input'))
    flushFrame()
    expect(mirrorMeasurements).toBe(3)

    window.dispatchEvent(new Event('resize'))
    flushFrame()
    expect(mirrorMeasurements).toBe(4)

    paintSourceFindHighlight(textarea, 11, 16)
    expect(mirrorMeasurements).toBe(5)
    clearSourceFindHighlight(textarea)
  })
})
