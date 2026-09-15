import { useI18n } from 'vue-i18n'

export function useFmt() {
  const { t, locale } = useI18n()

  /** 剩餘時間：「12 分」／「3 小時 12 分」 */
  function left(ms: number): string {
    const m = Math.max(0, Math.ceil(ms / 60_000))
    if (m < 60) return t('time.min', { n: m })
    return t('time.hourMin', { h: Math.floor(m / 60), m: m % 60 })
  }

  function clock(ts: number): string {
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  function dayLabel(ts: number): string {
    const d = new Date(ts)
    const today = new Date()
    const same = d.toDateString() === today.toDateString()
    if (same) return t('time.today')
    const tmr = new Date(today)
    tmr.setDate(tmr.getDate() + 1)
    if (d.toDateString() === tmr.toDateString()) return t('time.tomorrow')
    return d.toLocaleDateString(locale.value)
  }

  function minutesAgo(ts: number, now: number): string {
    return t('time.minutesAgo', { n: Math.max(0, Math.floor((now - ts) / 60_000)) })
  }

  return { left, clock, dayLabel, minutesAgo }
}
