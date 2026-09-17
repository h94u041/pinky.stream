/** D1 列 → API 形狀（與前端 src/world/types.ts 對齊） */

export interface TorchRow {
  id: string
  merchant_id: string | null
  name: string
  x: number
  y: number
  base_r: number
  lit: number
  burn_hours: number | null
  lit_at: number | null
  temporary: number
  created_at: number
}

export interface HoldingRow {
  id: string
  torch_id: string
  title: string
  start_at: number
  capacity: number
  entry: string | null
  tasks: string
  created_at: number
}

export interface SupplyRow {
  id: string
  torch_id: string
  x: number
  y: number
  kind: string
  label: string
  rare: number
  total: number
  remaining: number
  per_person: number
  requirement: string
  created_at: number
}

export interface GatheringRow {
  id: string
  host_commit: string
  title: string
  place_name: string
  district: string | null
  x: number
  y: number
  lat: number
  lng: number
  start_at: number
  deadline: number
  built_in: number
  cap: number | null
  need_more: number
  passphrase: string
  host_pays: number
  status: 'pending' | 'formed' | 'dissolved' | 'ended'
  torch_id: string | null
  temp_torch_id: string | null
  completed: number
  dissolved_at: number | null
  created_at: number
}

export function torchRow(r: TorchRow) {
  return {
    id: r.id,
    name: r.name,
    ownerId: r.merchant_id ?? '',
    x: r.x,
    y: r.y,
    baseR: r.base_r,
    eff: r.base_r,
    lit: !!r.lit,
    temporary: !!r.temporary,
    burnHours: r.burn_hours,
    litAt: r.lit_at,
  }
}

export function holdingRow(r: HoldingRow, joined: number) {
  return {
    id: r.id,
    torchId: r.torch_id,
    title: r.title,
    startAt: r.start_at,
    capacity: r.capacity,
    joined,
    entry: r.entry,
    tasks: JSON.parse(r.tasks) as { id: string; label: string; reward: string }[],
  }
}

export function supplyRow(r: SupplyRow) {
  return {
    id: r.id,
    torchId: r.torch_id,
    x: r.x,
    y: r.y,
    kind: r.kind,
    label: r.label,
    rare: !!r.rare,
    total: r.total,
    remaining: r.remaining,
    perPerson: r.per_person,
    requirement: r.requirement,
  }
}

/** 公開形狀：不含密語、不含主辦承諾值、不含誰加入。isHost 只對本人為真。 */
export function gatheringRow(r: GatheringRow, joins: number, me: string | null) {
  return {
    id: r.id,
    isHost: !!me && r.host_commit === me,
    title: r.title,
    placeName: r.place_name,
    district: r.district,
    x: r.x,
    y: r.y,
    lat: r.lat,
    lng: r.lng,
    startAt: r.start_at,
    deadline: r.deadline,
    builtIn: r.built_in,
    cap: r.cap,
    needMore: r.need_more,
    hostPays: !!r.host_pays,
    status: r.status,
    torchId: r.torch_id,
    tempTorchId: r.temp_torch_id,
    completedByHost: !!r.completed,
    /** 已加入人數 = 內建人數 + 後來加入的人 */
    joinedCount: r.built_in + Math.max(0, joins - 1),
    dissolvedAt: r.dissolved_at,
  }
}
