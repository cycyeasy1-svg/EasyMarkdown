// @ts-check

/**
 * @param {string} value
 * @returns {string[]}
 */
export function extractPlaceholders(value) {
  return [...new Set([...String(value).matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]))]
    .sort()
}

/**
 * Validate locale key parity and interpolation placeholders against one source
 * locale. Translation wording is a review concern; key/placeholder drift is a
 * deterministic contract failure.
 *
 * @param {Record<string, Record<string, unknown>>} catalogs
 * @param {string} [baseLocale]
 * @returns {string[]}
 */
export function validateI18nCatalogs(catalogs, baseLocale = 'en') {
  const errors = []
  const base = catalogs?.[baseLocale]
  if (!base || typeof base !== 'object') {
    return [`i18n: source locale "${baseLocale}" が存在しません`]
  }

  const baseKeys = Object.keys(base).sort()
  const baseKeySet = new Set(baseKeys)
  for (const locale of Object.keys(catalogs).sort()) {
    const catalog = catalogs[locale]
    if (!catalog || typeof catalog !== 'object') {
      errors.push(`i18n: locale "${locale}" は object ではありません`)
      continue
    }

    const localeKeys = Object.keys(catalog).sort()
    const localeKeySet = new Set(localeKeys)
    for (const key of baseKeys) {
      if (!localeKeySet.has(key)) {
        errors.push(`i18n: locale "${locale}" に key "${key}" がありません`)
        continue
      }
      const sourceValue = base[key]
      const localizedValue = catalog[key]
      if (typeof sourceValue !== 'string') {
        errors.push(`i18n: source key "${key}" は string ではありません`)
        continue
      }
      if (typeof localizedValue !== 'string') {
        errors.push(`i18n: locale "${locale}" の key "${key}" は string ではありません`)
        continue
      }
      const sourcePlaceholders = extractPlaceholders(sourceValue)
      const localizedPlaceholders = extractPlaceholders(localizedValue)
      if (sourcePlaceholders.join('\0') !== localizedPlaceholders.join('\0')) {
        errors.push(
          `i18n: locale "${locale}" の key "${key}" placeholder が一致しません ` +
          `(source: ${sourcePlaceholders.join(', ') || '-'} / locale: ${localizedPlaceholders.join(', ') || '-'})`
        )
      }
    }
    for (const key of localeKeys) {
      if (!baseKeySet.has(key)) {
        errors.push(`i18n: locale "${locale}" に source 未定義の key "${key}" があります`)
      }
    }
  }
  return errors
}
