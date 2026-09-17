// 產生 worker/seed.sql：示範世界（台中幾個商圈的店家火把、Holding Group、物資）+ 一個示範店家帳號。
// 用法：DEMO_MERCHANT_PASSWORD=xxxx node worker/scripts/make-seed.mjs
//       node worker/seed.sql 之後用 `npm run db:seed`（本機）或 `npm run db:seed:remote` 套用。
import { writeFileSync } from 'node:fs'
import { webcrypto as crypto } from 'node:crypto'

const ORIGIN = { lat: 24.1477, lng: 120.6736 }
const M = 111320
const COS = Math.cos((ORIGIN.lat * Math.PI) / 180)
const toWorld = (lat, lng) => ({ x: (lng - ORIGIN.lng) * M * COS, y: -(lat - ORIGIN.lat) * M })
const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const now = Date.now()

const password = process.env.DEMO_MERCHANT_PASSWORD || [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, '0')).join('')
const salt = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('')
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100_000 }, key, 256)
const hash = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('')

const merchants = [
  { id: 't_haze', name: '霧室 Haze Room', lat: 24.1497, lng: 120.6849, baseR: 260, hours: 6 },
  { id: 't_jazz', name: '無名爵士', lat: 24.1509, lng: 120.664, baseR: 300, hours: 12 },
  { id: 't_audit', name: '審計小酒館', lat: 24.1466, lng: 120.6612, baseR: 240, hours: 6 },
  { id: 't_heron', name: '夜鷺茶屋', lat: 24.1445, lng: 120.6778, baseR: 220, hours: 6 },
  { id: 't_fengjia', name: '逢甲後巷', lat: 24.1789, lng: 120.6466, baseR: 300, hours: 12 },
  { id: 't_opera', name: '歌劇院旁', lat: 24.1622, lng: 120.6412, baseR: 260, hours: 12 },
  { id: 't_station', name: '車站前 Bar', lat: 24.138, lng: 120.6852, baseR: 220, hours: 6, lit: false },
]
const tonight = (h) => {
  const d = new Date()
  d.setHours(h, 0, 0, 0)
  if (d.getTime() < now) d.setDate(d.getDate() + 1)
  return d.getTime()
}
const tasks = JSON.stringify([
  { id: 't_checkin', label: '在門口感應報到', reward: '解鎖今晚的火把物資' },
  { id: 't_pass', label: '對店員說出密語', reward: '店家事件' },
  { id: 't_cheers', label: '跟一個陌生代號碰杯', reward: '完成任務' },
])

const lines = []
lines.push('-- 由 worker/scripts/make-seed.mjs 產生。示範店家帳號 demo@pinky.stream；密碼在產生時印在終端機。')
lines.push(`INSERT OR REPLACE INTO merchants (id, name, email, pass_hash, salt, created_at) VALUES ('m_demo', '示範店家', 'demo@pinky.stream', '${hash}', '${salt}', ${now});`)
for (const m of merchants) {
  const { x, y } = toWorld(m.lat, m.lng)
  const lit = m.lit === false ? 0 : 1
  lines.push(`INSERT OR REPLACE INTO torches (id, merchant_id, name, x, y, base_r, lit, burn_hours, lit_at, temporary, created_at) VALUES (${q(m.id)}, 'm_demo', ${q(m.name)}, ${x.toFixed(1)}, ${y.toFixed(1)}, ${m.baseR}, ${lit}, ${m.hours}, ${lit ? now : 'NULL'}, 0, ${now});`)
}
const holdings = [
  ['h_haze', 't_haze', '霧室・無聲舞會', 21, 20, '年滿 18'],
  ['h_jazz', 't_jazz', '週四無名爵士夜', 20, 24, '年滿 18'],
  ['h_fengjia', 't_fengjia', '後巷桌遊夜', 19, 12, null],
]
for (const [id, torch, title, hour, cap, entry] of holdings) {
  lines.push(`INSERT OR REPLACE INTO holdings (id, torch_id, title, start_at, capacity, entry, tasks, created_at) VALUES (${q(id)}, ${q(torch)}, ${q(title)}, ${tonight(hour)}, ${cap}, ${entry === null ? 'NULL' : q(entry)}, ${q(tasks)}, ${now});`)
}
const byId = Object.fromEntries(merchants.map((m) => [m.id, toWorld(m.lat, m.lng)]))
const supplies = [
  ['s_1', 't_haze', 120, -60, 'discount', '調酒 −35%', 0, 5, 'none'],
  ['s_2', 't_haze', -150, 90, 'lamp', '照明燈（探索範圍 +35%，1 小時）', 0, 5, 'none'],
  ['s_3', 't_haze', 40, 180, 'rare', '雙人招待 shot', 1, 2, 'reservation'],
  ['s_4', 't_jazz', -110, -80, 'discount', '爵士夜入場 −50%', 0, 5, 'none'],
  ['s_5', 't_jazz', 160, 40, 'arrow', '箭矢', 0, 5, 'none'],
  ['s_6', 't_audit', 60, -100, 'discount', '手沖免費升級', 0, 5, 'none'],
  ['s_7', 't_heron', -70, 60, 'arrow', '箭矢', 0, 5, 'none'],
  ['s_8', 't_heron', 130, -40, 'discount', '滷味第二份半價', 0, 5, 'none'],
  ['s_9', 't_fengjia', -140, 120, 'discount', '桌遊夜飲料券', 0, 5, 'none'],
  ['s_10', 't_fengjia', 90, -160, 'lamp', '照明燈（探索範圍 +35%，1 小時）', 0, 5, 'none'],
  ['s_11', 't_opera', 0, 150, 'rare', '歌劇院限定杯', 1, 3, 'reservation'],
]
for (const [id, torch, dx, dy, kind, label, rare, n, req] of supplies) {
  const p = byId[torch]
  lines.push(`INSERT OR REPLACE INTO supplies (id, torch_id, x, y, kind, label, rare, total, remaining, per_person, requirement, created_at) VALUES (${q(id)}, ${q(torch)}, ${(p.x + dx).toFixed(1)}, ${(p.y + dy).toFixed(1)}, ${q(kind)}, ${q(label)}, ${rare}, ${n}, ${n}, 1, ${q(req)}, ${now});`)
}
const far = toWorld(24.1405, 120.6905)
lines.push(`INSERT OR REPLACE INTO supplies (id, torch_id, x, y, kind, label, rare, total, remaining, per_person, requirement, created_at) VALUES ('s_far', 't_station', ${far.x.toFixed(1)}, ${far.y.toFixed(1)}, 'arrow', '箭矢', 0, 3, 3, 1, 'none', ${now});`)

writeFileSync(new URL('../seed.sql', import.meta.url), lines.join('\n') + '\n')
console.log(`worker/seed.sql written. Demo merchant: demo@pinky.stream / ${password}`)
