import { STRINGS } from '../src/renderer/src/i18n-strings.js'
import { validateI18nCatalogs } from '../src/shared/i18n-contract.js'

const errors = validateI18nCatalogs(STRINGS)
if (errors.length) {
  console.error(`[i18n] ${errors.length} error(s)`)
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  console.log(
    `[i18n] ${Object.keys(STRINGS).length} locales / ${Object.keys(STRINGS.en).length} keys: OK`
  )
}
