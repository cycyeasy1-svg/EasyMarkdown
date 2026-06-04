import { useMemo } from 'react'
import { useI18n } from '../i18n.jsx'

export function parseHeadings(md) {
  const lines = (md || '').split('\n')
  const out = []
  let inFence = false
  let fence = ''
  lines.forEach((line) => {
    const fm = line.match(/^(\s*)(```+|~~~+)/)
    if (fm) {
      const marker = fm[2][0]
      if (!inFence) {
        inFence = true
        fence = marker
      } else if (marker === fence) {
        inFence = false
      }
      return
    }
    if (inFence) return
    const hm = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (hm) out.push({ level: hm[1].length, text: hm[2].trim() })
  })
  return out
}

export default function Outline({ content, onJump }) {
  const { t } = useI18n()
  const headings = useMemo(() => parseHeadings(content), [content])
  return (
    <div className="outline">
      <div className="panel-head">{t('outline.title')}</div>
      <div className="outline-list">
        {headings.length === 0 ? (
          <div className="outline-empty">{t('outline.empty')}</div>
        ) : (
          headings.map((h, i) => (
            <div
              key={i}
              className={`outline-item lvl-${h.level}`}
              style={{ paddingLeft: 12 + (h.level - 1) * 12 }}
              onClick={() => onJump(i)}
              title={h.text}
            >
              {h.text}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
