// Characterization tests for the pure mermaid-detection export. The rendering /
// LRU cache (getMermaidSvg / peekMermaidSvg) needs the mermaid lib + a browser,
// so it's out of scope here; startsAsMermaid is the pure gate that decides
// whether pasted/typed text is treated as a diagram, and it's easy to get wrong
// because DIAGRAM_HEADER is a /g regex (stateful lastIndex).
import { describe, it, expect } from 'vitest'
import { startsAsMermaid, peekMermaidSvg } from '../src/renderer/src/components/editor-mermaid.js'

describe('startsAsMermaid', () => {
  it('recognizes common diagram headers at the very start', () => {
    expect(startsAsMermaid('graph TD\nA-->B')).toBe(true)
    expect(startsAsMermaid('flowchart LR')).toBe(true)
    expect(startsAsMermaid('sequenceDiagram')).toBe(true)
    expect(startsAsMermaid('classDiagram')).toBe(true)
    expect(startsAsMermaid('stateDiagram-v2')).toBe(true)
    expect(startsAsMermaid('gantt')).toBe(true)
  })
  it('ignores leading whitespace but requires the header at position 0 of the trimmed text', () => {
    expect(startsAsMermaid('   \n  flowchart TD')).toBe(true)
    expect(startsAsMermaid('intro text\nflowchart TD')).toBe(false)
  })
  it('is false for non-diagram text and empty input', () => {
    expect(startsAsMermaid('# just a heading')).toBe(false)
    expect(startsAsMermaid('')).toBe(false)
    expect(startsAsMermaid(null)).toBe(false)
    expect(startsAsMermaid('   ')).toBe(false)
  })
  it('does not require a diagram keyword to be a standalone word boundary trap', () => {
    // "ganttery" must not match as "gantt" — the header needs a following
    // whitespace or end-of-string (the (?=\\s|$) lookahead in DIAGRAM_HEADER).
    expect(startsAsMermaid('ganttery is not a diagram')).toBe(false)
  })
  it('is stable across repeated calls (the /g regex lastIndex is reset each time)', () => {
    // A /g regex keeps lastIndex between exec() calls; if startsAsMermaid forgot
    // to reset it, the 2nd identical call could miss. Lock that it never does.
    const s = 'sequenceDiagram\nAlice->>Bob: hi'
    expect(startsAsMermaid(s)).toBe(true)
    expect(startsAsMermaid(s)).toBe(true)
    expect(startsAsMermaid(s)).toBe(true)
  })
})

describe('peekMermaidSvg', () => {
  it('returns null for an uncached diagram (sync miss, no throw)', () => {
    expect(peekMermaidSvg('graph TD\nA-->B', 'light')).toBe(null)
  })
})
