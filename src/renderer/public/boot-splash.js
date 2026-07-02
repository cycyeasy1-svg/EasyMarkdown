;(function () {
  const SESSION_KEY = 'easymarkdown.session.v1'

  const BOOT_STRINGS = {
    en: {
      subtitle: 'Starting editor...',
      aria: 'Starting EasyMarkdown'
    },
    zh: {
      subtitle: '\u542f\u52a8\u7f16\u8f91\u5668\u4e2d...',
      aria: 'EasyMarkdown \u6b63\u5728\u542f\u52a8'
    },
    ja: {
      subtitle: '\u30a8\u30c7\u30a3\u30bf\u3092\u8d77\u52d5\u4e2d...',
      aria: 'EasyMarkdown \u3092\u8d77\u52d5\u4e2d'
    }
  }

  function normalizeLang(value) {
    const lang = String(value || '')
    if (/^zh/i.test(lang)) return 'zh'
    if (/^ja/i.test(lang)) return 'ja'
    if (/^en/i.test(lang)) return 'en'
    return ''
  }

  function browserLang() {
    try {
      return normalizeLang(navigator.language)
    } catch {
      return ''
    }
  }

  function storedLang() {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}')
      return normalizeLang(session.lang)
    } catch {
      return ''
    }
  }

  const lang = storedLang() || browserLang() || 'zh'
  const strings = BOOT_STRINGS[lang] || BOOT_STRINGS.zh

  document.documentElement.lang = lang
  document.getElementById('hm-boot-splash')?.setAttribute('aria-label', strings.aria)

  const subtitle = document.querySelector('.hm-boot-subtitle')
  if (subtitle) subtitle.textContent = strings.subtitle
})()
