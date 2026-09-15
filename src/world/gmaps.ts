/**
 * Google 地圖連結解析（4.6 步驟 1）。
 * 座標依序試 `!3d…!4d…` → `@lat,lng` → `?q=/ll=/daddr=/center=`；也接受直接貼「lat,lng」。
 * 縮短連結（maps.app.goo.gl / goo.gl/maps）展不開，回傳 reason: 'short'。
 */
export type ParseResult =
  | { ok: true; lat: number; lng: number; name: string | null }
  | { ok: false; reason: 'empty' | 'short' | 'no-coords' }

const LATLNG_RE = /(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/
const BARE_LATLNG_RE = /^-?\d{1,2}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/

export function parseGoogleMapsLink(raw: string): ParseResult {
  const input = raw.trim()
  if (!input) return { ok: false, reason: 'empty' }

  // 直接貼座標
  if (BARE_LATLNG_RE.test(input)) {
    const m = input.match(LATLNG_RE)!
    return finish(Number(m[1]), Number(m[2]), null)
  }

  if (/(?:^|\/\/)(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/maps)/i.test(input)) {
    return { ok: false, reason: 'short' }
  }

  let url: URL | null = null
  try {
    url = new URL(input.startsWith('http') ? input : `https://${input}`)
  } catch {
    url = null
  }
  const text = safeDecode(url ? url.href : input)

  let name: string | null = null
  const place = text.match(/\/place\/([^/?#]+)/)
  if (place) name = place[1].replace(/\+/g, ' ').trim() || null

  // 1. !3d…!4d…（實際標記座標，最準）
  let m = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  if (m) return finish(Number(m[1]), Number(m[2]), name)

  // 2. @lat,lng（視窗中心）
  m = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (m) return finish(Number(m[1]), Number(m[2]), name)

  // 3. ?q= / ll= / daddr= / center=
  if (url) {
    for (const key of ['q', 'll', 'daddr', 'center', 'query']) {
      const v = url.searchParams.get(key)
      if (!v) continue
      const c = v.match(LATLNG_RE)
      if (c) return finish(Number(c[1]), Number(c[2]), name ?? nameFromQuery(v))
      if (!name && key === 'q') name = nameFromQuery(v)
    }
  }

  return { ok: false, reason: 'no-coords' }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

function nameFromQuery(v: string): string | null {
  const s = v.replace(/\+/g, ' ').trim()
  return s && !LATLNG_RE.test(s) ? s : null
}

function finish(lat: number, lng: number, name: string | null): ParseResult {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { ok: false, reason: 'no-coords' }
  }
  return { ok: true, lat, lng, name }
}
