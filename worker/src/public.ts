/**
 * 對外（搜尋引擎、AI、MCP）可見的資料：只有店家端內容——火把、Holding Group、物資。
 * 自發聚集、燈下的人、承諾值一律不在這裡（memo2 §7）。
 */
import { toLatLng } from '../../src/world/geo'
import { lightRadius } from '../../src/world/rules'
import { crowdOf, effectiveTarget } from '../../src/world/torch'
import { holdingRow, supplyRow, torchRow, type HoldingRow, type SupplyRow, type TorchRow } from './rows'

export const SITE = 'https://pinky.stream'

export interface PublicTorch {
  id: string
  name: string
  lat: number
  lng: number
  lit: boolean
  effR: number
  baseR: number
  hoursLeft: number | null
  url: string
}
export interface PublicHolding {
  id: string
  torchId: string
  torchName: string
  title: string
  startAt: number
  capacity: number
  joined: number
  entry: string | null
  tasks: { id: string; label: string; reward: string }[]
  lightR: number
  lat: number
  lng: number
  url: string
}
export interface PublicSupply {
  id: string
  torchId: string
  torchName: string
  label: string
  kind: string
  rare: boolean
  remaining: number
  requirement: string
}

export async function loadPublic(db: D1Database) {
  const now = Date.now()
  const [t, h, s, j] = await Promise.all([
    db.prepare('SELECT * FROM torches WHERE temporary = 0').all<TorchRow>(),
    db.prepare('SELECT * FROM holdings ORDER BY start_at').all<HoldingRow>(),
    db.prepare('SELECT * FROM supplies WHERE remaining > 0').all<SupplyRow>(),
    db.prepare('SELECT holding_id, COUNT(*) AS n FROM holding_joins GROUP BY holding_id').all<{ holding_id: string; n: number }>(),
  ])
  const torchList = t.results.map(torchRow)
  for (const tr of torchList) tr.eff = tr.lit ? effectiveTarget(tr.baseR, crowdOf(tr, torchList)) : tr.baseR
  const torches: PublicTorch[] = torchList.map((tr) => {
    const { lat, lng } = toLatLng(tr.x, tr.y)
    const hoursLeft = tr.lit && tr.burnHours !== null && tr.litAt !== null ? Math.max(0, (tr.litAt + tr.burnHours * 3_600_000 - now) / 3_600_000) : null
    return { id: tr.id, name: tr.name, lat: +lat.toFixed(5), lng: +lng.toFixed(5), lit: tr.lit, effR: Math.round(tr.eff), baseR: tr.baseR, hoursLeft: hoursLeft === null ? null : +hoursLeft.toFixed(1), url: `${SITE}/torch/${tr.id}` }
  })
  const byId = new Map(torches.map((x) => [x.id, x]))
  const jc = new Map(j.results.map((r) => [r.holding_id, r.n]))
  const holdings: PublicHolding[] = h.results
    .map((r) => holdingRow(r, jc.get(r.id) ?? 0))
    .filter((x) => byId.has(x.torchId))
    .map((x) => {
      const tr = byId.get(x.torchId)!
      return { ...x, torchName: tr.name, lightR: Math.round(lightRadius(x.joined)), lat: tr.lat, lng: tr.lng, url: `${SITE}/event/${x.id}` }
    })
  const supplies: PublicSupply[] = s.results
    .map(supplyRow)
    .filter((x) => byId.has(x.torchId))
    .map((x) => ({ id: x.id, torchId: x.torchId, torchName: byId.get(x.torchId)!.name, label: x.label, kind: x.kind, rare: x.rare, remaining: x.remaining, requirement: x.requirement }))
  return { now, torches, holdings, supplies }
}

export type PublicWorld = Awaited<ReturnType<typeof loadPublic>>

/** 台北時間 ISO 8601（Event JSON-LD 用） */
export function isoTaipei(ts: number): string {
  const d = new Date(ts + 8 * 3_600_000)
  return d.toISOString().replace(/\.\d{3}Z$/, '+08:00')
}

export function fmtTaipei(ts: number): string {
  const d = new Date(ts + 8 * 3_600_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
}
