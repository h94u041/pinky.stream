import { createI18n } from 'vue-i18n'
import en from './en'
import zhTW from './zh-TW'

export type Locale = 'zh-TW' | 'en'
const LOCALE_KEY = 'pinky.locale'

/** 自配適瀏覽器語言：中文一律 zh-TW，其餘英文；使用者手動切換後記住。 */
export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_KEY)
    if (saved === 'zh-TW' || saved === 'en') return saved
  } catch {
    /* ignore */
  }
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const l of langs) {
    if (/^zh/i.test(l)) return 'zh-TW'
    if (/^en/i.test(l)) return 'en'
  }
  return 'zh-TW'
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'zh-TW',
  messages: { 'zh-TW': zhTW, en },
})

export function setLocale(l: Locale) {
  i18n.global.locale.value = l
  document.documentElement.lang = l
  try {
    localStorage.setItem(LOCALE_KEY, l)
  } catch {
    /* ignore */
  }
}
