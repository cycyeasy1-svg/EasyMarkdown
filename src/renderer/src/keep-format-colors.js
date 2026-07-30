// Keep text colors are shared by the toolbar and the Keep renderer.
//
// Keep the existing base values stable: documents created by earlier builds use
// those exact hex values, and the renderer maps them back to the same semantic
// color classes when a document is reopened.

export const KEEP_TEXT_COLOR_GROUPS = [
  {
    id: 'neutral',
    labelKey: 'tb.textColor.group.neutral',
    columns: 4,
    colors: [
      { id: 'ink', value: '#24211f', labelKey: 'tb.textColor.ink' },
      { id: 'slate', value: '#475569', labelKey: 'tb.textColor.slate' },
      { id: 'gray', value: '#6b7280', labelKey: 'tb.textColor.gray' },
      { id: 'silver', value: '#9ca3af', labelKey: 'tb.textColor.silver' }
    ]
  },
  {
    id: 'theme',
    labelKey: 'tb.textColor.group.theme',
    columns: 6,
    colors: [
      {
        id: 'red-light',
        value: '#ef7d87',
        labelKey: 'tb.textColor.red',
        toneKey: 'tb.textColor.tone.light'
      },
      {
        id: 'orange-light',
        value: '#e99a5c',
        labelKey: 'tb.textColor.orange',
        toneKey: 'tb.textColor.tone.light'
      },
      {
        id: 'gold-light',
        value: '#d6aa2e',
        labelKey: 'tb.textColor.gold',
        toneKey: 'tb.textColor.tone.light'
      },
      {
        id: 'green-light',
        value: '#65a978',
        labelKey: 'tb.textColor.green',
        toneKey: 'tb.textColor.tone.light'
      },
      {
        id: 'blue-light',
        value: '#6c9fd0',
        labelKey: 'tb.textColor.blue',
        toneKey: 'tb.textColor.tone.light'
      },
      {
        id: 'purple-light',
        value: '#aa83cb',
        labelKey: 'tb.textColor.purple',
        toneKey: 'tb.textColor.tone.light'
      },
      {
        id: 'red',
        value: '#d94b5b',
        labelKey: 'tb.textColor.red',
        toneKey: 'tb.textColor.tone.standard'
      },
      {
        id: 'orange',
        value: '#c96a2b',
        labelKey: 'tb.textColor.orange',
        toneKey: 'tb.textColor.tone.standard'
      },
      {
        id: 'gold',
        value: '#a97800',
        labelKey: 'tb.textColor.gold',
        toneKey: 'tb.textColor.tone.standard'
      },
      {
        id: 'green',
        value: '#25845f',
        labelKey: 'tb.textColor.green',
        toneKey: 'tb.textColor.tone.standard'
      },
      {
        id: 'blue',
        value: '#3378c5',
        labelKey: 'tb.textColor.blue',
        toneKey: 'tb.textColor.tone.standard'
      },
      {
        id: 'purple',
        value: '#8559b5',
        labelKey: 'tb.textColor.purple',
        toneKey: 'tb.textColor.tone.standard'
      },
      {
        id: 'red-dark',
        value: '#8f2635',
        labelKey: 'tb.textColor.red',
        toneKey: 'tb.textColor.tone.dark'
      },
      {
        id: 'orange-dark',
        value: '#8d451e',
        labelKey: 'tb.textColor.orange',
        toneKey: 'tb.textColor.tone.dark'
      },
      {
        id: 'gold-dark',
        value: '#735300',
        labelKey: 'tb.textColor.gold',
        toneKey: 'tb.textColor.tone.dark'
      },
      {
        id: 'green-dark',
        value: '#1f5f43',
        labelKey: 'tb.textColor.green',
        toneKey: 'tb.textColor.tone.dark'
      },
      {
        id: 'blue-dark',
        value: '#205493',
        labelKey: 'tb.textColor.blue',
        toneKey: 'tb.textColor.tone.dark'
      },
      {
        id: 'purple-dark',
        value: '#5d3c80',
        labelKey: 'tb.textColor.purple',
        toneKey: 'tb.textColor.tone.dark'
      }
    ]
  }
]

export const KEEP_TEXT_COLORS = KEEP_TEXT_COLOR_GROUPS.flatMap((group) => group.colors)

const COLOR_BY_VALUE = new Map(
  KEEP_TEXT_COLORS.map((color) => [color.value.toLowerCase(), color])
)

export function keepTextColorByValue(value) {
  return COLOR_BY_VALUE.get(String(value || '').toLowerCase()) || null
}
