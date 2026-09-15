/** 代號「薄荷#4172」：暱稱庫 + 4 位數。裝置本機生成，不上傳。 */
const WORDS = [
  '薄荷', '海鹽', '橘皮', '苔蘚', '琥珀', '雨聲', '夜鷺', '藍蝶', '木炭', '霧燈',
  '銀杏', '風鈴', '砂糖', '烏龍', '月見', '山椒', '紙鶴', '流星', '露水', '灰貓',
]

/** 徽章庫（§3 名詞表：性別／貓罐頭製造機／藍蝶等，暱稱庫帶入） */
export const BADGE_POOL = ['真人', '年滿 18', '貓罐頭製造機', '藍蝶', '夜貓', '早鳥'] as const
export type Badge = (typeof BADGE_POOL)[number]

export function randomCodename(rng: () => number = Math.random): string {
  const w = WORDS[Math.floor(rng() * WORDS.length)]
  const n = 1000 + Math.floor(rng() * 9000)
  return `${w}#${n}`
}

/** 4.8：每個密語附加號碼，如 A1C，用來認第幾號。 */
export function passphraseSuffix(rng: () => number = Math.random): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const D = '0123456789'
  const pick = (s: string) => s[Math.floor(rng() * s.length)]
  return pick(A) + pick(D) + pick(A)
}

const PASS_HINTS = [
  '今天有帶傘', '我不喝甜的', '路口的燈壞了', '第三顆鈕扣', '貓在窗台上',
  '昨天沒下雨', '左邊那杯是我的', '這首歌我聽過', '月亮很圓', '襪子不成對',
]
export function randomPassphrase(rng: () => number = Math.random): string {
  return PASS_HINTS[Math.floor(rng() * PASS_HINTS.length)]
}

/** 4.10：只上傳 commit = H(sk‖salt)。原型用 SubtleCrypto 做 SHA-256。 */
export async function commitOf(sk: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${sk}‖${salt}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function uid(prefix = ''): string {
  return prefix + randomHex(6)
}
